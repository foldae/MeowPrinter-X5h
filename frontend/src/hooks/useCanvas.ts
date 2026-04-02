/**
 * Manages the preview canvas: draws the source image, applies brightness +
 * rotation/flip + the selected dithering algorithm, returns a canvas ref.
 */

import { useRef, useEffect } from "preact/hooks";
import {
  sourceImage,
  processMode,
  brightness,
  rotate,
  rotate180,
  flipH,
  flipV,
  transparentAsWhite,
} from "./useStore";
import {
  PRINTER_WIDTH,
  toGrayscale,
  adjustBrightness,
  floydSteinberg,
  halftone,
  directThreshold,
} from "../utils/image-processing";

export function useCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const img = sourceImage.value;
  const mode = processMode.value;
  const bright = brightness.value;
  const rot = rotate.value;
  const rot180 = rotate180.value;
  const fh = flipH.value;
  const fv = flipV.value;
  const transp = transparentAsWhite.value;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Compute dimensions after optional 90-degree rotation.
    let srcW = img.width,
      srcH = img.height;
    if (rot) [srcW, srcH] = [srcH, srcW];

    const scale = PRINTER_WIDTH / srcW;
    const targetH = Math.floor(srcH * scale);
    canvas.width = PRINTER_WIDTH;
    canvas.height = targetH;

    // Draw to an offscreen canvas so we can read pixels.
    const off = document.createElement("canvas");
    off.width = PRINTER_WIDTH;
    off.height = targetH;
    const offCtx = off.getContext("2d")!;

    if (transp) {
      offCtx.fillStyle = "white";
      offCtx.fillRect(0, 0, PRINTER_WIDTH, targetH);
    }

    // Apply transforms: translate to center, apply flip/rotate, draw.
    offCtx.save();
    offCtx.translate(PRINTER_WIDTH / 2, targetH / 2);
    if (rot) offCtx.rotate(Math.PI / 2);
    if (rot180) offCtx.rotate(Math.PI);
    if (fh) offCtx.scale(-1, 1);
    if (fv) offCtx.scale(1, -1);

    if (rot) {
      offCtx.drawImage(img, -targetH / 2, -PRINTER_WIDTH / 2, targetH, PRINTER_WIDTH);
    } else {
      offCtx.drawImage(img, -PRINTER_WIDTH / 2, -targetH / 2, PRINTER_WIDTH, targetH);
    }
    offCtx.restore();

    // ── Pipeline: grayscale → brightness adjust → dither ──────────
    let gray = toGrayscale(offCtx, PRINTER_WIDTH, targetH, transp);
    gray = adjustBrightness(gray, bright);

    let out: Uint8ClampedArray;
    switch (mode) {
      case "text":
        out = directThreshold(gray, PRINTER_WIDTH, targetH);
        break;
      case "pattern":
        out = halftone(gray, PRINTER_WIDTH, targetH);
        break;
      case "picture":
      default:
        out = floydSteinberg(gray, PRINTER_WIDTH, targetH);
    }

    // Write result onto the visible canvas.
    const result = new ImageData(PRINTER_WIDTH, targetH);
    for (let i = 0; i < out.length; i++) {
      result.data[i * 4] = out[i];
      result.data[i * 4 + 1] = out[i];
      result.data[i * 4 + 2] = out[i];
      result.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(result, 0, 0);
  }, [img, mode, bright, rot, rot180, fh, fv, transp]);

  return canvasRef;
}
