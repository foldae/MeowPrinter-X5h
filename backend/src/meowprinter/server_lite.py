"""Lightweight HTTP server using only Python stdlib.

Used on Android where FastAPI/uvicorn are not available.
Serves the same API endpoints as api.py but via http.server.
On desktop, api.py (FastAPI) is used instead.
"""

from __future__ import annotations

import io
import json
import os
import sys
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, parse_qs

from .driver import DriverError, ThermalDriver
from .imaging.badge import extract_badges
from .imaging.pdf import convert_pdf_to_pbm

# ---------------------------------------------------------------------------
# Android detection
# ---------------------------------------------------------------------------

IS_ANDROID = os.environ.get("P4A_BOOTSTRAP") is not None

# ---------------------------------------------------------------------------
# Shared state (same as api.py)
# ---------------------------------------------------------------------------

_driver = ThermalDriver()

_settings: dict[str, Any] = {
    "config_path": "config.json",
    "version": 4,
    "first_run": True,
    "is_android": IS_ANDROID,
    "scan_time": 12.0,
    "dry_run": False,
    "energy": 64,
    "quality": 36,
}

_SETTINGS_PRIVATE = {"printer", "is_android"}


def _resolve_config_path() -> str:
    """Return config path, using Android app storage if available."""
    if IS_ANDROID:
        try:
            from android.storage import app_storage_path  # type: ignore[import]
            return os.path.join(app_storage_path(), "config.json")
        except ImportError:
            pass
    return _settings.get("config_path", "config.json")


def _load_config() -> None:
    path = _resolve_config_path()
    _settings["config_path"] = path
    if not os.path.exists(path):
        _save_config()
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            stored = json.load(f)
        if stored.get("version", 0) < _settings["version"]:
            _save_config()
            return
        _settings.update(stored)
    except Exception:
        _save_config()


def _save_config() -> None:
    path = _resolve_config_path()
    filtered = {k: v for k, v in _settings.items() if k not in _SETTINGS_PRIVATE}
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(filtered, f, indent=4)
    except Exception:
        pass


def _sync_driver() -> None:
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
# Determine frontend directory
# ---------------------------------------------------------------------------

# When packaged for Android, the frontend dist is in www/ next to main.py
_FRONTEND_DIR: Path | None = None
for candidate in [
    Path(__file__).resolve().parent / "www",                     # bundled in package
    Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "dist",  # dev layout
    Path(os.getcwd()) / "www",                                  # p4a working dir
]:
    if candidate.is_dir():
        _FRONTEND_DIR = candidate
        break


# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------

