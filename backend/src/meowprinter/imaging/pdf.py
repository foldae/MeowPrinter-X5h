"""PDF-to-bitmap conversion using ImageMagick."""

from __future__ import annotations

import glob
import io
import os
import subprocess
import tempfile

from ..driver import DriverError


def _find_magick() -> str | None:
    """Return the first ImageMagick executable found on PATH."""
    for name in ("magick", "magick.exe", "convert", "convert.exe"):
        for directory in os.environ.get("PATH", "").split(os.pathsep):
            if os.path.isfile(os.path.join(directory, name)):
                return name
    return None


_MAGICK = _find_magick()


def _parse_single_pbm(blob: bytes) -> tuple[int, int, bytes]:
    """Parse a raw PBM (P4) blob and return ``(width, height, pixel_data)``."""
    stream = io.BytesIO(blob)
    header = stream.readline().strip()
    if header != b"P4":
        raise DriverError("pdf-error", "Not a valid PBM image")
    line = stream.readline()
    while line.startswith(b"#"):
        line = stream.readline()
    width, height = map(int, line.split())
    data = stream.read()
    expected = (width * height + 7) // 8
    if width % 8 == 0:
        expected = width * height // 8
    return width, height, data


def merge_pbm_pages(pages: list[bytes]) -> tuple[bytes, int]:
    """Merge multiple PBM page blobs into a single contiguous PBM image.

    Returns ``(combined_pbm_bytes, page_count)``.
    """
    if not pages:
        raise DriverError("pdf-empty", "No pages detected")
    widths, heights, payloads = [], [], []
    for page in pages:
        w, h, data = _parse_single_pbm(page)
        widths.append(w)
        heights.append(h)
        payloads.append(data)
    if len(set(widths)) != 1:
        raise DriverError("pdf-width-mismatch", "Pages have different widths")
    total_height = sum(heights)
    header = f"P4\n{widths[0]} {total_height}\n".encode("ascii")
    return header + b"".join(payloads), len(pages)


def convert_pdf_to_pbm(pdf_bytes: bytes, paper_width: int = 384) -> tuple[bytes, int]:
    """Rasterise a PDF to a single PBM bitmap using ImageMagick.

    Returns ``(pbm_bytes, page_count)``.
    """
    if _MAGICK is None:
        raise DriverError("no-imagemagick", "ImageMagick is not installed")

    with tempfile.TemporaryDirectory() as tmpdir:
        pdf_path = os.path.join(tmpdir, "input.pdf")
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        output_pattern = os.path.join(tmpdir, "page-%04d.pbm")
        cmd = [
            _MAGICK,
            "-density", "203",
            "-define", "pdf:use-cropbox=true",
            pdf_path,
            "-background", "white",
            "-alpha", "remove",
            "-alpha", "off",
            "-fill", "white", "-opaque", "transparent",
            "-colorspace", "Gray",
            "-resize", f"{paper_width}x",
            "-dither", "FloydSteinberg",
            "-monochrome",
            "+adjoin",
            output_pattern,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except FileNotFoundError as exc:
            raise DriverError("no-imagemagick", "ImageMagick not found") from exc
        except subprocess.CalledProcessError as exc:
            raise DriverError("pdf-error", "ImageMagick conversion failed") from exc

        page_files = sorted(glob.glob(os.path.join(tmpdir, "page-*.pbm")))
        if not page_files:
            raise DriverError("pdf-empty", "No pages produced")
        pages = [open(p, "rb").read() for p in page_files]

    return merge_pbm_pages(pages)
