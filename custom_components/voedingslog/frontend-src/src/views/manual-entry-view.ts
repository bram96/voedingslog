import { html, nothing, type TemplateResult } from "lit";
import type { Product, VoedingslogConfig } from "../types.js";
import { renderNutrientFields } from "../ui/nutrient-fields.js";
import { renderDialogHeader } from "../ui/dialog-header.js";

interface ManualEntryViewParams {
  prefill: Product | null;
  config: VoedingslogConfig | null;
  onClose: () => void;
  onConfirm: () => void;
  onPhoto: () => void;
}

export function renderManualEntryView(params: ManualEntryViewParams): TemplateResult {
  const { prefill, config, onClose, onConfirm, onPhoto } = params;
  return html`
    ${renderDialogHeader(prefill ? "Controleer voedingswaarden" : "Handmatig toevoegen", onClose)}
    <div class="dialog-body">
      ${prefill ? html`<p class="manual-hint">Door AI herkend. Controleer en pas aan indien nodig.</p>` : nothing}
      <div class="form-field">
        <label>Productnaam</label>
        <input type="text" id="manual-name"
          placeholder="Bijv. Zelfgemaakte soep"
          .value=${prefill?.name || ""} />
      </div>
      <p class="manual-hint">Voedingswaarden per 100g:</p>
      ${renderNutrientFields(prefill?.nutrients, "manual")}
      ${!prefill && !!config?.ai_task_entity ? html`
        <button class="btn-secondary btn-confirm" @click=${onPhoto}>
          <ha-icon icon="mdi:camera"></ha-icon>
          Foto van etiket (AI)
        </button>
      ` : nothing}
      <button class="btn-primary btn-confirm" @click=${onConfirm}>
        <ha-icon icon="mdi:arrow-right"></ha-icon>
        Verder
      </button>
    </div>
  `;
}
