import { html, type TemplateResult } from "lit";
import type { MealIngredient, Product, VoedingslogConfig } from "../types.js";
import { KEY_NUTRIENTS_DISPLAY } from "../helpers/nutrients.js";
import { renderDialogHeader } from "../ui/dialog-header.js";
import { renderCategorySelect, renderDateInput, renderPortionChips } from "../ui/form-helpers.js";

interface WeightViewParams {
  product: Product;
  components: MealIngredient[] | null;
  config: VoedingslogConfig | null;
  selectedDate: string;
  shadow: ShadowRoot | null;
  onClose: () => void;
  onConfirm: () => void;
  onComponentChange: (idx: number, grams: number) => void;
  requestUpdate: () => void;
}

export function renderWeightView(params: WeightViewParams): TemplateResult {
  const { product, components, config, selectedDate, shadow, onClose, onConfirm, onComponentChange, requestUpdate } = params;
  const isComponent = !!components?.length;

  return html`
    ${renderDialogHeader(product.name, onClose)}
    <div class="dialog-body">
      ${isComponent
        ? _renderComponentSection(components!, onComponentChange, requestUpdate)
        : _renderSimpleSection(product, shadow, requestUpdate)}

      ${renderCategorySelect(undefined, config?.category_labels)}
      ${renderDateInput(selectedDate)}

      <button class="btn-primary btn-confirm" @click=${onConfirm}>
        <ha-icon icon="mdi:plus"></ha-icon>
        Toevoegen
      </button>
    </div>
  `;
}

function _renderSimpleSection(p: Product, shadow: ShadowRoot | null, requestUpdate: () => void): TemplateResult {
  const weightInput = shadow?.getElementById("weight-input") as HTMLInputElement | null;
  const grams = parseFloat(weightInput?.value || "") || p.serving_grams || 100;
  const factor = grams / 100;

  return html`
    <div class="form-field">
      <label>Gewicht (gram)</label>
      ${renderPortionChips(p.portions || [], shadow, "weight-input", requestUpdate, grams)}
      <input type="number" id="weight-input"
        .value=${String(p.serving_grams || 100)}
        min="1" step="1" inputmode="numeric"
        @input=${requestUpdate} />
    </div>

    <div class="nutrient-preview">
      <div class="preview-title">Voedingswaarden (${Math.round(grams)}g)</div>
      <div class="nutrient-grid">
        ${KEY_NUTRIENTS_DISPLAY.map(
          (n) => html`
            <div class="nutrient-row">
              <span>${n.label}</span>
              <span>${((p.nutrients?.[n.key] || 0) * factor).toFixed(n.decimals)} ${n.unit}</span>
            </div>
          `
        )}
      </div>
    </div>
  `;
}

function _renderComponentSection(
  components: MealIngredient[],
  onComponentChange: (idx: number, grams: number) => void,
  requestUpdate: () => void,
): TemplateResult {
  const totalGrams = components.reduce((sum, c) => sum + c.grams, 0);
  return html`
    <div class="component-list">
      <div class="preview-title">Onderdelen</div>
      ${components.map(
        (c, idx) => html`
          <div class="component-row">
            <span class="component-name">${c.name}</span>
            <input type="number" class="component-grams-input"
              .value=${String(c.grams)} min="0" step="1" inputmode="numeric"
              @change=${(e: Event) => {
                onComponentChange(idx, parseFloat((e.target as HTMLInputElement).value) || 0);
                requestUpdate();
              }} />
            <span class="ingredient-unit">g</span>
          </div>
        `
      )}
      <div class="component-total">
        <span>Totaal</span>
        <span>${Math.round(totalGrams)}g</span>
      </div>
    </div>
  `;
}
