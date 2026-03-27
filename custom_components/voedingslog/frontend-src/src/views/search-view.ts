import { html, nothing, type TemplateResult } from "lit";
import type { Product } from "../types.js";
import type { ProductSearch } from "../product-search.js";
import { renderDialogHeader } from "../ui/dialog-header.js";

interface SearchViewParams {
  search: ProductSearch;
  favorites: Product[];
  onClose: () => void;
  onSelected: (p: Product) => void;
  renderResult: (p: Product) => TemplateResult;
  onBarcode: () => void;
  onManual: () => void;
}

export function renderSearchView(params: SearchViewParams): TemplateResult {
  const { search, favorites, onClose, onSelected, renderResult, onBarcode, onManual } = params;
  const showFavorites = !search.query.trim() && favorites.length > 0;
  return html`
    ${renderDialogHeader("Zoek product", onClose)}
    <div class="dialog-body">
      ${showFavorites
        ? html`
          <div class="favorites-section">
            <div class="section-label"><ha-icon icon="mdi:star" style="--mdc-icon-size:16px;vertical-align:middle;color:#ff9800"></ha-icon> Favorieten</div>
            ${favorites.map((p) => renderResult(p))}
          </div>
        `
        : nothing}
      ${search.renderSearchBar(
        (p) => onSelected(p),
        { renderResult: (p) => renderResult(p) },
      )}
      <div class="ai-validate-actions" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--divider-color)">
        <button class="btn-secondary btn-confirm" @click=${onBarcode}>
          <ha-icon icon="mdi:barcode-scan"></ha-icon>
          Barcode
        </button>
        <button class="btn-secondary btn-confirm" @click=${onManual}>
          <ha-icon icon="mdi:pencil-plus"></ha-icon>
          Handmatig
        </button>
      </div>
    </div>
  `;
}
