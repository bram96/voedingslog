import { html, type TemplateResult } from "lit";
import { renderDialogHeader } from "../ui/dialog-header.js";
import { renderPhotoPicker, type PhotoCaptureHost } from "../photo-capture.js";

interface BatchAddViewParams {
  mode: "log" | "recipe";
  batchMode: "text" | "photo";
  analyzing: boolean;
  host: PhotoCaptureHost;
  onClose: () => void;
  onSubmitText: () => void;
  onSwitchToPhoto: () => void;
  onSwitchToText: () => void;
  onHandwritingPhoto: (e: Event) => void;
  onCaptureHandwriting: () => void;
}

export function renderBatchAddView(params: BatchAddViewParams): TemplateResult {
  const { mode, batchMode, analyzing, host, onClose, onSubmitText, onSwitchToPhoto, onSwitchToText, onHandwritingPhoto, onCaptureHandwriting } = params;
  const isRecipe = mode === "recipe";
  const title = isRecipe ? "AI ingrediënten invoer" : "Batch toevoegen";
  const placeholder = isRecipe
    ? "Bijv. 200g kipfilet, 100g rijst, 150g broccoli, scheutje olijfolie"
    : "Bijv. 2 boterhammen met kaas, een appel, kop koffie met melk";

  return html`
    ${renderDialogHeader(title, onClose)}
    <div class="dialog-body">
      ${batchMode === "text"
        ? html`
          <p style="font-size:13px;color:var(--secondary-text-color);margin-top:0">
            Beschrijf wat je gegeten hebt. AI herkent de producten en zoekt voedingswaarden op.
          </p>
          <textarea
            id="ai-text-input"
            class="ai-textarea"
            placeholder=${placeholder}
          ></textarea>
          ${analyzing
            ? html`<div class="analyzing"><ha-icon icon="mdi:loading" class="spin"></ha-icon> Bezig met analyseren...</div>`
            : html`
              <button class="btn-primary btn-confirm" @click=${onSubmitText}>
                <ha-icon icon="mdi:auto-fix"></ha-icon>
                Analyseren
              </button>
              <button class="btn-secondary btn-confirm" @click=${onSwitchToPhoto}>
                <ha-icon icon="mdi:camera"></ha-icon>
                Foto van handgeschreven lijst
              </button>
            `}
        `
        : html`
          <button class="btn-secondary" style="margin-bottom:12px;width:100%;padding:8px" @click=${onSwitchToText}>
            <ha-icon icon="mdi:keyboard"></ha-icon> Terug naar tekst invoer
          </button>
          ${renderPhotoPicker(
            host,
            "file-input-handwriting",
            onHandwritingPhoto,
            onCaptureHandwriting,
            "Maak een foto van je handgeschreven lijst.",
          )}
        `}
    </div>
  `;
}
