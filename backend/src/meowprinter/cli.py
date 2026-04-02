"""Unified command-line interface for MeowPrinter.

Subcommands:
    scan          Discover nearby printers.
    print-image   Print a raster image.
    print-text    Render and print UTF-8 text.
    serve         Start the web UI server.
"""

from __future__ import annotations

import argparse
import io
import os
import sys
from pathlib import Path

from .driver import DriverError, ThermalDriver
from .protocol.models import MODELS

try:
    from PIL import Image, ImageDraw, ImageFont, ImageOps
except ImportError:
    Image = ImageDraw = ImageFont = ImageOps = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Font helpers
# ---------------------------------------------------------------------------

_WIN_FONT = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "arial.ttf"
_POSIX_FONT = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
_DEFAULT_FONT = str(_WIN_FONT if _WIN_FONT.exists() else _POSIX_FONT)


def _require_pillow() -> None:
    if Image is None:
        raise SystemExit("Pillow is required for this command.  pip install pillow")


def _load_font(path: str, size: int):
    _require_pillow()
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def _measure(text: str, font) -> int:
    if not text:
        return 0
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0]


def _wrap(text: str, font, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.splitlines():
        if not paragraph:
            lines.append("")
            continue
        words = paragraph.split(" ")
        current = ""
        for word in words:
            candidate = word if not current else f"{current} {word}"
            if _measure(candidate, font) <= max_width:
                current = candidate
                continue
            if current:
                lines.append(current)
            if _measure(word, font) <= max_width:
                current = word
                continue
            chunk = ""
            for ch in word:
                probe = chunk + ch
                if _measure(probe, font) <= max_width:
                    chunk = probe
                else:
                    if chunk:
                        lines.append(chunk)
                    chunk = ch
            current = chunk
        if current:
            lines.append(current)
    return lines or [""]


# ---------------------------------------------------------------------------
# Image helpers
# ---------------------------------------------------------------------------

def _normalise_energy(value: float | None) -> int | None:
    if value is None:
        return None
    if value <= 1.0:
        value = max(0.0, min(1.0, value)) * 0xFFFF
    return min(int(value), 0xFFFF)


def _prepare_for_print(image, width: int, dither: str, threshold: int, invert: bool):
    _require_pillow()
    if image.width != width:
        ratio = width / image.width
        new_h = max(1, int(round(image.height * ratio)))
        image = image.resize((width, new_h), resample=Image.LANCZOS)
    image = image.convert("L")
    if invert:
        image = ImageOps.invert(image)
    threshold = max(0, min(255, threshold))
    if dither == "none":
        return image.point(lambda p: 0 if p < threshold else 255, mode="1")
    return image.convert("1")


def _to_pbm(image) -> bytes:
    if image.mode != "1":
        raise ValueError("Expected 1-bit image")
    w, h = image.size
    row_bytes = (w + 7) // 8
    payload = bytearray()
    for y in range(h):
        byte, bits = 0, 0
        for x in range(w):
            bit = 1 if image.getpixel((x, y)) == 0 else 0
            byte = (byte << 1) | bit
            bits += 1
            if bits == 8:
                payload.append(byte)
                byte, bits = 0, 0
        if bits:
            payload.append(byte << (8 - bits))
    return f"P4\n{w} {h}\n".encode("ascii") + payload


def _render_text(text: str, width: int, font_path: str, font_size: int, align: str, spacing: float):
    _require_pillow()
    font = _load_font(font_path, font_size)
    pad = 12
    max_w = max(1, width - pad * 2)
    lines = _wrap(text, font, max_w)
    ascent, descent = font.getmetrics()
    line_h = max(1, int((ascent + descent) * spacing))
    height = max(line_h, line_h * len(lines)) + pad * 2
    img = Image.new("L", (width, height), color=255)
    draw = ImageDraw.Draw(img)
    y = pad
    for line in lines:
        w = _measure(line.rstrip(), font)
        x = max(pad, (width - w) // 2) if align == "center" else pad
        draw.text((x, y), line.rstrip(), font=font, fill=0)
        y += line_h
    return img


# ---------------------------------------------------------------------------
# Driver factory
# ---------------------------------------------------------------------------

# Default energy levels matching the original firmware behaviour.
_DEFAULT_ENERGY_IMAGE = 0x4000
_DEFAULT_ENERGY_TEXT = 0x6000


def _make_driver(args: argparse.Namespace, *, text_mode: bool = False) -> ThermalDriver:
    drv = ThermalDriver()
    model_key = (args.model or "PD01").upper()
    drv.model = MODELS.get(model_key, MODELS["_ZZ00"])
    drv.tail_feed = drv.model.tail_feed
    drv.scan_time = args.scan_time
    drv.connection_timeout = args.timeout
    energy = _normalise_energy(args.energy)
    if energy is not None:
        drv.energy = energy
    else:
        drv.energy = _DEFAULT_ENERGY_TEXT if text_mode else _DEFAULT_ENERGY_IMAGE
    if args.quality is not None:
        drv.speed = 4 * (args.quality + 5)
    if args.tail_feed is not None:
        drv.tail_feed_override = max(0, args.tail_feed)
        drv.tail_feed = drv.tail_feed_override
    return drv


def _connect_for_job(drv: ThermalDriver, args: argparse.Namespace) -> None:
    if getattr(args, "address", None):
        drv.connect(args.model.upper(), args.address)
        return
    identifier = getattr(args, "identifier", None) or args.model
    drv.scan(identifier, use_result=True)


# ---------------------------------------------------------------------------
# Subcommand handlers
# ---------------------------------------------------------------------------

def _cmd_scan(drv: ThermalDriver, args: argparse.Namespace) -> None:
    identifier = None if args.all else (args.identifier or args.model)
    devices = drv.scan(identifier, everything=args.all)
    if not devices:
        print("No devices found", file=sys.stderr)
        return
    for d in devices:
        print(f"{d.name}\t{d.address}")


def _cmd_print_image(drv: ThermalDriver, args: argparse.Namespace) -> None:
    _require_pillow()
    path = args.path
    if not path or path == "-":
        data = sys.stdin.buffer.read()
        if not data:
            raise SystemExit("No image data on stdin")
        image = Image.open(io.BytesIO(data)).convert("RGB")
    else:
        image = Image.open(path).convert("RGB")
    processed = _prepare_for_print(image, drv.model.paper_width, args.dither, args.threshold, args.invert)
    pbm = _to_pbm(processed)
    _connect_for_job(drv, args)
    drv.print_pbm(io.BytesIO(pbm))


def _cmd_print_text(drv: ThermalDriver, args: argparse.Namespace) -> None:
    content = args.text or (Path(args.file).read_text("utf-8") if args.file else sys.stdin.read())
    if not content.strip():
        raise SystemExit("No text content")
    image = _render_text(content, drv.model.paper_width, args.font, args.size, args.align, args.line_spacing)
    processed = _prepare_for_print(image, drv.model.paper_width, "none", 128, False)
    pbm = _to_pbm(processed)
    _connect_for_job(drv, args)
    drv.print_pbm(io.BytesIO(pbm))


def _cmd_serve(_drv: ThermalDriver, args: argparse.Namespace) -> None:
    from .api import run
    run(silent=args.silent, listen_all=args.listen_all)


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

def _build_parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="meowprinter-cli", description="MeowPrinter CLI")
    root.add_argument("--model", default="PD01", help="Printer model (default: PD01)")
    root.add_argument("--scan-time", type=float, default=6.0, help="BLE scan window (seconds)")
    root.add_argument("--timeout", type=float, default=5.0, help="Connection timeout (seconds)")
    root.add_argument("--energy", type=float, help="Thermal energy (0-1 float or raw int)")
    root.add_argument("--quality", type=int, default=3, help="Print quality 1-4")
    root.add_argument("--tail-feed", type=int, help="Override trailing feed (pixels)")

    subs = root.add_subparsers(dest="command", required=True)

    # scan
    sp = subs.add_parser("scan", help="Discover nearby printers")
    sp.add_argument("--all", action="store_true", help="Show all BLE devices")
    sp.add_argument("--identifier", help="Filter by model, name, or address")
    sp.set_defaults(func=_cmd_scan)

    # shared parent for print commands
    conn = argparse.ArgumentParser(add_help=False)
    conn.add_argument("--address", help="BLE address (skip scanning)")
    conn.add_argument("--identifier", help="Scan filter")

    # print-image
    sp = subs.add_parser("print-image", parents=[conn], help="Print a raster image")
    sp.add_argument("path", nargs="?", help="Image file (omit or '-' for stdin)")
    sp.add_argument("--dither", choices=["floyd", "none"], default="floyd")
    sp.add_argument("--threshold", type=int, default=128)
    sp.add_argument("--invert", action="store_true")
    sp.set_defaults(func=_cmd_print_image)

    # print-text
    sp = subs.add_parser("print-text", parents=[conn], help="Render and print text")
    sp.add_argument("--text", help="Inline text")
    sp.add_argument("--file", help="Text file path")
    sp.add_argument("--font", default=_DEFAULT_FONT)
    sp.add_argument("--size", type=int, default=32)
    sp.add_argument("--align", choices=["left", "center"], default="center")
    sp.add_argument("--line-spacing", type=float, default=1.2)
    sp.set_defaults(func=_cmd_print_text)

    # serve
    sp = subs.add_parser("serve", help="Launch the web UI server")
    sp.add_argument("-s", "--silent", action="store_true", help="Do not open the browser automatically")
    sp.add_argument("-a", "--all", action="store_true", dest="listen_all", help="Listen on all network interfaces (0.0.0.0)")
    sp.set_defaults(func=_cmd_serve)

    return root


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    drv = _make_driver(args, text_mode=(args.command == "print-text"))
    try:
        args.func(drv, args)
    except DriverError as exc:
        print(f"Error: {exc.detail or exc.key}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        sys.exit(130)
    finally:
        drv.shutdown()


if __name__ == "__main__":
    main()
