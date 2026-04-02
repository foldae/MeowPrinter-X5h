/**
 * Typed HTTP client for the MeowPrinter FastAPI backend.
 * During dev, Vite proxies /api → http://127.0.0.1:8095.
 * In production the backend serves the built frontend from the same origin.
 */

import type { Device, BackendSettings } from "../types";

// ─── helpers ───────────────────────────────────────────────────────────

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.details || body.name || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── public API ────────────────────────────────────────────────────────

/** Scan for nearby BLE printers. */
export async function scanDevices(everything = false): Promise<Device[]> {
  const res = await fetch(`/api/devices?everything=${everything}`);
  const data = await json<{ devices: Device[] }>(res);
  return data.devices;
}

/** Connect to a specific printer (name + address). */
export async function connectDevice(name: string, address: string): Promise<void> {
  const res = await fetch("/api/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device: `${name},${address}` }),
  });
  await json(res);
}

/** Read all backend settings. */
export async function getSettings(): Promise<BackendSettings> {
  const res = await fetch("/api/settings");
  return json<BackendSettings>(res);
}

/** Patch one or more backend settings. */
export async function updateSettings(patch: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  await json(res);
}

/** Send a PBM P4 bitmap to the printer. */
export async function printPbm(pbm: Uint8Array): Promise<void> {
  const res = await fetch("/api/print", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: pbm as unknown as BodyInit,
  });
  await json(res);
}

/** Send a raw PDF for the backend to rasterize + print. */
export async function printPdf(file: File): Promise<number> {
  const buf = await file.arrayBuffer();
  const res = await fetch("/api/print-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: buf,
  });
  const data = await json<{ pages: number }>(res);
  return data.pages;
}

/** Send an image or PDF badge for barcode extraction + print. */
export async function printBadge(file: File): Promise<number> {
  const buf = await file.arrayBuffer();
  const res = await fetch("/api/print-badge", {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: buf,
  });
  const data = await json<{ badges: number }>(res);
  return data.badges;
}

/** Ask the backend to shut down. */
export async function exitApp(): Promise<void> {
  await fetch("/api/exit", { method: "POST" }).catch(() => {});
}
