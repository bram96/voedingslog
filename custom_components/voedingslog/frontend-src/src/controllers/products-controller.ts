/**
 * Products controller — unified product/recipe management.
 */
import { html, nothing, type TemplateResult } from "lit";
import type {
  MealIngredient,
  Product,
  Portion,
  UnifiedProduct,
  BaseProduct,
  Recipe,
  VoedingslogConfig,
  GetProductsResponse,
  SaveProductResponse,
  DialogMode,
} from "../types.js";

export interface ProductsControllerHost {
  hass: { callWS<T = unknown>(msg: Record<string, unknown>): Promise<T> };
  shadowRoot: ShadowRoot | null;
  _config: VoedingslogConfig | null;
  _dialogMode: DialogMode;
  requestUpdate(): void;
  _closeDialog(): void;
  _setDialogMode(mode: string): void;
  _selectProduct(product: Product): void;
  _openSearchDialog(callback: (p: Product) => void, returnMode?: DialogMode): Promise<void>;
  _openBatchAdd(mode: "log" | "recipe"): void;
}

type TypeFilter = "all" | "base" | "recipe";

export class ProductsController {
  host: ProductsControllerHost;
  products: UnifiedProduct[] = [];
  editingProduct: UnifiedProduct | null = null;
  editingIngredientIndex: number | null = null;
  searchQuery = "";
  showFavoritesOnly = false;
  typeFilter: TypeFilter = "all";

  constructor(host: ProductsControllerHost) {
    this.host = host;
  }

  reset(): void {
    this.editingProduct = null;
    this.editingIngredientIndex = null;
    this.searchQuery = "";
  }

  private _filteredProducts(): UnifiedProduct[] {
    let result = this.products;
    if (this.showFavoritesOnly) {
      result = result.filter((p) => p.favorite);
    }
    if (this.typeFilter !== "all") {
      result = result.filter((p) => p.type === this.typeFilter);
    }
    const q = this.searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    return result;
  }

  private _typeIcon(product: UnifiedProduct): string {
    if (product.type === "base") return "mdi:food-variant";
    if (product.type === "recipe" && product.recipe_type === "component") return "mdi:view-list";
    return "mdi:pot-steam";
  }

  private _typeMeta(product: UnifiedProduct): string {
    if (product.type === "base") {
      return `${Math.round(product.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g`;
    }
    const recipe = product as Recipe;
    const kcal = Math.round((recipe.nutrients?.["energy-kcal_100g"] || 0) * recipe.total_grams / 100);
    return `${recipe.ingredients.length} ingrediënten · ${Math.round(recipe.total_grams)}g · ${kcal} kcal`;
  }

