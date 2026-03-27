import { html, type TemplateResult } from "lit";

export function renderDialogHeader(title: string, onClose: () => void): TemplateResult {
  return html`
    <div class="dialog-header">
      <h2>${title}</h2>
      <button class="close-btn" @click=${onClose}>
        <ha-icon icon="mdi:close"></ha-icon>
      </button>
    </div>
  `;
}
