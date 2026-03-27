/**
 * Recipe editor view — renders the form for creating/editing a recipe.
 * Pure function: (data) => TemplateResult, no class, no state.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { Recipe, UnifiedProduct, VoedingslogConfig } from "../types.js";
import { NUTRIENTS_META } from "../helpers/nutrients.js";
import { renderDialogHeader } from "../ui/dialog-header.js";

export interface RecipeEditorCallbacks {
  onClose: () => void;
  onSave: () => void;
  onAddIngredient: () => void;
  onRemoveIngredient: (index: number) => void;
  onToggleIngredientEdit: (index: number) => void;
  onUpdateIngredientGrams: (index: number, grams: number) => void;
  onUpdateIngredientName: (index: number, name: string) => void;
  onUpdateIngredientNutrient: (index: number, key: string, value: number) => void;
  onOpenAiIngredients: () => void;
  onAddAlias: () => void;
  onRemoveAlias: (index: number) => void;
}

export interface RecipeEditorParams {
  recipe: Recipe;
  config: VoedingslogConfig | null;
  editingIngredientIndex: number | null;
  callbacks: RecipeEditorCallbacks;
}

function renderAliasEditor(
  product: UnifiedProduct,
  onAdd: () => void,
  onRemove: (index: number) => void,
): TemplateResult {
  const aliases = product.aliases || [];
  if (!product.id) {
    return html``;
  }
  return html`
    <div class="form-field">
      <label>Aliassen <span style="font-weight:normal;color:var(--secondary-text-color)">(alternatieve namen voor zoeken)</span></label>
      ${aliases.map(
        (alias, idx) => html`
          <div class="alias-row">
            <span class="alias-name">${alias}</span>
            <button class="item-delete" @click=${() => onRemove(idx)}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
        `
      )}
      <div class="input-row" style="margin-top:4px">
        <input type="text" id="new-alias-input" placeholder="Nieuw alias..."
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") onAdd(); }} />
        <button class="btn-secondary" style="padding:6px 12px" @click=${() => onAdd()}>
          <ha-icon icon="mdi:plus"></ha-icon>
        </button>
      </div>
    </div>
  `;
}

export function renderRecipeEditor(params: RecipeEditorParams): TemplateResult {
  const { recipe, config, editingIngredientIndex, callbacks } = params;
  const ingredients = recipe.ingredients || [];

  return html`
    ${renderDialogHeader(recipe.id ? "Recept bewerken" : "Nieuw recept", callbacks.onClose)}
    <div class="dialog-body">
      <div class="form-field">
        <label>Naam</label>
        <input type="text" id="recipe-name-input" .value=${recipe.name || ""} placeholder="Bijv. Pasta bolognese" />
      </div>

      <div class="form-field">
        <label>Type recept</label>
        <select id="recipe-type-select">
          <option value="fixed" ?selected=${recipe.recipe_type === "fixed"}>Vast recept (portie van geheel)</option>
          <option value="component" ?selected=${recipe.recipe_type === "component"}>Samengesteld (losse onderdelen)</option>
        </select>
      </div>

      <div class="form-field">
        <label>Standaard portie (gram)</label>
        <input type="number" id="recipe-portion-input" .value=${String(recipe.preferred_portion || "")}
          placeholder="Bijv. 400" min="1" step="1" inputmode="numeric" />
      </div>

      ${renderAliasEditor(recipe, callbacks.onAddAlias, callbacks.onRemoveAlias)}

      <div class="meal-ingredients-section">
        <label class="section-label">Ingredi\u00ebnten</label>
        ${ingredients.map(
          (ing, idx) => html`
            <div class="ingredient-row">
              <span class="ingredient-name" @click=${() => callbacks.onToggleIngredientEdit(idx)}
                style="cursor:pointer;flex:1">${ing.name}</span>
              <input type="number" class="ingredient-grams-input" .value=${String(ing.grams)}
                min="1" step="1" inputmode="numeric"
                @change=${(e: Event) => callbacks.onUpdateIngredientGrams(idx, parseFloat((e.target as HTMLInputElement).value))} />
              <span class="ingredient-unit">g</span>
              <button class="item-edit" @click=${() => callbacks.onToggleIngredientEdit(idx)}>
                <ha-icon icon="mdi:pencil"></ha-icon>
              </button>
              <button class="item-delete" @click=${() => callbacks.onRemoveIngredient(idx)}>
                <ha-icon icon="mdi:close"></ha-icon>
              </button>
            </div>
            ${editingIngredientIndex === idx ? html`
              <div class="ingredient-nutrients">
                <div class="form-field form-field-inline">
                  <label>Naam</label>
                  <input type="text" .value=${ing.name}
                    @change=${(e: Event) => callbacks.onUpdateIngredientName(idx, (e.target as HTMLInputElement).value)} />
                </div>
                ${Object.entries(config?.nutrients || {}).map(
                  ([key, meta]) => {
                    const factor = (NUTRIENTS_META as Record<string, number>)[key] || 1;
                    const displayVal = ((ing.nutrients?.[key] || 0) * factor).toFixed(2);
                    return html`
                    <div class="form-field form-field-inline">
                      <label>${meta.label} (${meta.unit}/100g)</label>
                      <input type="number" .value=${displayVal}
                        min="0" step="0.01" inputmode="decimal"
                        @change=${(e: Event) => callbacks.onUpdateIngredientNutrient(idx, key, parseFloat((e.target as HTMLInputElement).value) / factor)} />
                    </div>
                  `;}
                )}
              </div>
            ` : nothing}
          `
        )}

        <button class="btn-secondary" style="width:100%;margin-top:8px" @click=${() => callbacks.onAddIngredient()}>
          <ha-icon icon="mdi:plus"></ha-icon> Ingredi\u00ebnt zoeken
        </button>
      </div>

      ${!!config?.ai_task_entity ? html`
        <button class="btn-secondary btn-confirm" @click=${() => callbacks.onOpenAiIngredients()}>
          <ha-icon icon="mdi:text-box-outline"></ha-icon>
          AI ingredi\u00ebnten invoer
        </button>
      ` : nothing}

      <button class="btn-primary btn-confirm" @click=${() => callbacks.onSave()}>
        <ha-icon icon="mdi:check"></ha-icon>
        Opslaan
      </button>
    </div>
  `;
}
