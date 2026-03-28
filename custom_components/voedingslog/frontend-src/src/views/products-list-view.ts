/**
 * Products list view — renders the product/recipe list for both "add" and "manage" modes.
 * Pure function: (data) => TemplateResult, no class, no state.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { Product, UnifiedProduct, VoedingslogConfig } from "../types.js";

type TypeFilter = "all" | "base" | "recipe";

export interface ProductsListCallbacks {
  onProductClick: (product: UnifiedProduct) => void;
  onFavorite: (product: UnifiedProduct) => void;
  onEdit: (product: UnifiedProduct) => void;
  onDelete: (productId: string) => void;
  onSearchInput: (value: string) => void;
  onToggleFavorites: () => void;
  onSetTypeFilter: (filter: TypeFilter) => void;
  onSearchOnline: () => void;
  onAiGuess?: () => void;
  onSelectOnlineProduct: (product: Product) => void;
  onSelectRecentProduct: (product: Product) => void;
  onOpenBarcode: () => void;
  onOpenManual: () => void;
  onOpenBatchAdd: () => void;
  onNewProduct: () => void;
  onNewRecipe: () => void;
  onCleanup: () => void;
  onClose: () => void;
}

export interface ProductsListParams {
  products: UnifiedProduct[];
  filteredProducts: UnifiedProduct[];
  mode: "add" | "manage";
  searchQuery: string;
  showFavoritesOnly: boolean;
  typeFilter: TypeFilter;
  recentItems: Product[];
  onlineResults: Product[];
  onlineSearching: boolean;
  hasAI: boolean;
  config: VoedingslogConfig | null;
  callbacks: ProductsListCallbacks;
}

function typeIcon(product: UnifiedProduct): string {
  if (product.type === "base") return "mdi:food-variant";
  if (product.type === "recipe" && product.recipe_type === "component") return "mdi:view-list";
  return "mdi:pot-steam";
}

function typeMeta(product: UnifiedProduct, mode: "add" | "manage", personCount: number): string {
  if (product.type === "base") {
    const kcal = `${Math.round(product.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g`;
    const tags: string[] = [];
    if (product.completeness !== undefined && product.completeness < 60) tags.push("onvolledig");
    if (mode === "manage" && product.last_used) {
      const days = Math.floor((Date.now() - new Date(product.last_used).getTime()) / 86400000);
      if (days > 90) tags.push(`${days}d niet gebruikt`);
    }
    return tags.length > 0 ? `${kcal} · ${tags.join(" · ")}` : kcal;
  }
  const recipe = product;
  const kcal = Math.round((recipe.nutrients?.["energy-kcal_100g"] || 0) * recipe.total_grams / 100);
  const shared = personCount > 1 ? " · gedeeld" : "";
  return `${recipe.ingredients.length} ingredi\u00ebnten · ${Math.round(recipe.total_grams)}g · ${kcal} kcal${shared}`;
}

function renderProductItem(
  product: UnifiedProduct,
  isAdd: boolean,
  personCount: number,
  mode: "add" | "manage",
  callbacks: ProductsListCallbacks,
): TemplateResult {
  return html`
    <div class="product-item">
      <div class="product-info" @click=${() => callbacks.onProductClick(product)}>
        <div class="product-name-row">
          <ha-icon icon=${typeIcon(product)} style="--mdc-icon-size:18px;margin-right:6px;opacity:0.6"></ha-icon>
          <span class="product-name">${product.name}</span>
        </div>
        <span class="product-meta">${typeMeta(product, mode, personCount)}</span>
      </div>
      <button class="fav-btn" @click=${(e: Event) => { e.stopPropagation(); callbacks.onFavorite(product); }}>
        <ha-icon icon=${product.favorite ? "mdi:star" : "mdi:star-outline"}></ha-icon>
      </button>
      ${!isAdd ? html`
        <button class="item-edit" @click=${() => callbacks.onEdit(product)}>
          <ha-icon icon="mdi:pencil"></ha-icon>
        </button>
        <button class="item-delete" @click=${() => callbacks.onDelete(product.id)}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      ` : nothing}
    </div>
  `;
}

export function renderProductsList(params: ProductsListParams): TemplateResult {
  const {
    products, filteredProducts, mode, searchQuery, showFavoritesOnly,
    typeFilter, recentItems, onlineResults, onlineSearching,
    hasAI, config, callbacks,
  } = params;
  const isAdd = mode === "add";
  const q = searchQuery.trim();
  const personCount = config?.persons?.length || 0;

  // In add mode, show recent + favorites when search is empty
  const showQuickAccess = isAdd && !q && !showFavoritesOnly;
  const favoriteProducts = showQuickAccess ? products.filter((p) => p.favorite) : [];

  return html`
    <div class="dialog-header">
      <h2>${isAdd ? "Toevoegen" : "Producten"}</h2>
      <button class="close-btn" @click=${() => callbacks.onClose()}>
        <ha-icon icon="mdi:close"></ha-icon>
      </button>
    </div>
    <div class="dialog-body">
      <div class="input-row" style="margin-bottom:8px">
        <input type="text" placeholder="Zoek product of recept..."
          .value=${searchQuery}
          @input=${(e: Event) => callbacks.onSearchInput((e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" && searchQuery.trim()) { /* trigger update */ } }}
        />
        <button class="btn-secondary ${showFavoritesOnly ? "active" : ""}" style="padding:8px 12px"
          @click=${() => callbacks.onToggleFavorites()}>
          <ha-icon icon=${showFavoritesOnly ? "mdi:star" : "mdi:star-outline"}></ha-icon>
        </button>
      </div>

      <div class="type-filter-chips">
        ${(["all", "base", "recipe"] as TypeFilter[]).map(
          (t) => html`
            <button class="filter-chip ${typeFilter === t ? "active" : ""}"
              @click=${() => callbacks.onSetTypeFilter(t)}>
              ${t === "all" ? "Alle" : t === "base" ? "Producten" : "Recepten"}
            </button>
          `
        )}
      </div>

      ${/* Recent items in add mode when no search query */""}
      ${showQuickAccess && recentItems.length > 0 ? html`
        <div class="favorites-section">
          <div class="section-label"><ha-icon icon="mdi:history" style="--mdc-icon-size:16px;vertical-align:middle"></ha-icon> Recent</div>
          ${recentItems.map((p) => html`
            <div class="product-item">
              <div class="product-info" @click=${() => callbacks.onSelectRecentProduct(p)}>
                <div class="product-name-row">
                  <span class="product-name">${p.name}</span>
                </div>
                <span class="product-meta">${p.serving_grams}g · ${Math.round((p.nutrients?.["energy-kcal_100g"] || 0) * (p.serving_grams || 100) / 100)} kcal</span>
              </div>
            </div>
          `)}
        </div>
      ` : nothing}

      ${/* Favorites section in add mode when no search query */""}
      ${favoriteProducts.length > 0 ? html`
        <div class="favorites-section">
          <div class="section-label"><ha-icon icon="mdi:star" style="--mdc-icon-size:16px;vertical-align:middle;color:#ff9800"></ha-icon> Favorieten</div>
          ${favoriteProducts.map((p) => renderProductItem(p, isAdd, personCount, mode, callbacks))}
        </div>
      ` : nothing}

      ${/* Local results */""}
      ${filteredProducts.length === 0 && !showQuickAccess
        ? html`<p class="empty-hint">${products.length === 0
            ? isAdd ? "Nog geen producten opgeslagen." : "Nog geen producten. Voeg een product of recept toe."
            : "Geen producten gevonden."}</p>`
        : (!showQuickAccess ? filteredProducts : filteredProducts.filter((p) => !p.favorite)).map(
            (product) => renderProductItem(product, isAdd, personCount, mode, callbacks)
          )}

      ${/* Online search results (add mode) */""}
      ${isAdd && onlineResults.length > 0 ? html`
        <div class="section-label" style="margin-top:12px">
          <ha-icon icon="mdi:cloud-search" style="--mdc-icon-size:16px;vertical-align:middle"></ha-icon> Online resultaten
        </div>
        ${onlineResults.map((p) => html`
          <div class="product-item">
            <div class="product-info" @click=${() => callbacks.onSelectOnlineProduct(p)}>
              <div class="product-name-row">
                <ha-icon icon="mdi:food-variant" style="--mdc-icon-size:18px;margin-right:6px;opacity:0.6"></ha-icon>
                <span class="product-name">${p.name}</span>
              </div>
              <span class="product-meta">${Math.round(p.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g</span>
            </div>
          </div>
        `)}
      ` : nothing}

      ${/* Online/AI search buttons (add mode, when there's a query) */""}
      ${isAdd && q ? html`
        ${onlineSearching
          ? html`<div class="search-loading"><ha-circular-progress indeterminate size="small"></ha-circular-progress> Online zoeken...</div>`
          : html`
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn-secondary search-online-btn" style="flex:1" @click=${() => callbacks.onSearchOnline()}>
                <ha-icon icon="mdi:cloud-search"></ha-icon> Zoek online
              </button>
              ${callbacks.onAiGuess ? html`
                <button class="btn-secondary search-online-btn" style="flex:1" @click=${() => callbacks.onAiGuess!()}>
                  <ha-icon icon="mdi:robot"></ha-icon> AI schatting
                </button>
              ` : nothing}
            </div>
          `}
      ` : nothing}

      ${/* Add mode: extra action buttons */""}
      ${isAdd ? html`
        <div class="ai-validate-actions" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--divider-color)">
          <button class="btn-secondary btn-confirm" @click=${() => callbacks.onOpenBarcode()}>
            <ha-icon icon="mdi:barcode-scan"></ha-icon>
            Barcode
          </button>
          <button class="btn-secondary btn-confirm" @click=${() => callbacks.onOpenManual()}>
            <ha-icon icon="mdi:pencil-plus"></ha-icon>
            Handmatig
          </button>
          ${hasAI ? html`
            <button class="btn-secondary btn-confirm" @click=${() => callbacks.onOpenBatchAdd()}>
              <ha-icon icon="mdi:text-box-outline"></ha-icon>
              AI batch
            </button>
          ` : nothing}
        </div>
      ` : nothing}

      ${/* Manage mode: create/cleanup buttons */""}
      ${!isAdd ? html`
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn-primary btn-confirm" style="flex:1" @click=${() => callbacks.onNewProduct()}>
            <ha-icon icon="mdi:plus"></ha-icon>
            Nieuw product
          </button>
          <button class="btn-primary btn-confirm" style="flex:1" @click=${() => callbacks.onNewRecipe()}>
            <ha-icon icon="mdi:plus"></ha-icon>
            Nieuw recept
          </button>
        </div>
        <button class="btn-secondary" style="width:100%;margin-top:8px" @click=${() => callbacks.onCleanup()}>
          <ha-icon icon="mdi:broom"></ha-icon>
          Ongebruikte producten opruimen
        </button>
      ` : nothing}
    </div>
  `;
}