  renderProductsDialog(): TemplateResult {
    const h = this.host;
    const filtered = this._filteredProducts();
    return html`
      <div class="dialog-header">
        <h2>Producten</h2>
        <button class="close-btn" @click=${() => h._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="input-row" style="margin-bottom:8px">
          <input type="text" placeholder="Zoek product of recept..."
            .value=${this.searchQuery}
            @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value; h.requestUpdate(); }} />
          <button class="btn-secondary ${this.showFavoritesOnly ? "active" : ""}" style="padding:8px 12px"
            @click=${() => { this.showFavoritesOnly = !this.showFavoritesOnly; h.requestUpdate(); }}>
            <ha-icon icon=${this.showFavoritesOnly ? "mdi:star" : "mdi:star-outline"}></ha-icon>
          </button>
        </div>

        <div class="type-filter-chips">
          ${(["all", "base", "recipe"] as TypeFilter[]).map(
            (t) => html`
              <button class="filter-chip ${this.typeFilter === t ? "active" : ""}"
                @click=${() => { this.typeFilter = t; h.requestUpdate(); }}>
                ${t === "all" ? "Alle" : t === "base" ? "Producten" : "Recepten"}
              </button>
            `
          )}
        </div>

        ${filtered.length === 0
          ? html`<p class="empty-hint">${this.products.length === 0
              ? "Nog geen producten. Voeg een product of recept toe."
              : "Geen producten gevonden."}</p>`
          : filtered.map(
              (product) => html`
                <div class="product-item">
                  <div class="product-info" @click=${() => this.logProduct(product)}>
                    <div class="product-name-row">
                      <ha-icon icon=${this._typeIcon(product)} style="--mdc-icon-size:18px;margin-right:6px;opacity:0.6"></ha-icon>
                      <span class="product-name">${product.name}</span>
                    </div>
                    <span class="product-meta">${this._typeMeta(product)}</span>
                  </div>
                  <button class="fav-btn" @click=${(e: Event) => { e.stopPropagation(); this.toggleFavorite(product); }}>
                    <ha-icon icon=${product.favorite ? "mdi:star" : "mdi:star-outline"}></ha-icon>
                  </button>
                  <button class="item-edit" @click=${() => this.openEditor(product)}>
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                  <button class="item-delete" @click=${() => this.deleteProduct(product.id)}>
                    <ha-icon icon="mdi:close"></ha-icon>
                  </button>
                </div>
              `
            )}

        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn-primary btn-confirm" style="flex:1" @click=${() => this.openEditor(null, "base")}>
            <ha-icon icon="mdi:plus"></ha-icon>
            Nieuw product
          </button>
          <button class="btn-primary btn-confirm" style="flex:1" @click=${() => this.openEditor(null, "recipe")}>
            <ha-icon icon="mdi:plus"></ha-icon>
            Nieuw recept
          </button>
        </div>
      </div>
    `;
  }

  renderEditDialog(): TemplateResult {
    const product = this.editingProduct;
    if (!product) return html``;
    if (product.type === "recipe") {
      return this._renderRecipeEditDialog(product);
    }
    return this._renderBaseEditDialog(product);
  }

  private _renderBaseEditDialog(product: BaseProduct): TemplateResult {
    const h = this.host;
    const fields = [
      { id: "product-kcal", label: "Calorieën (kcal)", key: "energy-kcal_100g" },
      { id: "product-fat", label: "Vetten (g)", key: "fat_100g" },
      { id: "product-satfat", label: "Verzadigd vet (g)", key: "saturated-fat_100g" },
      { id: "product-carbs", label: "Koolhydraten (g)", key: "carbohydrates_100g" },
      { id: "product-sugars", label: "Waarvan suikers (g)", key: "sugars_100g" },
      { id: "product-fiber", label: "Vezels (g)", key: "fiber_100g" },
      { id: "product-protein", label: "Eiwitten (g)", key: "proteins_100g" },
      { id: "product-sodium", label: "Natrium/zout (g)", key: "sodium_100g" },
    ];

    return html`
      <div class="dialog-header">
        <h2>${product.id ? "Product bewerken" : "Nieuw product"}</h2>
        <button class="close-btn" @click=${() => { h._setDialogMode("products"); this.editingProduct = null; h.requestUpdate(); }}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="form-field">
          <label>Naam</label>
          <input type="text" id="product-name-input" .value=${product.name || ""} placeholder="Bijv. Volkoren brood" />
        </div>

        <div class="form-field">
          <label>Standaard portie (gram)</label>
          <input type="number" id="product-serving-input" .value=${String(product.serving_grams || 100)}
            placeholder="Bijv. 35" min="1" step="1" inputmode="numeric" />
        </div>

        <p class="manual-hint">Voedingswaarden per 100g:</p>
        <div class="manual-fields">
          ${fields.map(
            (f) => html`
              <div class="manual-field-row">
                <label>${f.label}</label>
                <input type="number" id=${f.id} min="0" step="0.1" inputmode="decimal"
                  .value=${String(product.nutrients?.[f.key] ?? 0)} />
              </div>
            `
          )}
        </div>

        ${!product.id && !!h._config?.ai_task_entity ? html`
          <button class="btn-secondary btn-confirm" @click=${() => this._openPhotoForBase()}>
            <ha-icon icon="mdi:camera"></ha-icon>
            Foto van etiket (AI)
          </button>
        ` : nothing}

        <button class="btn-primary btn-confirm" @click=${() => this._saveBase(fields)}>
          <ha-icon icon="mdi:check"></ha-icon>
          Opslaan
        </button>
      </div>
    `;
  }

