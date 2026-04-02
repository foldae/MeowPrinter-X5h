"""FastAPI web server — serves the frontend and exposes the printer REST API."""

from __future__ import annotations

import asyncio
import functools
import io
import json
import os
import sys
import webbrowser
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .driver import DriverError, ThermalDriver
from .imaging.badge import extract_badges
from .imaging.pdf import convert_pdf_to_pbm

from bleak.exc import BleakDBusError, BleakError


async def _in_thread(fn, *args, **kwargs):
    """Run a blocking function in a thread so it doesn't conflict with uvicorn's event loop."""
    return await asyncio.to_thread(functools.partial(fn, *args, **kwargs))

app = FastAPI(title="MeowPrinter", version="1.0.0")

# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------

_driver = ThermalDriver()

_settings: dict[str, Any] = {
    "config_path": "config.json",
    "version": 4,
    "first_run": True,
    "is_android": False,
    "scan_time": 12.0,
    "dry_run": False,
    "energy": 64,
    "quality": 36,
}

_SETTINGS_PRIVATE = {"printer", "is_android"}


def _config_path() -> str:
    return _settings.get("config_path", "config.json")


def _load_config() -> None:
    path = _config_path()
    if not os.path.exists(path):
        _save_config()
        return
    with open(path, "r", encoding="utf-8") as f:
        stored = json.load(f)
    if stored.get("version", 0) < _settings["version"]:
        _save_config()
        return
    _settings.update(stored)


def _save_config() -> None:
    path = _config_path()
    filtered = {k: v for k, v in _settings.items() if k not in _SETTINGS_PRIVATE}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(filtered, f, indent=4)


def _sync_driver() -> None:
    """Push current settings to the driver instance."""
    _driver.dry_run = bool(_settings.get("dry_run"))
    _driver.scan_time = float(_settings.get("scan_time", 12.0))
    _driver.fake = bool(_settings.get("fake"))
    energy = _settings.get("energy")
    if energy is not None:
        _driver.energy = int(energy) * 0x100
    quality = _settings.get("quality")
    if quality is not None:
        _driver.speed = int(quality)
    _driver.flip_h = bool(_settings.get("flip_h") or _settings.get("flip"))
    _driver.flip_v = bool(_settings.get("flip_v") or _settings.get("flip"))


# ---------------------------------------------------------------------------
# Error handler
# ---------------------------------------------------------------------------

def _error_response(name: str, detail: str, status: int = 500) -> JSONResponse:
    return JSONResponse({"name": name, "details": detail}, status_code=status)


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def _on_startup():
    _load_config()


@app.post("/api/print")
async def api_print(request: Request):
    body = await request.body()
    _sync_driver()
    try:
        await _in_thread(_driver.print_pbm, io.BytesIO(body))
    except (BleakError, BleakDBusError, DriverError) as exc:
        return _error_response(type(exc).__name__, str(exc))
    return JSONResponse({})


@app.post("/api/print-pdf")
async def api_print_pdf(request: Request):
    body = await request.body()
    if not body:
        return _error_response("invalid-pdf", "Empty PDF body", 400)
    _sync_driver()
    try:
        width = getattr(_driver.model, "paper_width", 384)
        bitmap, page_count = await _in_thread(convert_pdf_to_pbm, body, width)
        await _in_thread(_driver.print_pbm, io.BytesIO(bitmap))
    except DriverError as exc:
        return _error_response(exc.key, exc.detail)
    except (BleakError, BleakDBusError) as exc:
        return _error_response(type(exc).__name__, str(exc))
    return JSONResponse({"pages": page_count})


@app.post("/api/print-badge")
async def api_print_badge(request: Request):
    body = await request.body()
    content_type = request.headers.get("content-type", "")
    if not body:
        return _error_response("badge-error", "Empty body", 400)
    _sync_driver()
    try:
        width = getattr(_driver.model, "paper_width", 384)
        badges = await _in_thread(extract_badges, body, content_type, width)
    except DriverError as exc:
        return _error_response(exc.key, exc.detail)
    if not badges:
        return _error_response("badge-not-found", "No barcodes detected")
    try:
        for pbm in badges:
            await _in_thread(_driver.print_pbm, io.BytesIO(pbm))
    except (BleakError, BleakDBusError, DriverError) as exc:
        return _error_response(type(exc).__name__, str(exc))
    return JSONResponse({"badges": len(badges)})


@app.get("/api/devices")
async def api_devices(everything: bool = False):
    _sync_driver()
    try:
        await _in_thread(_driver.connect, None)
        found = await _in_thread(_driver.scan, everything=everything)
    except (BleakError, BleakDBusError) as exc:
        return _error_response(type(exc).__name__, str(exc))
    return JSONResponse({
        "devices": [{"name": d.name, "address": d.address} for d in found]
    })


@app.post("/api/connect")
async def api_connect(request: Request):
    data = await request.json()
    device_str = data.get("device", "")
    if "," not in device_str:
        return _error_response("bad-device", "Expected 'name,address'", 400)
    name, address = device_str.split(",", 1)
    try:
        await _in_thread(_driver.connect, name, address)
    except (BleakError, BleakDBusError, DriverError) as exc:
        return _error_response(type(exc).__name__, str(exc))
    return JSONResponse({})


@app.get("/api/settings")
async def api_get_settings():
    _load_config()
    return JSONResponse(_settings)


@app.put("/api/settings")
async def api_update_settings(request: Request):
    data = await request.json()
    _settings.update(data)
    _save_config()
    _sync_driver()
    return JSONResponse({})


@app.post("/api/exit")
async def api_exit():
    _save_config()
    await _in_thread(_driver.shutdown)
    import signal
    os.kill(os.getpid(), signal.SIGTERM)
    return JSONResponse({})


# ---------------------------------------------------------------------------
# Static file serving (built frontend)
# ---------------------------------------------------------------------------

_FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "dist"

if _FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(_FRONTEND_DIR), html=True), name="frontend")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def run(*, silent: bool = False, listen_all: bool = False) -> None:
    """Launch the server via uvicorn, opening the browser on desktop."""
    import uvicorn

    host, port = "127.0.0.1", 8095
    url = f"http://{host}:{port}/"

    if not silent:
        webbrowser.open(url)

    uvicorn.run(
        app,
        host="0.0.0.0" if listen_all else host,
        port=port,
        log_level="warning",
    )
