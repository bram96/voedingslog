import { html, nothing, type TemplateResult } from "lit";
import { renderDialogHeader } from "../ui/dialog-header.js";

interface BarcodeViewParams {
  scanning: boolean;
  scanFailed: boolean;
  onClose: () => void;
  onBarcodePhoto: (e: Event) => void;
  onOpenFileInput: (id: string) => void;
  onLookup: () => void;
}

export function renderBarcodeView(params: BarcodeViewParams): TemplateResult {
  const { scanning, scanFailed, onClose, onBarcodePhoto, onOpenFileInput, onLookup } = params;
  return html`
    ${renderDialogHeader("Scan barcode", onClose)}
    <div class="dialog-body">
      ${scanFailed
        ? html`
          <input type="file" accept="image/*" id="file-input-barcode"
            @change=${(e: Event) => onBarcodePhoto(e)} style="display:none" />
          <button class="btn-primary photo-btn" @click=${() => onOpenFileInput("file-input-barcode")}>
            <ha-icon icon="mdi:image"></ha-icon>
            Foto van barcode
          </button>
        `
        : html`
          <div id="barcode-scanner-placeholder" class="scanner-area">
            ${scanning
              ? nothing
              : html`<p class="scanner-hint">Camera wordt gestart...</p>`}
          </div>
        `}
      <div class="manual-barcode">
        <span>Of voer handmatig in:</span>
        <div class="input-row">
          <input type="text" id="manual-barcode" placeholder="Barcode nummer"
            inputmode="numeric"
            @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") onLookup(); }} />
          <button class="btn-primary" @click=${onLookup}>Zoek</button>
        </div>
      </div>
    </div>
  `;
}
