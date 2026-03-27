import { html, nothing, type TemplateResult } from "lit";
import type { MealCategory, MealIngredient, IndexedLogItem, VoedingslogConfig } from "../types.js";
import { NUTRIENTS_META } from "../helpers/nutrients.js";
import { DEFAULT_CATEGORY_LABELS } from "../helpers/categories.js";
import { renderDialogHeader } from "../ui/dialog-header.js";

interface EditViewParams {
  item: IndexedLogItem;
  config: VoedingslogConfig | null;
  selectedDate: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function renderEditView(params: EditViewParams): TemplateResult {
  const { item, config, selectedDate, onClose, onConfirm } = params;
  const hasComponents = !!item.components?.length;

  return html`
    ${renderDialogHeader(item.name, onClose)}
    <div class="dialog-body">
      <div class="form-field">
        <label>Naam</label>
        <input type="text" id="edit-name-input" .value=${item.name} />
      </div>

      ${hasComponents
        ? _renderComponentEdit(item.components!)
        : html`
          <div class="form-field">
            <label>Gewicht (gram)</label>
            <input type="number" id="edit-weight-input"
              .value=${String(item.grams)} min="1" step="1" inputmode="numeric" />
          </div>
        `}

      <div class="form-field">
        <label>Maaltijd</label>
        <select id="edit-category-select">
          ${(["breakfast", "lunch", "dinner", "snack"] as MealCategory[]).map(
            (cat) => html`
              <option value=${cat} ?selected=${cat === item.category}>
                ${(config?.category_labels || DEFAULT_CATEGORY_LABELS)[cat]}
              </option>
            `
          )}
        </select>
      </div>

      <div class="form-field">
        <label>Datum</label>
        <input type="date" id="edit-date-input" .value=${selectedDate} />
      </div>

      ${!hasComponents ? html`
        <div class="nutrient-edit-section">
          <div class="preview-title">Voedingswaarden per 100g</div>
          ${Object.entries(config?.nutrients || {}).map(
            ([key, meta]) => {
              const factor = NUTRIENTS_META[key] || 1;
              const displayVal = ((item.nutrients?.[key] || 0) * factor).toFixed(2);
              return html`
                <div class="form-field form-field-inline">
                  <label>${meta.label} (${meta.unit})</label>
                  <input type="number" id="edit-nutrient-${key}"
                    .value=${displayVal}
                    min="0" step="0.01" inputmode="decimal" />
                </div>
              `;
            }
          )}
        </div>
      ` : nothing}

      <button class="btn-primary btn-confirm" @click=${onConfirm}>
        <ha-icon icon="mdi:check"></ha-icon>
        Opslaan
      </button>
    </div>
  `;
}

function _renderComponentEdit(components: MealIngredient[]): TemplateResult {
  return html`
    <div class="component-list">
      <div class="preview-title">Onderdelen</div>
      ${components.map(
        (c, idx) => html`
          <div class="component-row">
            <span class="component-name">${c.name}</span>
            <input type="number" class="component-grams-input"
              id="edit-component-${idx}"
              .value=${String(c.grams)} min="0" step="1" inputmode="numeric" />
            <span class="ingredient-unit">g</span>
          </div>
        `
      )}
    </div>
  `;
}
