/**
 * Products controller — unified product/recipe management and add-to-log flow.
 *
 * Two modes:
 * - "add": product list for logging (click -> weight dialog), online OFF fallback
 * - "manage": product list for editing (click -> editor), create/delete/cleanup
 */
import { html, type TemplateResult } from "lit";
import type {
  MealIngredient,
  Product,
  Portion,
  UnifiedProduct,
  VoedingslogConfig,
  GetProductsResponse,
  SaveProductResponse,
  SearchProductsResponse,
  DialogMode,
} from "../types.js";
import { readNutrientFields } from "../ui/nutrient-fields.js";
import { aiGuessNutrients } from "../helpers/api.js";
import { renderProductsList } from "../views/products-list-view.js";
import { renderBaseProductEditor } from "../views/base-product-editor-view.js";
import { renderRecipeEditor } from "../views/recipe-editor-view.js";

export interface ProductsControllerHost {
  hass: { callWS<T = unknown>(msg: Record<string, unknown>): Promise<T> };
  shadowRoot: ShadowRoot | null;
  _config: VoedingslogConfig | null;
  _selectedPerson: string | null;
  _dialogMode: DialogMode;
  requestUpdate(): void;
  _closeDialog(): void;
  _setDialogMode(mode: string): void;
  _selectProduct(product: Product, returnMode?: DialogMode): void;
  _openSearchDialog(callback: (p: Product) => void, returnMode?: DialogMode): Promise<void>;
  _openBatchAdd(mode: "log" | "recipe"): void;
  _openBarcodeScanner(): void;
}

export type ProductsMode = "add" | "manage";
type TypeFilter = "all" | "base" | "recipe";

export class ProductsController {
  host: ProductsControllerHost;
  products: UnifiedProduct[] = [];
  editingProduct: UnifiedProduct | null = null;
  editingIngredientIndex: number | null = null;
  searchQuery = "";
  showFavoritesOnly = false;
  typeFilter: TypeFilter = "all";
  mode: ProductsMode = "manage";

  // Online search state
  private _onlineResults: Product[] = [];
  private _onlineSearching = false;
  // Recent items for quick-add
  recentItems: Product[] = [];

  constructor(host: ProductsControllerHost) {
    this.host = host;
  }

  reset(): void {
    this.editingProduct = null;
    this.editingIngredientIndex = null;
    this.searchQuery = "";
    this._onlineResults = [];
    this._onlineSearching = false;
  }

  // ── Shared filtering ──────────────────────────────────────────

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

  // ── Render delegation ─────────────────────────────────────────

  fullPage = false;

  renderProductsDialog(): TemplateResult {
    const h = this.host;
    return renderProductsList({
      products: this.products,
      filteredProducts: this._filteredProducts(),
      mode: this.mode,
      searchQuery: this.searchQuery,
      showFavoritesOnly: this.showFavoritesOnly,
      typeFilter: this.typeFilter,
      recentItems: this.recentItems,
      onlineResults: this._onlineResults,
      onlineSearching: this._onlineSearching,
      hasAI: !!h._config?.ai_task_entity,
      fullPage: this.fullPage,
      config: h._config,
      callbacks: {
        onProductClick: (p) => this.mode === "add" ? this.logProduct(p) : this.openEditor(p),
        onFavorite: (p) => this.toggleFavorite(p),
        onEdit: (p) => this.openEditor(p),
        onDelete: (id) => this.deleteProduct(id),
        onSearchInput: (value) => { this.searchQuery = value; this._onlineResults = []; h.requestUpdate(); },
        onToggleFavorites: () => { this.showFavoritesOnly = !this.showFavoritesOnly; h.requestUpdate(); },
        onSetTypeFilter: (t) => { this.typeFilter = t; h.requestUpdate(); },
        onSearchOnline: () => this._searchOnline(),
        onAiGuess: h._config?.ai_task_entity ? () => this._aiGuessFromSearch() : undefined,
        onSelectOnlineProduct: (p) => this._selectOnlineProduct(p),
        onSelectRecentProduct: (p) => h._selectProduct(p, this.mode === "add" ? "products-add" : null),
        onOpenBarcode: () => h._openBarcodeScanner(),
        onOpenManual: () => h._setDialogMode("manual"),
        onOpenBatchAdd: () => h._openBatchAdd("log"),
        onNewProduct: () => this.openEditor(null, "base"),
        onNewRecipe: () => this.openEditor(null, "recipe"),
        onCleanup: () => this.cleanupProducts(),
        onClose: () => h._closeDialog(),
      },
    });
  }

