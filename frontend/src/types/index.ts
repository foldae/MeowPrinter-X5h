/** A BLE device discovered by the backend scanner. */
export interface Device {
  name: string;
  address: string;
}

/** Print-related settings synced with the backend. */
export interface PrintSettings {
  processMode: "picture" | "pattern" | "text";
  brightness: number; // 0-256
  energy: number; // 0-256, step 32
  quality: number; // 28-40, step 4
  rotate: boolean;
  transparentAsWhite: boolean;
}

/** App-level settings (persisted via the backend config). */
export interface AppSettings {
  scanTime: number; // 1-10 seconds
  dryRun: boolean;
  flipH: boolean;
  flipV: boolean;
}

/** Shape returned by GET /api/settings. */
export interface BackendSettings {
  config_path: string;
  version: number;
  first_run: boolean;
  is_android: boolean;
  scan_time: number;
  dry_run: boolean;
  energy: number;
  quality: number;
  flip_h?: boolean;
  flip_v?: boolean;
}

/** Tabs shown in the bottom nav. */
export type TabId = "print" | "settings" | "about";

/** Source content type selected by the user. */
export type SourceKind = "none" | "image" | "pdf" | "badge";
