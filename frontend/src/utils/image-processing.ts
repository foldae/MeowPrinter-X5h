/**
 * Client-side image processing: grayscale conversion, brightness adjustment,
 * dithering algorithms, and PBM P4 export for thermal printing (384px width).
 */

export const PRINTER_WIDTH = 384;

/** Convert RGBA image data to a single-channel grayscale array. */
export function toGrayscale(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  transparentAsWhite: boolean,
): Uint8ClampedArray {
  const { data } = ctx.getImageData(0, 0, width, height);
  const gray = new Uint8ClampedArray(width * height);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2],
      a = data[i + 3];
    let lum = r * 0.299 + g * 0.587 + b * 0.114;
    if (transparentAsWhite && a < 255) {
      lum = lum * (a / 255) + 255 * (1 - a / 255);
    }
    gray[i >> 2] = lum;
  }
  return gray;
}

/**
 * Adjust brightness of grayscale data.
 * `brightness` is 0-256 where 128 = no change.
 * < 128 = darker (more black), > 128 = lighter (more white).
 * Applied as a linear remap BEFORE dithering so all 3 modes
 * respond consistently to the brightness slider.
 */
export function adjustBrightness(
  gray: Uint8ClampedArray,
  brightness: number,
): Uint8ClampedArray {
  if (brightness === 128) return gray;

  const out = new Uint8ClampedArray(gray.length);
  // Map brightness 0-256 to an offset: -128 to +128
  const offset = brightness - 128;

  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] + offset;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

/** Simple binary threshold at midpoint — crisp for text. */
export function directThreshold(
  gray: Uint8ClampedArray,
  _w: number,
  _h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < gray.length; i++) {
    out[i] = gray[i] >= 128 ? 255 : 0;
  }
  return out;
}

/** Ordered dither using a 4x4 Bayer matrix — good for patterns/photos. */
export function halftone(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const bayer = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const out = new Uint8ClampedArray(gray.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bayerVal = bayer[y % 4][x % 4] * 16 - 128;
      out[y * width + x] = gray[y * width + x] + bayerVal >= 128 ? 255 : 0;
    }
  }
  return out;
}

/** Floyd-Steinberg error diffusion — best for photos with gradients. */
export function floydSteinberg(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  // Work on a float copy to accumulate diffusion errors accurately.
  const buf = new Float32Array(gray);
  const idx = (x: number, y: number) => y * width + x;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      const oldPx = buf[i];
      const newPx = oldPx >= 128 ? 255 : 0;
      buf[i] = newPx;
      const err = oldPx - newPx;
      if (x + 1 < width) buf[idx(x + 1, y)] += err * (7 / 16);
      if (x - 1 >= 0 && y + 1 < height) buf[idx(x - 1, y + 1)] += err * (3 / 16);
      if (y + 1 < height) buf[idx(x, y + 1)] += err * (5 / 16);
      if (x + 1 < width && y + 1 < height) buf[idx(x + 1, y + 1)] += err * (1 / 16);
    }
  }

  const out = new Uint8ClampedArray(gray.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] > 127 ? 255 : 0;
  }
  return out;
}

/**
 * Export a 1-bit black & white canvas to PBM P4 binary format.
 * The canvas should already contain the dithered result (black/white pixels).
 */
export function canvasToPbm(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2d context");

  const w = canvas.width;
  const h = canvas.height;
  const { data } = ctx.getImageData(0, 0, w, h);

  const header = new TextEncoder().encode(`P4\n${w} ${h}\n`);
  const rowBytes = Math.ceil(w / 8);
  const body = new Uint8Array(rowBytes * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const isBlack = data[(y * w + x) * 4] < 128;
      if (isBlack) {
        body[y * rowBytes + (x >> 3)] |= 1 << (7 - (x & 7));
      }
    }
  }

  const pbm = new Uint8Array(header.length + body.length);
  pbm.set(header);
  pbm.set(body, header.length);
  return pbm;
}
