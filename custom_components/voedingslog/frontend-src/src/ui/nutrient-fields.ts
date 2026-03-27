import { html, type TemplateResult } from "lit";
import type { NutrientMap } from "../types.js";
import { EDITABLE_NUTRIENTS, NUTRIENTS_META } from "../helpers/nutrients.js";

/**
 * Render editable nutrient input fields with display unit conversion.
 * @param nutrients Current nutrient values (storage units)
 * @param idPrefix HTML id prefix for inputs (e.g. "manual", "product")
 */
export function renderNutrientFields(
  nutrients: NutrientMap | undefined,
  idPrefix: string,
): TemplateResult {
  return html`
    <div class="manual-fields">
      ${EDITABLE_NUTRIENTS.map((f) => {
        const factor = NUTRIENTS_META[f.key] || 1;
        const displayVal = ((nutrients?.[f.key] ?? 0) * factor);
        return html`
          <div class="manual-field-row">
            <label>${f.label}</label>
            <input type="number" id="${idPrefix}-${f.key}" min="0" step="0.1" inputmode="decimal"
              .value=${String(displayVal)} />
          </div>
        `;
      })}
    </div>
  `;
}

/**
 * Read nutrient values from form inputs, converting from display to storage units.
 */
export function readNutrientFields(
  idPrefix: string,
  shadow: ShadowRoot | null,
): NutrientMap {
  const nutrients: NutrientMap = {};
  for (const f of EDITABLE_NUTRIENTS) {
    const input = shadow?.getElementById(`${idPrefix}-${f.key}`) as HTMLInputElement | null;
    const displayVal = parseFloat(input?.value || "0") || 0;
    const factor = NUTRIENTS_META[f.key] || 1;
    nutrients[f.key] = displayVal / factor;
  }
  return nutrients;
}
