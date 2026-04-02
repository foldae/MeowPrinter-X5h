import { useState } from "preact/hooks";
import { showTextModal, sourceImage, sourceKind, sourceFile, processMode } from "../hooks/useStore";
import { PRINTER_WIDTH } from "../utils/image-processing";
import { t } from "../hooks/useI18n";

export function TextModal() {
  const tr = t.value;
  const [text, setText] = useState("");

  const close = () => {
    showTextModal.value = false;
    setText("");
  };

  const insert = () => {
    if (!text.trim()) return;

    const fontSize = 32;
    const padding = 20;
    const lineHeight = fontSize * 1.2;

    // Measure wrapped lines.
    const measure = document.createElement("canvas").getContext("2d")!;
    measure.font = `${fontSize}px sans-serif`;

    const lines: string[] = [];
    for (const para of text.split("\n")) {
      if (!para.trim()) {
        lines.push("");
        continue;
      }
      let line = "";
      for (const word of para.split(" ")) {
        const test = line + word + " ";
        if (measure.measureText(test).width > PRINTER_WIDTH - padding * 2 && line) {
          lines.push(line);
          line = word + " ";
        } else {
          line = test;
        }
      }
      lines.push(line);
    }

    // Render to an off-screen canvas.
    const canvas = document.createElement("canvas");
    canvas.width = PRINTER_WIDTH;
    canvas.height = Math.max(lines.length * lineHeight + padding * 2, 100);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    lines.forEach((l, i) => ctx.fillText(l.trim(), padding, padding + i * lineHeight));

    // Feed as an image into the store.
    const img = new Image();
    img.onload = () => {
      sourceImage.value = img;
      sourceKind.value = "image";
      sourceFile.value = null;
      // Suggest direct-threshold for crisp text.
      if (processMode.value !== "text") processMode.value = "text";
      close();
    };
    img.src = canvas.toDataURL("image/png");
  };

  return (
    <div class="modal-overlay" onClick={close}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          {tr("insert-text")}
          <button class="btn-icon" onClick={close}>
            &times;
          </button>
        </div>

        <textarea
          class="text-input"
          style={{ minHeight: "150px", resize: "vertical" }}
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          placeholder={tr("enter-text")}
        />

        <div class="flex-row mt-sm" style={{ justifyContent: "flex-end" }}>
          <button class="btn-secondary" onClick={close}>
            {tr("cancel")}
          </button>
          <button class="btn-primary" style={{ width: "auto" }} onClick={insert} disabled={!text.trim()}>
            {tr("ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
