import { html, type TemplateResult } from "lit";
import type { MealCategory, Portion } from "../types.js";
import { DEFAULT_CATEGORY_LABELS, defaultCategory } from "../helpers/categories.js";

export function renderCategorySelect(
  selected?: MealCategory,
  labels?: Record<MealCategory, string>,
  id = "category-select",
): TemplateResult {
  const l = labels || DEFAULT_CATEGORY_LABELS;
  const sel = selected || defaultCategory();
  return html`
    <div class="form-field">
      <label>Maaltijd</label>
      <select id=${id}>
        ${(["breakfast", "lunch", "dinner", "snack"] as MealCategory[]).map(
          (cat) => html`<option value=${cat} ?selected=${cat === sel}>${l[cat]}</option>`
        )}
      </select>
    </div>
  `;
}

export function renderDateInput(value: string, id = "log-date-input"): TemplateResult {
  return html`
    <div class="form-field">
      <label>Datum</label>
      <input type="date" id=${id} .value=${value} />
    </div>
  `;
}

export function renderPortionChips(
  portions: Portion[],
  shadow: ShadowRoot | null,
  weightInputId: string,
  requestUpdate: () => void,
  selectedGrams?: number,
): TemplateResult {
  if (!portions || portions.length === 0) return html``;
  return html`
    <div class="portion-chips">
      ${portions.map(
        (p) => html`
          <button class="portion-chip ${selectedGrams === p.grams ? "active" : ""}" @click=${() => {
            const input = shadow?.getElementById(weightInputId) as HTMLInputElement | null;
            if (input) { input.value = String(p.grams); requestUpdate(); }
          }}>
            ${p.label}
          </button>
        `
      )}
    </div>
  `;
}
