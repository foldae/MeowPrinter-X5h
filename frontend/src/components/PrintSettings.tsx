import { useState } from "preact/hooks";
import {
  processMode,
  brightness,
  energy,
  quality,
  rotate,
  rotate180,
  flipH,
  flipV,
} from "../hooks/useStore";
import { updateSettings } from "../utils/api-client";
import { t } from "../hooks/useI18n";

export function PrintSettings() {
  const tr = t.value;
  const [showMore, setShowMore] = useState(false);

  const syncSetting = (key: string, value: number | boolean) => {
    updateSettings({ [key]: value }).catch(() => {});
  };

  return (
    <div class="panel card">
      {/* Dithering algorithm */}
      <div class="form-group">
        <label>{tr("process-as-")}</label>
        <div class="radio-group">
          {(["picture", "pattern", "text"] as const).map((mode) => (
            <label key={mode} class={`radio-pill ${processMode.value === mode ? "active" : ""}`}>
              <input
                type="radio"
                name="processMode"
                value={mode}
                checked={processMode.value === mode}
                onChange={() => (processMode.value = mode)}
              />
              {tr(mode)}
            </label>
          ))}
        </div>
      </div>

      {/* Brightness */}
      <div class="form-group">
        <div class="flex-between">
          <label>{tr("brightness-")}</label>
          <span class="val-badge">{brightness.value}</span>
        </div>
        <input
          type="range"
          min={0}
          max={256}
          value={brightness.value}
          onInput={(e) => (brightness.value = +(e.target as HTMLInputElement).value)}
        />
      </div>

      {/* ── Orientation controls ──────────────────────────────── */}
      <div class="form-group">
        <label>{tr("orientation-label")}</label>
        <div class="orientation-row">
          <button
            class={`orient-btn ${rotate.value ? "active" : ""}`}
            title={tr("rotate-90")}
            onClick={() => (rotate.value = !rotate.value)}
          >
            <IconRotate90 />
            <span>{tr("rotate-90")}</span>
          </button>
          <button
            class={`orient-btn ${rotate180.value ? "active" : ""}`}
            title={tr("rotate-180")}
            onClick={() => (rotate180.value = !rotate180.value)}
          >
            <IconRotate180 />
            <span>{tr("rotate-180")}</span>
          </button>
          <button
            class={`orient-btn ${flipH.value ? "active" : ""}`}
            title={tr("flip-horizontally")}
            onClick={() => {
              flipH.value = !flipH.value;
              syncSetting("flip_h", flipH.value);
            }}
          >
            <IconFlipH />
            <span>{tr("flip-h-short")}</span>
          </button>
          <button
            class={`orient-btn ${flipV.value ? "active" : ""}`}
            title={tr("flip-vertically")}
            onClick={() => {
              flipV.value = !flipV.value;
              syncSetting("flip_v", flipV.value);
            }}
          >
            <IconFlipV />
            <span>{tr("flip-v-short")}</span>
          </button>
        </div>
        <CatFaceIndicator rotated180={rotate180.value} />
      </div>

      {/* ── More options toggle ──────────────────────────────── */}
      <div class="form-group" style={{ textAlign: "center", marginBottom: 0 }}>
        <button
          class="btn-more-options"
          onClick={() => setShowMore(!showMore)}
        >
          {showMore ? tr("hide-more-options") : tr("show-more-options")}
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            style={{ transform: showMore ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* ── Hidden advanced options ──────────────────────────── */}
      {showMore && (
        <>
          {/* Thermal strength */}
          <div class="form-group">
            <div class="flex-between">
              <label>{tr("strength-")}</label>
              <span class="val-badge">{energy.value}</span>
            </div>
            <input
              type="range"
              min={0}
              max={256}
              step={32}
              value={energy.value}
              onInput={(e) => {
                const v = +(e.target as HTMLInputElement).value;
                energy.value = v;
                syncSetting("energy", v);
              }}
            />
          </div>

          {/* Quality */}
          <div class="form-group">
            <div class="flex-between">
              <label>{tr("quality-")}</label>
              <span class="val-badge">{quality.value}</span>
            </div>
            <input
              type="range"
              min={28}
              max={40}
              step={4}
              value={quality.value}
              onInput={(e) => {
                const v = +(e.target as HTMLInputElement).value;
                quality.value = v;
                syncSetting("quality", v);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Cat face indicator ──────────────────────────────────────────── */

function CatFaceIndicator({ rotated180 }: { rotated180: boolean }) {
  const tr = t.value;

  return (
    <div class="cat-indicator">
      <div class="cat-indicator-graphic">
        <svg viewBox="0 0 48 44" width="44" height="40">
          <polygon points="8,16 4,2 16,12" fill="var(--text-muted)" opacity="0.5" />
          <polygon points="40,16 44,2 32,12" fill="var(--text-muted)" opacity="0.5" />
          <circle cx="24" cy="24" r="15" fill="none" stroke="var(--text-muted)" stroke-width="2" />
          <circle cx="18" cy="21" r="2" fill="var(--text-muted)" />
          <circle cx="30" cy="21" r="2" fill="var(--text-muted)" />
          <polygon points="24,25 22,28 26,28" fill="var(--accent)" />
          <path d="M20,30 Q24,34 28,30" fill="none" stroke="var(--text-muted)" stroke-width="1.5" />
        </svg>
        <svg viewBox="0 0 24 18" width="24" height="18">
          {rotated180 ? (
            <polyline points="8,14 12,4 16,14" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          ) : (
            <polyline points="8,4 12,14 16,4" fill="none" stroke="var(--text-muted)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          )}
        </svg>
      </div>
      <div class="cat-indicator-text">
        <span class="cat-indicator-label">
          {rotated180 ? tr("cat-text-normal") : tr("cat-text-inverted")}
        </span>
      </div>
    </div>
  );
}

/* ── Icons ──────────────────────────────────────────────────────── */

function IconRotate90() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}
function IconRotate180() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 12a10 10 0 0 1 10-10" />
      <polyline points="12 2 14 4 10 4" />
      <path d="M22 12a10 10 0 0 1-10 10" />
      <polyline points="12 22 10 20 14 20" />
    </svg>
  );
}
function IconFlipH() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 2 12 6 15" />
      <polyline points="18 9 22 12 18 15" />
      <line x1="12" y1="3" x2="12" y2="21" stroke-dasharray="2 2" />
    </svg>
  );
}
function IconFlipV() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 6 12 2 15 6" />
      <polyline points="9 18 12 22 15 18" />
      <line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 2" />
    </svg>
  );
}
