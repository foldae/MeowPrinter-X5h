"""Badge / barcode / QR-code detection, cropping, and PBM conversion."""

from __future__ import annotations

import glob
import io
import os
import subprocess
import tempfile
from typing import Any

from ..driver import DriverError

try:
    from PIL import Image, ImageFilter, ImageOps, ImageStat
except ImportError:
    Image = ImageFilter = ImageOps = ImageStat = None  # type: ignore[assignment]

try:
    from pyzbar.pyzbar import decode as decode_barcodes
except ImportError:
    decode_barcodes = None  # type: ignore[assignment]


MAX_BADGES = 3


def _deps_available() -> bool:
    return all((Image, ImageFilter, ImageOps, ImageStat, decode_barcodes))


def _is_pdf(data: bytes, content_type: str) -> bool:
    if content_type and "pdf" in content_type.lower():
        return True
    return data.lstrip()[:5].startswith(b"%PDF")


def _rasterize_pdf_pages(pdf_bytes: bytes, tmpdir: str) -> list[str]:
    """Convert PDF pages to PNG images using ImageMagick."""
    from .pdf import _MAGICK
    if _MAGICK is None:
        raise DriverError("no-imagemagick", "ImageMagick is required for PDF badge extraction")
    pdf_path = os.path.join(tmpdir, "badge.pdf")
    with open(pdf_path, "wb") as f:
        f.write(pdf_bytes)
    output_pattern = os.path.join(tmpdir, "badge-%04d.png")
    cmd = [
        _MAGICK,
        "-density", "300",
        "-define", "pdf:use-cropbox=true",
        pdf_path,
        "-background", "white",
        "-alpha", "remove", "-alpha", "off",
        "-colorspace", "RGB",
        "+adjoin",
        output_pattern,
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
    except subprocess.CalledProcessError as exc:
        raise DriverError("badge-error", "PDF rasterization failed") from exc
    paths = sorted(glob.glob(os.path.join(tmpdir, "badge-*.png")))
    if not paths:
        raise DriverError("pdf-empty", "No pages in PDF")
    return paths


def _materialize_images(data: bytes, content_type: str, tmpdir: str) -> list[str]:
    """Turn input bytes (PDF or raster image) into a list of on-disk image paths."""
    if _is_pdf(data, content_type):
        return _rasterize_pdf_pages(data, tmpdir)
    if Image is None:
        raise DriverError("missing-deps", "Pillow is required")
    img = Image.open(io.BytesIO(data)).convert("RGB")
    path = os.path.join(tmpdir, "badge-source.png")
    img.save(path, format="PNG")
    return [path]


def _expand_region(
    bbox: tuple[int, int, int, int],
    image_size: tuple[int, int],
    symbol_type: str,
) -> tuple[int, int, int, int]:
    """Expand a bounding box slightly to give the barcode breathing room."""
    x0, y0, x1, y1 = bbox
    w, h = max(1, x1 - x0), max(1, y1 - y0)

    ratio = 0.12
    if any(t in symbol_type for t in ("QR", "AZTEC", "DATA")):
        ratio = 0.05
    elif any(t in symbol_type for t in ("CODE", "BAR")):
        ratio = 0.08

    pad = int(max(w, h) * ratio)
    max_w, max_h = image_size
    return (max(0, x0 - pad), max(0, y0 - pad), min(max_w, x1 + pad), min(max_h, y1 + pad))


def _detect_codes(image: Any) -> list[dict]:
    """Run barcode / QR detection on a grayscale PIL image."""
    try:
        symbols = decode_barcodes(image) or []
    except Exception as exc:
        raise DriverError("badge-error", "Barcode detection failed") from exc

    results = []
    w, h = image.size
    for sym in symbols:
        r = sym.rect
        stype = (sym.type or "UNKNOWN").upper()
        bbox = _expand_region((r.left, r.top, r.left + r.width, r.top + r.height), (w, h), stype)
        results.append({
            "bbox": bbox,
            "data": sym.data.decode("utf-8", errors="replace").strip(),
            "type": stype,
            "quality": getattr(sym, "quality", 0),
        })

    # Largest area first
    results.sort(
        key=lambda d: (d["bbox"][2] - d["bbox"][0]) * (d["bbox"][3] - d["bbox"][1]),
        reverse=True,
    )
    return results


def _crop_to_pbm(image: Any, bbox: tuple[int, int, int, int], symbol_type: str, paper_width: int) -> bytes | None:
    """Crop the detected region, process, and encode as PBM."""
    x0, y0, x1, y1 = map(int, bbox)
    if x1 - x0 <= 0 or y1 - y0 <= 0:
        return None

    crop = image.crop((x0, y0, x1, y1))
    is_matrix = any(t in symbol_type for t in ("QR", "AZTEC", "DATA", "MICRO", "CODABLOCK"))

    if not is_matrix and crop.width > crop.height:
        crop = crop.rotate(90, expand=True)

    scale = paper_width / max(1, crop.width)
    min_h = 80 if is_matrix else 32
    new_h = max(min_h, int(crop.height * scale))
    resample = Image.NEAREST if is_matrix else Image.LANCZOS
    resized = crop.resize((paper_width, new_h), resample=resample)

    gray = resized if resized.mode == "L" else resized.convert("L")
    enhanced = ImageOps.autocontrast(gray)
    if is_matrix:
        enhanced = enhanced.filter(ImageFilter.SHARPEN)
    else:
        enhanced = enhanced.filter(ImageFilter.MedianFilter(size=3))

    mean_val = ImageStat.Stat(enhanced).mean[0]
    thresh = (
        max(64, min(210, int(mean_val * 0.85)))
        if is_matrix
        else max(32, min(223, int(mean_val * 0.9)))
    )
    bw = enhanced.point(lambda v, t=thresh: 0 if v >= t else 255, mode="1")

    header = f"P4\n{bw.width} {bw.height}\n".encode("ascii")
    return header + bw.tobytes()


def extract_badges(
    document_bytes: bytes,
    content_type: str,
    paper_width: int = 384,
) -> list[bytes]:
    """Detect barcodes / QR codes in *document_bytes* and return PBM blobs."""
    if not _deps_available():
        raise DriverError("missing-deps", "Pillow and pyzbar are required for badge printing")

    with tempfile.TemporaryDirectory() as tmpdir:
        image_paths = _materialize_images(document_bytes, content_type, tmpdir)
        badges: list[bytes] = []
        for path in image_paths:
            with Image.open(path) as src:
                gray = src.convert("L")
                detections = _detect_codes(gray)
                for det in detections:
                    pbm = _crop_to_pbm(gray, det["bbox"], det.get("type", ""), paper_width)
                    if pbm is None:
                        continue
                    badges.append(pbm)
                    if len(badges) >= MAX_BADGES:
                        return badges
                    break  # one badge per page
    return badges