  private _renderRecipeEditDialog(recipe: Recipe): TemplateResult {
    const h = this.host;
    const ingredients = recipe.ingredients || [];
    return html`
      <div class="dialog-header">
        <h2>${recipe.id ? "Recept bewerken" : "Nieuw recept"}</h2>
        <button class="close-btn" @click=${() => { h._setDialogMode("products"); this.editingProduct = null; h.requestUpdate(); }}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
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

        <div class="meal-ingredients-section">
          <label class="section-label">Ingrediënten</label>
          ${ingredients.map(
            (ing, idx) => html`
              <div class="ingredient-row">
                <span class="ingredient-name" @click=${() => this.toggleIngredientEdit(idx)}
                  style="cursor:pointer;flex:1">${ing.name}</span>
                <input type="number" class="ingredient-grams-input" .value=${String(ing.grams)}
                  min="1" step="1" inputmode="numeric"
                  @change=${(e: Event) => this.updateIngredientGrams(idx, parseFloat((e.target as HTMLInputElement).value))} />
                <span class="ingredient-unit">g</span>
                <button class="item-edit" @click=${() => this.toggleIngredientEdit(idx)}>
                  <ha-icon icon="mdi:pencil"></ha-icon>
                </button>
                <button class="item-delete" @click=${() => this.removeIngredient(idx)}>
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
              </div>
              ${this.editingIngredientIndex === idx ? html`
                <div class="ingredient-nutrients">
                  <div class="form-field form-field-inline">
                    <label>Naam</label>
                    <input type="text" .value=${ing.name}
                      @change=${(e: Event) => this.updateIngredientName(idx, (e.target as HTMLInputElement).value)} />
                  </div>
                  ${Object.entries(h._config?.nutrients || {}).map(
                    ([key, meta]) => html`
                      <div class="form-field form-field-inline">
                        <label>${meta.label} (${meta.unit}/100g)</label>
                        <input type="number" .value=${String((ing.nutrients?.[key] || 0).toFixed(2))}
                          min="0" step="0.01" inputmode="decimal"
                          @change=${(e: Event) => this.updateIngredientNutrient(idx, key, parseFloat((e.target as HTMLInputElement).value))} />
                      </div>
                    `
                  )}
                </div>
              ` : nothing}
            `
          )}

          <button class="btn-secondary" style="width:100%;margin-top:8px" @click=${() => this.openIngredientSearch()}>
            <ha-icon icon="mdi:plus"></ha-icon> Ingrediënt zoeken
          </button>
        </div>

        ${!!h._config?.ai_task_entity ? html`
          <button class="btn-secondary btn-confirm" @click=${() => this.openAiIngredients()}>
            <ha-icon icon="mdi:text-box-outline"></ha-icon>
            AI ingrediënten invoer
          </button>
        ` : nothing}

        <button class="btn-primary btn-confirm" @click=${() => this._saveRecipe()}>
          <ha-icon icon="mdi:check"></ha-icon>
          Opslaan
        </button>
      </div>
    `;
  }

  // ── Actions ──────────────────────────────────────────────────

  async loadProducts(): Promise<void> {
    try {
      const res = await this.host.hass.callWS<GetProductsResponse>({ type: "voedingslog/get_products" });
      this.products = res.products || [];
    } catch (e) {
      console.error("Failed to load products:", e);
    }
    this.host._setDialogMode("products");
  }