class MeowHandler(SimpleHTTPRequestHandler):
    """Handles API routes and serves static frontend files."""

    def __init__(self, *args, **kwargs):
        directory = str(_FRONTEND_DIR) if _FRONTEND_DIR else "."
        super().__init__(*args, directory=directory, **kwargs)

    def log_message(self, format, *args):
        """Suppress default request logging."""
        pass

    # ── API routing ───────────────────────────────────────────────

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/settings":
            self._api_get_settings()
        elif path == "/api/devices":
            qs = parse_qs(parsed.query)
            everything = qs.get("everything", ["false"])[0].lower() == "true"
            self._api_devices(everything)
        else:
            # Serve static files
            super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        body = self._read_body()

        if path == "/api/print":
            self._api_print(body)
        elif path == "/api/print-pdf":
            self._api_print_pdf(body)
        elif path == "/api/print-badge":
            self._api_print_badge(body)
        elif path == "/api/connect":
            self._api_connect(body)
        elif path == "/api/exit":
            self._api_exit()
        else:
            self._json_response({"error": "not found"}, 404)

    def do_PUT(self):
        path = urlparse(self.path).path
        body = self._read_body()

        if path == "/api/settings":
            self._api_update_settings(body)
        else:
            self._json_response({"error": "not found"}, 404)

    # ── Helpers ───────────────────────────────────────────────────

    def _read_body(self) -> bytes:
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length > 0 else b""

    def _json_response(self, data: Any, status: int = 200) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, name: str, detail: str, status: int = 500) -> None:
        self._json_response({"name": name, "details": detail}, status)

    # ── API implementations ───────────────────────────────────────

    def _api_get_settings(self) -> None:
        _load_config()
        self._json_response(_settings)

    def _api_update_settings(self, body: bytes) -> None:
        try:
            data = json.loads(body)
        except Exception:
            self._error("bad-json", "Invalid JSON", 400)
            return
        _settings.update(data)
        _save_config()
        _sync_driver()
        self._json_response({})

    def _api_devices(self, everything: bool = False) -> None:
        _sync_driver()
        try:
            found = _driver.scan(everything=everything)
            self._json_response({
                "devices": [{"name": d.name, "address": d.address} for d in found]
            })
        except Exception as exc:
            self._error(type(exc).__name__, str(exc))

    def _api_connect(self, body: bytes) -> None:
        try:
            data = json.loads(body)
        except Exception:
            self._error("bad-json", "Invalid JSON", 400)
            return
        device_str = data.get("device", "")
        if "," not in device_str:
            self._error("bad-device", "Expected 'name,address'", 400)
            return
        name, address = device_str.split(",", 1)
        try:
            _driver.connect(name, address)
            self._json_response({})
        except Exception as exc:
            self._error(type(exc).__name__, str(exc))

    def _api_print(self, body: bytes) -> None:
        _sync_driver()
        try:
            _driver.print_pbm(io.BytesIO(body))
            self._json_response({})
        except Exception as exc:
            self._error(type(exc).__name__, str(exc))

    def _api_print_pdf(self, body: bytes) -> None:
        if not body:
            self._error("invalid-pdf", "Empty PDF body", 400)
            return
        _sync_driver()
        try:
            width = getattr(_driver.model, "paper_width", 384)
            bitmap, page_count = convert_pdf_to_pbm(body, width)
            _driver.print_pbm(io.BytesIO(bitmap))
            self._json_response({"pages": page_count})
        except DriverError as exc:
            self._error(exc.key, exc.detail)
        except Exception as exc:
            self._error(type(exc).__name__, str(exc))

    def _api_print_badge(self, body: bytes) -> None:
        if not body:
            self._error("badge-error", "Empty body", 400)
            return
        content_type = self.headers.get("content-type", "")
        _sync_driver()
        try:
            width = getattr(_driver.model, "paper_width", 384)
            badges = extract_badges(body, content_type, width)
        except DriverError as exc:
            self._error(exc.key, exc.detail)
            return
        if not badges:
            self._error("badge-not-found", "No barcodes detected")
            return
        try:
            for pbm in badges:
                _driver.print_pbm(io.BytesIO(pbm))
            self._json_response({"badges": len(badges)})
        except Exception as exc:
            self._error(type(exc).__name__, str(exc))

    def _api_exit(self) -> None:
        _save_config()
        try:
            _driver.shutdown()
        except Exception:
            pass
        self._json_response({})
        # Schedule server shutdown
        threading.Thread(target=self.server.shutdown, daemon=True).start()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def serve() -> None:
    """Start the lightweight HTTP server. Used as p4a entry point on Android."""
    _load_config()
    _settings["is_android"] = IS_ANDROID

    host, port = "127.0.0.1", 8095

    # Request Android BLE permissions
    if IS_ANDROID:
        try:
            from android.permissions import request_permissions, Permission  # type: ignore[import]
            request_permissions([
                Permission.BLUETOOTH_SCAN,
                Permission.BLUETOOTH_CONNECT,
            ])
        except Exception:
            pass

    server = HTTPServer((host, port), MeowHandler)
    print(f"MeowPrinter serving at http://{host}:{port}/")

    if not IS_ANDROID and "-s" not in sys.argv:
        import webbrowser
        webbrowser.open(f"http://{host}:{port}/")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
