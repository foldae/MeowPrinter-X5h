"""Generate and print numbered event tickets.

Usage::

    meowprinter-cli print-image tickets_out/ticket_01.png --address XX:XX:XX:XX:XX:XX

Or as a standalone script::

    python -m meowprinter.tickets --count 5 --start 1 --address XX:XX:XX:XX:XX:XX --print
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PAPER_WIDTH = 384

DEFAULT_TITLE = "Trip to Lake Town"
DEFAULT_PRICE = "$25"
DEFAULT_TIME = "Departs 8:00 AM"


# ---------------------------------------------------------------------------
# Font helpers
# ---------------------------------------------------------------------------

def _find_bold_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("C:/Windows/Fonts/arialbd.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
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
    min_size: int = 12,
) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    size = start_size
    while size >= min_size:
        font = _find_bold_font(size)
        w, _ = _measure_text(draw, text, font)
        if w <= max_width:
            return font
        size -= 2
    return _find_bold_font(min_size)


# ---------------------------------------------------------------------------
# Ticket builder
# ---------------------------------------------------------------------------

def build_ticket(
    number: int,
    title: str = DEFAULT_TITLE,
    price: str = DEFAULT_PRICE,
    time_text: str = DEFAULT_TIME,
    *,
    font_scale: float = 1.0,
    gap_scale: float = 1.0,
    title_scale: float = 1.0,
    price_scale: float = 1.1,
    number_scale: float = 1.1,
    time_scale: float = 1.0,
    side_padding: int = 2,
) -> Image.Image:
    """Render a single numbered ticket as a 1-bit PIL Image.

    The image is built landscape then rotated so text flows along the
    printer's feed direction.
    """
    canvas_w = 550
    canvas_h = PAPER_WIDTH
    margin = max(8, side_padding)
    gap_scale = max(0.3, gap_scale)

    def scaled(base: int) -> int:
        return max(8, int(round(base * max(0.3, font_scale))))

    img = Image.new("1", (canvas_w, canvas_h), 1)
    draw = ImageDraw.Draw(img)
    label = f"{number:02d}"

    # Number — bottom-right
    num_font = _shrink_to_fit(draw, label, canvas_w - 2 * margin,
                               scaled(int(100 * number_scale)), scaled(int(24 * number_scale)))
    nw, nh = _measure_text(draw, label, num_font)
    nx = canvas_w - margin - nw
    ny = canvas_h - margin - nh - 10
    draw.text((nx, ny), label, font=num_font, fill=0)

    # Title — top-left
    title_font = _shrink_to_fit(draw, title, canvas_w - 2 * margin - 170,
                                 scaled(int(96 * title_scale)), scaled(int(26 * title_scale)))
    _, th = _measure_text(draw, title, title_font)
    draw.text((margin, margin), title, font=title_font, fill=0)

    # Price + time line below title
    line_y = margin + th + max(2, int(round(8 * gap_scale)))
    price_font = _shrink_to_fit(draw, price, canvas_w // 2 - margin,
                                 scaled(int(100 * price_scale)), scaled(int(28 * price_scale)))
    time_font = _shrink_to_fit(draw, time_text, canvas_w // 2 - margin,
                                scaled(int(70 * time_scale)), scaled(int(22 * time_scale)))
    draw.text((margin, line_y), price, font=price_font, fill=0)
    tw, _ = _measure_text(draw, time_text, time_font)
    draw.text((canvas_w - margin - tw, line_y + max(0, int(round(2 * gap_scale)))),
              time_text, font=time_font, fill=0)

    # Crop unused horizontal space
    boxes = [
        draw.textbbox((nx, ny), label, font=num_font),
        draw.textbbox((margin, margin), title, font=title_font),
        draw.textbbox((margin, line_y), price, font=price_font),
        draw.textbbox((canvas_w - margin - tw, line_y), time_text, font=time_font),
    ]
    left = max(0, min(b[0] for b in boxes) - margin)
    right = min(canvas_w, max(b[2] for b in boxes) + margin)
    img = img.crop((left, 0, right, canvas_h))

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
    retries = max(1, retries)

    if address:
        cmd = base + ["--address", address]
        for attempt in range(1, retries + 1):
            try:
                subprocess.run(cmd, check=True)
                return
            except subprocess.CalledProcessError:
                if attempt >= retries and not identifier:
                    raise
                print(f"Retry {attempt}/{retries}…", file=sys.stderr)
                if retry_delay > 0:
                    time.sleep(retry_delay)

    cmd = base + ["--identifier", identifier or model]
    for attempt in range(1, retries + 1):
        try:
            subprocess.run(cmd, check=True)
            return
        except subprocess.CalledProcessError:
            if attempt >= retries:
                raise
            print(f"Retry {attempt}/{retries}…", file=sys.stderr)
            if retry_delay > 0:
                time.sleep(retry_delay)


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Generate / print numbered event tickets")
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--title", default=DEFAULT_TITLE)
    parser.add_argument("--price", default=DEFAULT_PRICE)
    parser.add_argument("--time", dest="time_text", default=DEFAULT_TIME)
    parser.add_argument("--font-scale", type=float, default=0.78)
    parser.add_argument("--gap-scale", type=float, default=0.35)
    parser.add_argument("--title-scale", type=float, default=1.0)
    parser.add_argument("--price-scale", type=float, default=1.1)
    parser.add_argument("--time-scale", type=float, default=1.0)
    parser.add_argument("--side-padding", type=int, default=8)
    parser.add_argument("--out-dir", default="tickets_out")

    parser.add_argument("--print", action="store_true")
    parser.add_argument("--address")
    parser.add_argument("--identifier", default="PD01")
    parser.add_argument("--model", default="PD01")
    parser.add_argument("--scan-time", type=float, default=6.0)
    parser.add_argument("--timeout", type=float, default=8.0)
    parser.add_argument("--connect-retries", type=int, default=4)
    parser.add_argument("--retry-delay", type=float, default=1.2)
    parser.add_argument("--keep-going", action="store_true")
    parser.add_argument("--wait-approval", action="store_true",
                        help="Pause after each ticket and wait for Enter before printing the next")
    parser.add_argument("--print-delay", type=float, default=7.0,
                        help="Seconds to wait between consecutive prints (default 7.0)")
    parser.add_argument("--quality", type=int, default=4)
    parser.add_argument("--tail-feed", type=int, default=60)

    args = parser.parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    failures: list[int] = []
    ticket_numbers = list(range(args.start, args.start + args.count))
    for idx, i in enumerate(ticket_numbers):
        img = build_ticket(
            i, args.title, args.price, args.time_text,
            font_scale=args.font_scale, gap_scale=args.gap_scale,
            title_scale=args.title_scale, price_scale=args.price_scale,
            time_scale=args.time_scale, side_padding=args.side_padding,
        )
        out_path = out_dir / f"ticket_{i:02d}.png"
        img.save(out_path, format="PNG")
        print(f"Generated: {out_path}")

        if getattr(args, "print"):
            # Between consecutive prints: either wait for user or auto-delay
            if idx > 0:
                if args.wait_approval:
                    input(f"Ticket {i:02d} ready. Press Enter to print (or Ctrl+C to stop)…")
                elif args.print_delay > 0:
                    print(f"Waiting {args.print_delay:.1f}s for printer to finish…")
                    time.sleep(args.print_delay)

            print(f"Printing ticket {i:02d}…")
            try:
                _print_via_cli(
                    out_path, model=args.model, quality=args.quality,
                    tail_feed=args.tail_feed, scan_time=args.scan_time,
                    timeout=args.timeout, retries=args.connect_retries,
                    retry_delay=args.retry_delay, address=args.address,
                    identifier=args.identifier,
                )
            except subprocess.CalledProcessError:
                failures.append(i)
                print(f"Failed ticket {i:02d}", file=sys.stderr)
                if not args.keep_going:
                    raise

    if failures:
        print(f"Failures: {', '.join(f'{n:02d}' for n in failures)}", file=sys.stderr)
        return 2
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