  openEditor(product: UnifiedProduct | null, newType?: "base" | "recipe"): void {
    if (product) {
      if (product.type === "recipe") {
        this.editingProduct = { ...product, ingredients: [...product.ingredients] };
      } else {
        this.editingProduct = { ...product };
      }
    } else if (newType === "recipe") {
      this.editingProduct = {
        id: "", type: "recipe", recipe_type: "fixed",
        name: "", ingredients: [], total_grams: 0, nutrients: {},
      };
    } else {
      this.editingProduct = {
        id: "", type: "base",
        name: "", serving_grams: 100, nutrients: {},
      };
    }
    this.host._setDialogMode("product-edit");
  }

  logProduct(product: UnifiedProduct): void {
    if (product.type === "base") {
      const p: Product = {
        id: product.id,
        name: product.name,
        serving_grams: product.serving_grams,
        portions: product.portions,
        nutrients: product.nutrients,
      };
      this.host._selectProduct(p);
      return;
    }

    // Recipe
    const recipe = product;
    const defaultGrams = recipe.preferred_portion || recipe.total_grams;
    const portions: Portion[] = [];
    if (recipe.preferred_portion) {
      portions.push({ label: `Portie (${Math.round(recipe.preferred_portion)}g)`, grams: recipe.preferred_portion });
    }
    portions.push({ label: `Heel recept (${Math.round(recipe.total_grams)}g)`, grams: recipe.total_grams });
    if (defaultGrams !== 100 && recipe.total_grams !== 100) {
      portions.push({ label: "100g", grams: 100 });
    }

    const p: Product = {
      id: recipe.id,
      name: recipe.name,
      serving_grams: defaultGrams,
      portions,
      nutrients: recipe.nutrients,
    };

    // For component recipes, pass the ingredients as components
    if (recipe.recipe_type === "component") {
      p.components = recipe.ingredients.map((i) => ({ ...i }));
    }

    this.host._selectProduct(p);
  }

  openAiIngredients(): void {
    this.host._openBatchAdd("recipe");
  }

  openIngredientSearch(): void {
    this.host._openSearchDialog(
      (p) => this.addIngredient(p),
      "product-edit",
    );
  }

  addIngredient(product: Product): void {
    if (!this.editingProduct || this.editingProduct.type !== "recipe") return;
    const grams = product.serving_grams || 100;
    const ingredient: MealIngredient = { name: product.name, grams, nutrients: product.nutrients };
    this.editingProduct = {
      ...this.editingProduct,
      ingredients: [...this.editingProduct.ingredients, ingredient],
    };
    this.host.requestUpdate();
  }

  addIngredientFromAi(ingredient: MealIngredient): void {
    if (!this.editingProduct || this.editingProduct.type !== "recipe") return;
    this.editingProduct = {
      ...this.editingProduct,
      ingredients: [...this.editingProduct.ingredients, ingredient],
    };
    this.host.requestUpdate();
  }

  toggleIngredientEdit(index: number): void {
    this.editingIngredientIndex = this.editingIngredientIndex === index ? null : index;
    this.host.requestUpdate();
  }

  updateIngredientName(index: number, name: string): void {
    if (!this.editingProduct || this.editingProduct.type !== "recipe" || !name.trim()) return;
    const ingredients = [...this.editingProduct.ingredients];
    ingredients[index] = { ...ingredients[index], name: name.trim() };
    this.editingProduct = { ...this.editingProduct, ingredients };
    this.host.requestUpdate();
  }

  updateIngredientNutrient(index: number, key: string, value: number): void {
    if (!this.editingProduct || this.editingProduct.type !== "recipe") return;
    const ingredients = [...this.editingProduct.ingredients];
    const nutrients = { ...ingredients[index].nutrients, [key]: value || 0 };
    ingredients[index] = { ...ingredients[index], nutrients };
    this.editingProduct = { ...this.editingProduct, ingredients };
    this.host.requestUpdate();
  }

