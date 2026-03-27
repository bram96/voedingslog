import { html, type TemplateResult } from "lit";
import { renderDialogHeader } from "../ui/dialog-header.js";
import { renderPhotoPicker, type PhotoCaptureHost } from "../photo-capture.js";

interface PhotoViewParams {
  host: PhotoCaptureHost;
  onClose: () => void;
  onCapture: (e: Event) => void;
  onFrame: () => void;
}

export function renderPhotoView(params: PhotoViewParams): TemplateResult {
  return html`
    ${renderDialogHeader("Foto van etiket", params.onClose)}
    <div class="dialog-body">
      ${renderPhotoPicker(
        params.host,
        "file-input-photo",
        params.onCapture,
        params.onFrame,
        "Maak een foto van het voedingsetiket op de verpakking.",
      )}
    </div>
  `;
}