  renderEditDialog(): TemplateResult {
    const product = this.editingProduct;
    if (!product) return html``;
    const h = this.host;

    if (product.type === "recipe") {
      return renderRecipeEditor({
        recipe: product,
        config: h._config,
        editingIngredientIndex: this.editingIngredientIndex,
        callbacks: {
          onClose: () => { this._closeEditor(); },
          onSave: () => this._saveRecipe(),
          onAddIngredient: () => this.openIngredientSearch(),
          onRemoveIngredient: (idx) => this.removeIngredient(idx),
          onToggleIngredientEdit: (idx) => this.toggleIngredientEdit(idx),
          onUpdateIngredientGrams: (idx, g) => this.updateIngredientGrams(idx, g),
          onUpdateIngredientName: (idx, n) => this.updateIngredientName(idx, n),
          onUpdateIngredientNutrient: (idx, k, v) => this.updateIngredientNutrient(idx, k, v),
          onOpenAiIngredients: () => this.openAiIngredients(),
          onAddAlias: () => this._addAliasFromInput(),
          onRemoveAlias: (idx) => this._removeAlias(idx),
        },
      });
    }

    return renderBaseProductEditor({
      product,
      config: h._config,
      callbacks: {
        onClose: () => { this._closeEditor(); },
        onSave: () => this._saveBase(),
        onPhoto: () => this._openPhotoForBase(),
        onRefresh: (id) => this._refreshFromOff(id),
        onMerge: (id) => this._mergeInto(id),
        onAddAlias: () => this._addAliasFromInput(),
        onRemoveAlias: (idx) => this._removeAlias(idx),
        onAddPortion: () => this._addPortion(),
        onRemovePortion: (idx) => this._removePortion(idx),
        onUpdatePortion: (idx, label, grams) => this._updatePortion(idx, label, grams),
      },
    });
  }

  // ── Portion management ──────────────────────────────────────

  private _addPortion(): void {
    if (!this.editingProduct || this.editingProduct.type !== "base") return;
    const portions = [...(this.editingProduct.portions || []), { label: "", grams: 100 }];
    this.editingProduct = { ...this.editingProduct, portions };
    this.host.requestUpdate();
  }

  private _removePortion(index: number): void {
    if (!this.editingProduct || this.editingProduct.type !== "base") return;
    const portions = [...(this.editingProduct.portions || [])];
    portions.splice(index, 1);
    this.editingProduct = { ...this.editingProduct, portions };
    this.host.requestUpdate();
  }

  private _updatePortion(index: number, label: string, grams: number): void {
    if (!this.editingProduct || this.editingProduct.type !== "base") return;
    const portions = [...(this.editingProduct.portions || [])];
    portions[index] = { label, grams };
    this.editingProduct = { ...this.editingProduct, portions };
    this.host.requestUpdate();
  }

  // ── Actions ──────────────────────────────────────────────────

  async open(mode: ProductsMode): Promise<void> {
    this.mode = mode;
    this.searchQuery = "";
    this.showFavoritesOnly = false;
    this._onlineResults = [];
    this.recentItems = [];
    try {
      const res = await this.host.hass.callWS<GetProductsResponse>({ type: "voedingslog/get_products" });
      this.products = res.products || [];
    } catch (e) {
      console.error("Failed to load products:", e);
    }
    if (mode === "add") {
      try {
        const res = await this.host.hass.callWS<{ items: Product[] }>({
          type: "voedingslog/get_recent",
          person: this.host._selectedPerson,
        });
        this.recentItems = res.items || [];
      } catch { /* ignore */ }
    }
    // Only open dialog for add mode — manage mode renders inline (tab view)
    if (mode === "add") {
      this.host._setDialogMode("products-add");
    }
  }

  /** @deprecated Use open() instead */
  async loadProducts(): Promise<void> {
    await this.open("manage");
  }

  private async _searchOnline(): Promise<void> {
    const q = this.searchQuery.trim();
    if (!q) return;
    this._onlineSearching = true;
    this.host.requestUpdate();
    try {
      const res = await this.host.hass.callWS<SearchProductsResponse>({
        type: "voedingslog/search_products",
        query: q,
        online: true,
      });
      this._onlineResults = res.products || [];
    } catch (e) {
      console.error("Online search failed:", e);
    }
    this._onlineSearching = false;
    this.host.requestUpdate();
  }

  private _selectOnlineProduct(product: Product): void {
    this.host._selectProduct(product, this.mode === "add" ? "products-add" : null);
  }

  private async _aiGuessFromSearch(): Promise<void> {
    const foodName = this.searchQuery.trim() || prompt("Voer een productnaam in (bijv. paprika):");
    if (!foodName) return;
    const product = await aiGuessNutrients(this.host.hass, foodName);
    if (product) this.host._selectProduct(product, this.mode === "add" ? "products-add" : null);
  }

