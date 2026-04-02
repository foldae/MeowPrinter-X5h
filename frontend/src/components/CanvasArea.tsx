import { useRef } from "preact/hooks";
import {
  sourceKind,
  sourceImage,
  sourceFile,
  isPrinting,
  canPrint,
  showTextModal,
  statusMessage,
  processMode,
  energyCssFilter,
} from "../hooks/useStore";
import { useCanvas } from "../hooks/useCanvas";
import { canvasToPbm } from "../utils/image-processing";
import { printPbm, printPdf, printBadge, updateSettings } from "../utils/api-client";
import { t } from "../hooks/useI18n";
import { energy, quality } from "../hooks/useStore";
import { TextModal } from "./TextModal";

export function CanvasArea() {
  const tr = t.value;
  const canvasRef = useCanvas();
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const badgeRef = useRef<HTMLInputElement>(null);

  const kind = sourceKind.value;
  const file = sourceFile.value;

  // ── file handlers ──────────────────────────────────────────────────

  const loadImage = (f: File) => {
    if (!f.type.startsWith("image/")) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      sourceImage.value = img;
      sourceKind.value = "image";
      sourceFile.value = null;
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const loadPdf = (f: File) => {
    sourceImage.value = null;
    sourceFile.value = f;
    sourceKind.value = "pdf";
  };

  const loadBadge = (f: File) => {
    sourceImage.value = null;
    sourceFile.value = f;
    sourceKind.value = "badge";
  };

  // ── print ──────────────────────────────────────────────────────────

  const handlePrint = async () => {
    isPrinting.value = true;
    statusMessage.value = tr("printing");
    try {
      // Sync energy + quality right before printing
      await updateSettings({ energy: energy.value, quality: quality.value });

      if (kind === "pdf" && file) {
        const pages = await printPdf(file);
        statusMessage.value = `${tr("finished")} (${pages} pages)`;
      } else if (kind === "badge" && file) {
        const count = await printBadge(file);
        statusMessage.value = `${tr("finished")} (${count} badges)`;
      } else if (canvasRef.current) {
        const pbm = canvasToPbm(canvasRef.current);
        await printPbm(pbm);
        statusMessage.value = tr("finished");
      }
    } catch (e) {
      statusMessage.value = String(e);
    } finally {
      isPrinting.value = false;
    }
  };

  const reset = () => {
    sourceImage.value = null;
    sourceFile.value = null;
    sourceKind.value = "none";
    statusMessage.value = "";
  };

  // ── drag & drop ────────────────────────────────────────────────────

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (f.type === "application/pdf") loadPdf(f);
    else if (f.type.startsWith("image/")) loadImage(f);
  };

  // ── render ─────────────────────────────────────────────────────────

  return (
    <div class="workspace">
      {/* hidden file inputs */}
      <input
        type="file"
        ref={fileRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) loadImage(f);
          (e.target as HTMLInputElement).value = "";
        }}
      />
      <input
        type="file"
        ref={pdfRef}
        style={{ display: "none" }}
        accept="application/pdf"
        onChange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) loadPdf(f);
          (e.target as HTMLInputElement).value = "";
        }}
      />
      <input
        type="file"
        ref={badgeRef}
        style={{ display: "none" }}
        accept="application/pdf,image/*"
        onChange={(e) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (f) loadBadge(f);
          (e.target as HTMLInputElement).value = "";
        }}
      />

      {/* toolbar */}
      <div class="toolbar">
        <button class="btn-action" onClick={() => fileRef.current?.click()}>
          <IconImage />
          {tr("insert-picture")}
        </button>
        <button class="btn-action" onClick={() => (showTextModal.value = true)}>
          <IconText />
          {tr("insert-text")}
        </button>
        <button class="btn-action hide-on-android" onClick={() => pdfRef.current?.click()}>
          <IconPdf />
          {tr("insert-pdf")}
        </button>
        <button class="btn-action" onClick={() => badgeRef.current?.click()}>
          <IconBadge />
          {tr("print-badge")}
        </button>
      </div>

      {/* canvas area */}
      <div class="canvas-container" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        {kind === "none" && (
          <div class="canvas-placeholder">
            <IconUpload />
            <p class="text-center">
              <span class="desktop-only">{tr("desktop-drag-or-buttons")}</span>
              <span class="mobile-only">{tr("mobile-use-buttons-above")}</span>
            </p>
          </div>
        )}
        {kind === "pdf" && file && (
          <div class="canvas-placeholder">
            <IconPdf />
            <p style={{ color: "var(--text)", marginTop: "8px" }}>
              PDF: <strong>{file.name}</strong>
            </p>
          </div>
        )}
        {kind === "badge" && file && (
          <div class="canvas-placeholder">
            <IconBadge />
            <p style={{ color: "var(--text)", marginTop: "8px" }}>
              Badge: <strong>{file.name}</strong>
            </p>
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: kind === "image" ? "block" : "none", filter: energyCssFilter.value }} />
      </div>

      {/* bottom actions */}
      <div class="bottom-bar">
        <button class="btn-secondary" onClick={reset}>
          {tr("reset")}
        </button>
        <button class="btn-primary large" onClick={handlePrint} disabled={!canPrint.value}>
          <IconPrinter />
          {isPrinting.value ? tr("printing") : tr("print")}
        </button>
      </div>

      {/* text modal */}
      {showTextModal.value && <TextModal />}
    </div>
  );
}

// ── inline SVG icons (small, no deps) ──────────────────────────────────

function IconImage() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
function IconText() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}
function IconPdf() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function IconBadge() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function IconPrinter() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}