  updateIngredientGrams(index: number, grams: number): void {
    if (!this.editingProduct || this.editingProduct.type !== "recipe" || !grams || grams <= 0) return;
    const ingredients = [...this.editingProduct.ingredients];
    ingredients[index] = { ...ingredients[index], grams };
    this.editingProduct = { ...this.editingProduct, ingredients };
    this.host.requestUpdate();
  }

  removeIngredient(index: number): void {
    if (!this.editingProduct || this.editingProduct.type !== "recipe") return;
    const ingredients = [...this.editingProduct.ingredients];
    ingredients.splice(index, 1);
    this.editingProduct = { ...this.editingProduct, ingredients };
    this.host.requestUpdate();
  }

  toggleFavorite(product: UnifiedProduct): void {
    product.favorite = !product.favorite;
    this.host.hass.callWS({
      type: "voedingslog/toggle_favorite",
      product_id: product.id,
    }).catch((e) => console.error("Failed to toggle favorite:", e));
    this.host.requestUpdate();
  }

  private _openPhotoForBase(): void {
    // Navigate to photo capture via the search controller's manual flow
    this.host._setDialogMode("photo");
  }

  private async _saveBase(fields: { id: string; key: string }[]): Promise<void> {
    const h = this.host;
    if (!this.editingProduct || this.editingProduct.type !== "base") return;

    const nameInput = h.shadowRoot?.getElementById("product-name-input") as HTMLInputElement | null;
    const name = nameInput?.value?.trim();
    if (!name) { alert("Vul een naam in."); return; }

    const servingInput = h.shadowRoot?.getElementById("product-serving-input") as HTMLInputElement | null;
    const servingGrams = parseFloat(servingInput?.value || "100") || 100;

    const nutrients: Record<string, number> = {};
    for (const f of fields) {
      const input = h.shadowRoot?.getElementById(f.id) as HTMLInputElement | null;
      nutrients[f.key] = parseFloat(input?.value || "0") || 0;
    }

    try {
      await h.hass.callWS<SaveProductResponse>({
        type: "voedingslog/save_product",
        product: {
          id: this.editingProduct.id || undefined,
          type: "base",
          name,
          serving_grams: servingGrams,
          nutrients,
        },
      });
      await this.loadProducts();
    } catch (e) {
      console.error("Failed to save product:", e);
      alert("Fout bij opslaan.");
    }
  }

  private async _saveRecipe(): Promise<void> {
    const h = this.host;
    if (!this.editingProduct || this.editingProduct.type !== "recipe") return;

    const nameInput = h.shadowRoot?.getElementById("recipe-name-input") as HTMLInputElement | null;
    const name = nameInput?.value?.trim();
    if (!name) { alert("Vul een naam in."); return; }
    if (this.editingProduct.ingredients.length === 0) { alert("Voeg minimaal één ingrediënt toe."); return; }

    const typeSelect = h.shadowRoot?.getElementById("recipe-type-select") as HTMLSelectElement | null;
    const recipeType = (typeSelect?.value as "fixed" | "component") || "fixed";

    const portionInput = h.shadowRoot?.getElementById("recipe-portion-input") as HTMLInputElement | null;
    const preferredPortion = parseFloat(portionInput?.value || "") || undefined;

    try {
      await h.hass.callWS<SaveProductResponse>({
        type: "voedingslog/save_product",
        product: {
          id: this.editingProduct.id || undefined,
          type: "recipe",
          recipe_type: recipeType,
          name,
          ingredients: this.editingProduct.ingredients,
          preferred_portion: preferredPortion,
        },
      });
      await this.loadProducts();
    } catch (e) {
      console.error("Failed to save recipe:", e);
      alert("Fout bij opslaan.");
    }
  }

  async deleteProduct(productId: string): Promise<void> {
    if (!confirm("Product verwijderen?")) return;
    try {
      await this.host.hass.callWS({ type: "voedingslog/delete_product", product_id: productId });
      this.products = this.products.filter((p) => p.id !== productId);
      this.host.requestUpdate();
    } catch (e) {
      console.error("Failed to delete product:", e);
    }
  }
}