  private _closeEditor(): void {
    this.editingProduct = null;
    if (this.fullPage) {
      // Close the editor dialog, stay on the full-page products tab
      this.host._closeDialog();
    } else {
      // Go back to the add dialog
      this.host._setDialogMode("products-add");
    }
    this.host.requestUpdate();
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
      this.host._selectProduct(p, this.mode === "add" ? "products-add" : null);
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

    this.host._selectProduct(p, this.mode === "add" ? "products-add" : null);
  }

  // ── Ingredient management ─────────────────────────────────────

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
    const ingredient: MealIngredient = {
      name: product.name,
      grams,
      nutrients: product.nutrients,
      ...(product.id ? { product_id: product.id } : {}),
    };
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

  // ── Favorites ─────────────────────────────────────────────────

  toggleFavorite(product: UnifiedProduct): void {
    // Immutable update — replace the product in the array
    const newFav = !product.favorite;
    const idx = this.products.findIndex((p) => p.id === product.id);
    if (idx >= 0) {
      this.products = [
        ...this.products.slice(0, idx),
        { ...this.products[idx], favorite: newFav },
        ...this.products.slice(idx + 1),
      ];
    }
    this.host.hass.callWS({
      type: "voedingslog/toggle_favorite",
      product_id: product.id,
    }).catch((e) => console.error("Failed to toggle favorite:", e));
    this.host.requestUpdate();
  }

  // ── Alias management ──────────────────────────────────────────

  private _addAliasFromInput(): void {
    const input = this.host.shadowRoot?.getElementById("new-alias-input") as HTMLInputElement | null;
    const alias = input?.value?.trim();
    if (!alias || !this.editingProduct) return;
    const current = this.editingProduct.aliases || [];
    if (current.some((a) => a.toLowerCase() === alias.toLowerCase())) return;
    this.editingProduct = { ...this.editingProduct, aliases: [...current, alias] };
    if (input) input.value = "";
    this.host.requestUpdate();
  }

  private _removeAlias(index: number): void {
    if (!this.editingProduct) return;
    const current = [...(this.editingProduct.aliases || [])];
    current.splice(index, 1);
    this.editingProduct = { ...this.editingProduct, aliases: current };
    this.host.requestUpdate();
  }

  // ── CRUD actions ──────────────────────────────────────────────

  private _openPhotoForBase(): void {
    this.host._setDialogMode("photo");
  }

  private _mergeInto(keepId: string): void {
    this.host._openSearchDialog(async (product) => {
      if (!product.id || product.id === keepId) {
        alert("Kies een ander product om samen te voegen.");
        return;
      }
      if (!confirm(`'${product.name}' samenvoegen in dit product? Het duplicaat wordt verwijderd.`)) return;
      try {
        await this.host.hass.callWS({ type: "voedingslog/merge_products", keep_id: keepId, remove_id: product.id });
        await this.open(this.mode);
      } catch {
        alert("Fout bij samenvoegen.");
      }
    }, "product-edit");
  }

  private async _refreshFromOff(productId: string): Promise<void> {
    try {
      await this.host.hass.callWS({ type: "voedingslog/refresh_product", product_id: productId });
      await this.open(this.mode);
    } catch {
      alert("Kon product niet verversen vanuit Open Food Facts.");
    }
  }

  private async _saveBase(): Promise<void> {
    const h = this.host;
    if (!this.editingProduct || this.editingProduct.type !== "base") return;

    const nameInput = h.shadowRoot?.getElementById("product-name-input") as HTMLInputElement | null;
    const name = nameInput?.value?.trim();
    if (!name) { alert("Vul een naam in."); return; }

    const nutrients = readNutrientFields("product", h.shadowRoot);
    const portions = (this.editingProduct.portions || []).filter((p) => p.label.trim() && p.grams > 0);
    const servingGrams = portions.length > 0 ? portions[0].grams : 100;

    try {
      await h.hass.callWS<SaveProductResponse>({
        type: "voedingslog/save_product",
        product: {
          id: this.editingProduct.id || undefined,
          type: "base",
          name,
          serving_grams: servingGrams,
          portions,
          nutrients,
          aliases: this.editingProduct.aliases || [],
        },
      });
      await this.open(this.mode);
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
    if (this.editingProduct.ingredients.length === 0) { alert("Voeg minimaal \u00e9\u00e9n ingredi\u00ebnt toe."); return; }

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
          aliases: this.editingProduct.aliases || [],
        },
      });
      await this.open(this.mode);
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

  async cleanupProducts(): Promise<void> {
    if (!confirm("Producten die niet in logs voorkomen verwijderen? Recepten en favorieten blijven bewaard.")) return;
    try {
      const res = await this.host.hass.callWS<{ removed: number }>({ type: "voedingslog/cleanup_products" });
      if (res.removed > 0) {
        await this.open(this.mode);
      } else {
        alert("Geen ongebruikte producten gevonden.");
      }
    } catch (e) {
      console.error("Failed to cleanup products:", e);
      alert("Fout bij opruimen.");
    }
  }
}
