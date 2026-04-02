"""Print a mailing address label on the thermal printer.

Each label prints the recipient's name and address lines, centered,
on a strip of paper.

Usage examples::

    # Preview only (no printer needed)
    python -m meowprinter.addresses --name "Maria Dolores Martinez Núñez" \\
        --street "Calle Atocha nº3," --city "Madrid, 28001"

    # Print directly by BLE address
    python -m meowprinter.addresses --name "Maria Dolores Martinez Núñez" \\
        --street "Calle Atocha nº3," --city "Madrid, 28001" \\
        --print --address XX:XX:XX:XX:XX:XX

    # Print by device identifier (auto-scan)
    python -m meowprinter.addresses --name "Maria Dolores Martinez Núñez" \\
        --street "Calle Atocha nº3," --city "Madrid, 28001" \\
        --print --identifier PD01
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PAPER_WIDTH = 384


# ---------------------------------------------------------------------------
# Font helpers (same pattern as tickets.py)
# ---------------------------------------------------------------------------

def _find_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates = [
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
            Path("C:/Windows/Fonts/arialbd.ttf"),
            Path("C:/Windows/Fonts/arial.ttf"),
        ]
    else:
        candidates = [
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/calibri.ttf"),
        ]
    for p in candidates:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size)
            except Exception:
                pass
    return ImageFont.load_default()


def _measure_text(draw: ImageDraw.ImageDraw, text: str, font) -> tuple[int, int]:
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    return r - l, b - t


def _shrink_to_fit(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_width: int,
    start_size: int,
    min_size: int = 10,
    bold: bool = False,
) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    size = start_size
    while size >= min_size:
        font = _find_font(size, bold=bold)
        w, _ = _measure_text(draw, text, font)
        if w <= max_width:
            return font
        size -= 2
    return _find_font(min_size, bold=bold)


# ---------------------------------------------------------------------------
# Label builder
# ---------------------------------------------------------------------------

def build_label(
    name: str,
    street: str,
    city: str,
    *,
    name_size: int = 80,
    line_size: int = 60,
    padding: int = 20,
    line_gap: int = 18,
) -> Image.Image:
    """Render a centered mailing address as a 1-bit PIL Image, printed sideways.

    Layout strategy:
      - Build a LANDSCAPE canvas (width = longest line + padding,
        height = PAPER_WIDTH = 384).
      - Stack lines along the Y-axis (name → street → city, top to bottom
        in landscape). Each line is centered along the X-axis.
      - Rotate 90° CCW → portrait image that feeds through the printer.
        In reading orientation (paper rotated 90° CW): name is at top,
        street in middle, city at bottom — all centered.
    """
    landscape_h = PAPER_WIDTH  # 384 — becomes portrait width after rotation

    # --- measure helper (no draw object needed) ---
    def measure(text: str, font) -> tuple[int, int]:
        probe = Image.new("1", (1, 1), 1)
        d = ImageDraw.Draw(probe)
        l, t, r, b = d.textbbox((0, 0), text, font=font)
        return r - l, b - t

    # --- pick fonts ---
    name_font = _find_font(name_size, bold=True)
    street_font = _find_font(line_size, bold=False)
    city_font = _find_font(line_size, bold=False)

    name_w, name_h = measure(name, name_font)
    street_w, street_h = measure(street, street_font)
    city_w, city_h = measure(city, city_font)

    # Total block height (landscape Y axis — becomes portrait X after rotation)
    total_block_h = name_h + line_gap + street_h + line_gap + city_h

    # Shrink fonts proportionally if total block exceeds landscape height
    usable_h = landscape_h - 2 * padding
    if total_block_h > usable_h:
        ratio = usable_h / total_block_h
        name_size = max(10, int(name_size * ratio))
        line_size = max(10, int(line_size * ratio))
        name_font = _find_font(name_size, bold=True)
        street_font = _find_font(line_size, bold=False)
        city_font = _find_font(line_size, bold=False)
        name_w, name_h = measure(name, name_font)
        street_w, street_h = measure(street, street_font)
        city_w, city_h = measure(city, city_font)
        total_block_h = name_h + line_gap + street_h + line_gap + city_h

    # Canvas width = longest line + side padding (becomes label length after rotation)
    max_w = max(name_w, street_w, city_w)
    landscape_w = max_w + 2 * padding

    img = Image.new("1", (landscape_w, landscape_h), 1)
    draw = ImageDraw.Draw(img)

    # Center the whole block along landscape Y axis
    y = (landscape_h - total_block_h) // 2

    def draw_centered(text: str, font, line_w: int, line_h: int) -> None:
        """Draw text centered on the X axis at current y, then advance y."""
        nonlocal y
        x = (landscape_w - line_w) // 2
        draw.text((x, y), text, font=font, fill=0)
        y += line_h + line_gap

    draw_centered(name, name_font, name_w, name_h)
    draw_centered(street, street_font, street_w, street_h)
    # last line: draw without trailing gap
    x = (landscape_w - city_w) // 2
    draw.text((x, y), city, font=city_font, fill=0)

    # Rotate 90° CCW → portrait
    return img.rotate(90, expand=True)


# ---------------------------------------------------------------------------
# Print helper
# ---------------------------------------------------------------------------

def _print_via_cli(
    image_path: Path,
    *,
    model: str,
    quality: int,
    tail_feed: int,
    scan_time: float,
    timeout: float,
    retries: int,
    retry_delay: float,
    address: str | None = None,
    identifier: str | None = None,
) -> None:
    import time

    base = [
        sys.executable, "-m", "meowprinter.cli",
        "--model", model,
        "--scan-time", str(scan_time),
        "--timeout", str(timeout),
        "--quality", str(quality),
        "--tail-feed", str(tail_feed),
        "print-image", str(image_path),
        "--dither", "none",
    ]

    def run_with_retries(cmd: list[str]) -> None:
        for attempt in range(1, max(1, retries) + 1):
            try:
                subprocess.run(cmd, check=True)
                return
            except subprocess.CalledProcessError:
                if attempt >= retries:
                    raise
                print(f"Retry {attempt}/{retries}…", file=sys.stderr)
                if retry_delay > 0:
                    time.sleep(retry_delay)

    if address:
        run_with_retries(base + ["--address", address])
    else:
        run_with_retries(base + ["--identifier", identifier or model])


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Print a centered mailing address label on the thermal printer"
    )

    # Address content
    parser.add_argument("--name", required=True,
                        help='Recipient name, e.g. "Maria Dolores Martinez Núñez"')
    parser.add_argument("--street", required=True,
                        help='Street line, e.g. "Calle Atocha nº3,"')
    parser.add_argument("--city", required=True,
                        help='City / postal code line, e.g. "Madrid, 28001"')

    # Layout tweaks
    parser.add_argument("--name-size", type=int, default=80,
                        help="Starting font size for the name (default 80)")
    parser.add_argument("--line-size", type=int, default=60,
                        help="Starting font size for address lines (default 60)")
    parser.add_argument("--padding", type=int, default=16,
                        help="Top/bottom padding in pixels (default 16)")
    parser.add_argument("--line-gap", type=int, default=10,
                        help="Gap between lines in pixels (default 10)")

    # Output
    parser.add_argument("--out", default="address_label.png",
                        help="Output PNG path (default: address_label.png)")
    parser.add_argument("--print", action="store_true",
                        help="Send to printer after generating")

    # Printer connection
    parser.add_argument("--address", dest="ble_address",
                        help="BLE address of the printer (bypasses scan)")
    parser.add_argument("--identifier", default="PD01",
                        help="Device name/identifier for auto-scan (default: PD01)")
    parser.add_argument("--model", default="PD01")
    parser.add_argument("--scan-time", type=float, default=12.0)
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--connect-retries", type=int, default=4)
    parser.add_argument("--retry-delay", type=float, default=1.2)
    parser.add_argument("--quality", type=int, default=4)
    parser.add_argument("--tail-feed", type=int, default=60)

    args = parser.parse_args()

    # Generate label
    img = build_label(
        args.name, args.street, args.city,
        name_size=args.name_size,
        line_size=args.line_size,
        padding=args.padding,
        line_gap=args.line_gap,
    )

    out_path = Path(args.out)
    img.save(out_path, format="PNG")
    print(f"Generated: {out_path}  ({img.width}x{img.height} px)")

    if getattr(args, "print"):
        print("Printing…")
        _print_via_cli(
            out_path,
            model=args.model,
            quality=args.quality,
            tail_feed=args.tail_feed,
            scan_time=args.scan_time,
            timeout=args.timeout,
            retries=args.connect_retries,
            retry_delay=args.retry_delay,
            address=args.ble_address,
            identifier=args.identifier,
        )
        print("Done.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
