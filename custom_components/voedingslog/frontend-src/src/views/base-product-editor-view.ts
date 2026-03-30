/**
 * Base product editor view — renders the form for creating/editing a base product.
 * Pure function: (data) => TemplateResult, no class, no state.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { BaseProduct, Portion, UnifiedProduct, VoedingslogConfig } from "../types.js";
import { renderNutrientFields } from "../ui/nutrient-fields.js";
import { renderDialogHeader } from "../ui/dialog-header.js";

export interface BaseProductEditorCallbacks {
  onClose: () => void;
  onSave: () => void;
  onPhoto: () => void;
  onRefresh: (productId: string) => void;
  onMerge: (productId: string) => void;
  onAddAlias: () => void;
  onRemoveAlias: (index: number) => void;
  onAddPortion: () => void;
  onRemovePortion: (index: number) => void;
  onUpdatePortion: (index: number, label: string, grams: number) => void;
}

export interface BaseProductEditorParams {
  product: BaseProduct;
  config: VoedingslogConfig | null;
  callbacks: BaseProductEditorCallbacks;
}

function renderAliasEditor(
  product: UnifiedProduct,
  onAdd: () => void,
  onRemove: (index: number) => void,
): TemplateResult {
  const aliases = product.aliases || [];
  if (!product.id) {
    // New product — no aliases yet
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

function _renderPortionsEditor(portions: Portion[], callbacks: BaseProductEditorCallbacks): TemplateResult {
  return html`
    <div class="form-field">
      <label>Porties</label>
      ${portions.map(
        (p, idx) => html`
          <div class="portion-edit-row">
            <input type="text" class="portion-label-input" .value=${p.label}
              placeholder="Naam (bijv. 1 snee)"
              @change=${(e: Event) => callbacks.onUpdatePortion(idx, (e.target as HTMLInputElement).value, p.grams)} />
            <input type="number" class="portion-grams-input" .value=${String(p.grams)}
              min="1" step="1" inputmode="numeric" placeholder="g"
              @change=${(e: Event) => callbacks.onUpdatePortion(idx, p.label, parseFloat((e.target as HTMLInputElement).value) || p.grams)} />
            <span class="ingredient-unit">g</span>
            <button class="item-delete" @click=${() => callbacks.onRemovePortion(idx)}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
        `
      )}
      ${portions.length === 0 ? html`<p class="empty-hint" style="margin:4px 0">Geen porties ingesteld. Standaard 100g.</p>` : nothing}
      <button class="btn-secondary" style="width:100%;margin-top:4px;padding:6px" @click=${() => callbacks.onAddPortion()}>
        <ha-icon icon="mdi:plus"></ha-icon> Portie toevoegen
      </button>
    </div>
  `;
}

export function renderBaseProductEditor(params: BaseProductEditorParams): TemplateResult {
  const { product, config, callbacks } = params;

  return html`
    ${renderDialogHeader(product.id ? "Product bewerken" : "Nieuw product", callbacks.onClose)}
    <div class="dialog-body">
      <div class="form-field">
        <label>Naam</label>
        <input type="text" id="product-name-input" .value=${product.name || ""} placeholder="Bijv. Volkoren brood" />
      </div>

      ${_renderPortionsEditor(product.portions || [], callbacks)}

      ${renderAliasEditor(product, callbacks.onAddAlias, callbacks.onRemoveAlias)}

      <p class="manual-hint">Voedingswaarden per 100g:</p>
      ${renderNutrientFields(product.nutrients, "product")}

      ${!product.id && !!config?.ai_task_entity ? html`
        <button class="btn-secondary btn-confirm" @click=${() => callbacks.onPhoto()}>
          <ha-icon icon="mdi:camera"></ha-icon>
          Foto van etiket (AI)
        </button>
      ` : nothing}

      ${product.id ? html`
        <button class="btn-secondary btn-confirm" @click=${() => callbacks.onRefresh(product.id)}>
          <ha-icon icon="mdi:refresh"></ha-icon>
          Ververs vanuit Open Food Facts
        </button>
        <button class="btn-secondary btn-confirm" @click=${() => callbacks.onMerge(product.id)}>
          <ha-icon icon="mdi:merge"></ha-icon>
          Duplicaat samenvoegen
        </button>
      ` : nothing}

      <button class="btn-primary btn-confirm" @click=${() => callbacks.onSave()}>
        <ha-icon icon="mdi:check"></ha-icon>
        Opslaan
      </button>
    </div>
  `;
}
