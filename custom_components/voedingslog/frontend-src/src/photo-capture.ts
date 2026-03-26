/**
 * Shared photo capture UI and utilities.
 * Renders the "Open camera" / "Kies afbeelding" buttons,
 * live viewfinder with capture button, and analyzing spinner.
 */
import { html, type TemplateResult } from "lit";

export interface PhotoCaptureHost {
  _photoCameraActive: boolean;
  _analyzing: boolean;
  _startPhotoCamera(): Promise<void>;
  _openFileInput(id: string): void;
}

/**
 * Render a photo picker UI with camera + file input options.
 * @param host - Component with camera state and methods
 * @param fileInputId - Unique ID for the hidden file input
 * @param onFileChange - Handler for file input change events
 * @param onCapture - Handler called when user captures from live camera (receives base64)
 * @param hint - Hint text shown above the buttons
 */
export function renderPhotoPicker(
  host: PhotoCaptureHost,
  fileInputId: string,
  onFileChange: (e: Event) => void,
  onCapture: () => void,
  hint: string,
): TemplateResult {
  if (host._analyzing) {
    return html`
      <div class="analyzing">
        <ha-circular-progress indeterminate></ha-circular-progress>
        <p>Analyseren...</p>
      </div>
    `;
  }

  if (host._photoCameraActive) {
    return html`
      <div id="photo-camera-placeholder" class="scanner-area"></div>
      <button class="btn-primary camera-capture-btn" style="margin-top:8px" @click=${onCapture}>
        <ha-icon icon="mdi:camera"></ha-icon> Maak foto
      </button>
    `;
  }

  return html`
    <p class="photo-hint">${hint}</p>
    <div class="photo-buttons">
      <button class="btn-primary photo-btn" @click=${() => host._startPhotoCamera()}>
        <ha-icon icon="mdi:camera"></ha-icon> Open camera
      </button>
      <button class="btn-secondary photo-btn" @click=${() => host._openFileInput(fileInputId)}>
        <ha-icon icon="mdi:image"></ha-icon> Kies afbeelding
      </button>
    </div>
    <input type="file" accept="image/*"
      id=${fileInputId}
      @change=${onFileChange}
      style="display:none" />
  `;
}

/**
 * Read a file input's first file as base64.
 */
export function readFileAsBase64(e: Event): Promise<string | null> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
