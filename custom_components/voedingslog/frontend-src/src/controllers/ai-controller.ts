/**
 * AI features controller — text parsing, handwriting OCR, validation dialog.
 * Used via composition: the panel creates an instance and delegates to it.
 */
import type { TemplateResult } from "lit";
import type {
  MealCategory,
  MealIngredient,
  Product,
  ParsedProduct,
  ParseFoodResponse,
  SearchProductsResponse,
  AiGuessNutrientsResponse,
  VoedingslogConfig,
} from "../types.js";
import { defaultCategory } from "../helpers/categories.js";
import { readFileAsBase64, type PhotoCaptureHost } from "../photo-capture.js";
import { renderBatchAddView } from "../views/batch-add-view.js";
import { renderValidateView } from "../views/validate-view.js";

export interface AiControllerHost extends PhotoCaptureHost {
  hass: { callWS<T = unknown>(msg: Record<string, unknown>): Promise<T> };
  shadowRoot: ShadowRoot | null;
  _config: VoedingslogConfig | null;
  _selectedPerson: string | null;
  _selectedDate: string;
  requestUpdate(): void;
  _closeDialog(): void;
  _loadLog(): Promise<void>;
  _setDialogMode(mode: string): void;
  _addRecipeIngredientFromAi(ingredient: MealIngredient): void;
  _stopPhotoCamera(): void;
  _capturePhotoFrame(): string | null;
}

/** Whether the AI validation flow is adding to a log or building a recipe. */
type ValidateMode = "log" | "recipe";

export class AiController {
  host: AiControllerHost;
  parsedProducts: ParsedProduct[] = [];
  validateIndex = 0;
  validateSearch = "";
  validateSearchResults: Product[] = [];
  batchMode: "text" | "photo" = "text";
  currentMode: ValidateMode = "log";
  private _validateMode: ValidateMode = "log";

  constructor(host: AiControllerHost) {
    this.host = host;
  }

  reset(): void {
    this.parsedProducts = [];
    this.validateIndex = 0;
    this.validateSearch = "";
    this.validateSearchResults = [];
    this.batchMode = "text";
    this.currentMode = "log" as ValidateMode;
    this._validateMode = "log" as ValidateMode;
  }

  renderBatchAddDialog(mode: ValidateMode = "log"): TemplateResult {
    const h = this.host;
    const isRecipe = mode === "recipe";
    return renderBatchAddView({
      mode: isRecipe ? "recipe" : "log",
      batchMode: this.batchMode,
      analyzing: h._analyzing,
      host: h,
      onClose: isRecipe ? () => h._setDialogMode("product-edit") : () => h._closeDialog(),
      onSubmitText: () => this.submitText(mode),
      onSwitchToPhoto: () => { this.batchMode = "photo"; h.requestUpdate(); },
      onSwitchToText: () => { this.batchMode = "text"; h.requestUpdate(); },
      onHandwritingPhoto: (e) => this.handleHandwritingPhoto(e),
      onCaptureHandwriting: () => this._captureForHandwriting(),
    });
  }

  renderValidateDialog(): TemplateResult {
    const h = this.host;
    return renderValidateView({
      products: this.parsedProducts,
      index: this.validateIndex,
      validateMode: this._validateMode,
      validateSearch: this.validateSearch,
      validateSearchResults: this.validateSearchResults,
      config: h._config,
      onClose: () => h._closeDialog(),
      onDone: () => { h._closeDialog(); h._loadLog(); },
      onSkip: () => this.skip(),
      onConfirm: () => this.confirm(),
      onSearchInput: (v) => { this.validateSearch = v; h.requestUpdate(); },
      onSearchLocal: () => this.searchValidate(),
      onSearchOnline: () => this.searchValidate(true),
      onAiGuess: h._config?.ai_task_entity ? () => this.aiGuessForValidate() : undefined,
      onSelectProduct: (p) => this.selectProduct(p),
      onAcceptSuggestion: () => this._acceptSuggestion(),
    });
  }

  // ── Actions ──────────────────────────────────────────────────

  async submitText(mode: ValidateMode = "log"): Promise<void> {
    const h = this.host;
    const textarea = h.shadowRoot?.getElementById("ai-text-input") as HTMLTextAreaElement | null;
    const text = textarea?.value?.trim();
    if (!text) { alert("Voer tekst in."); return; }

    h._analyzing = true;
    h.requestUpdate();
    try {
      const res = await h.hass.callWS<ParseFoodResponse>({ type: "voedingslog/parse_text", text });
      h._analyzing = false;
      if (res.products?.length) {
        this.parsedProducts = res.products;
        this.validateIndex = 0;
        this.validateSearch = "";
        this.validateSearchResults = [];
        this._validateMode = mode;
        h._setDialogMode("ai-validate");
      } else {
        alert("Geen producten herkend. Probeer het opnieuw met meer detail.");
        h.requestUpdate();
      }
    } catch (err) {
      h._analyzing = false;
      h.requestUpdate();
      console.error("AI text parsing failed:", err);
      alert("Fout bij analyseren: " + ((err as Error).message || err));
    }
  }

  async _captureForHandwriting(): Promise<void> {
    const b64 = this.host._capturePhotoFrame();
    if (!b64) return;
    this.host._stopPhotoCamera();
    await this._processHandwritingB64(b64);
  }

  async handleHandwritingPhoto(e: Event): Promise<void> {
    const b64 = await readFileAsBase64(e);
    if (!b64) return;
    await this._processHandwritingB64(b64);
  }

  private async _processHandwritingB64(b64: string): Promise<void> {
    const h = this.host;
    h._analyzing = true;
    h.requestUpdate();
    try {
      const res = await h.hass.callWS<ParseFoodResponse>({ type: "voedingslog/parse_handwriting", photo_b64: b64 });
      h._analyzing = false;
      if (res.products?.length) {
        this.parsedProducts = res.products;
        this.validateIndex = 0;
        this.validateSearch = "";
        this.validateSearchResults = [];
        this._validateMode = "log";
        h._setDialogMode("ai-validate");
      } else {
        alert("Geen producten herkend. Probeer een duidelijkere foto.");
        h.requestUpdate();
      }
    } catch (err) {
      h._analyzing = false;
      h.requestUpdate();
      console.error("AI handwriting parsing failed:", err);
      alert("Fout bij analyseren: " + ((err as Error).message || err));
    }
  }

  async aiGuessForValidate(): Promise<void> {
    const h = this.host;
    const product = this.parsedProducts[this.validateIndex];
    const foodName = this.validateSearch.trim() || product?.ai_name || product?.name;
    if (!foodName) return;

    try {
      const res = await h.hass.callWS<AiGuessNutrientsResponse>({
        type: "voedingslog/ai_guess_nutrients",
        food_name: foodName,
      });
      if (res.product) {
        this.selectProduct(res.product as Product);
      }
    } catch (err) {
      console.error("AI guess in validate failed:", err);
      alert("Fout bij AI schatting: " + ((err as Error).message || err));
    }
  }

  async searchValidate(online = false): Promise<void> {
    const query = this.validateSearch.trim();
    if (!query) return;
    try {
      const res = await this.host.hass.callWS<SearchProductsResponse>({
        type: "voedingslog/search_products",
        query,
        online,
      });
      this.validateSearchResults = res.products || [];
      this.host.requestUpdate();
    } catch (err) {
      console.error("AI validate search failed:", err);
    }
  }

  private async _acceptSuggestion(): Promise<void> {
    const product = this.parsedProducts[this.validateIndex];
    const suggestedId = (product as any).suggested_product_id;
    const suggestedName = (product as any).suggested_product;
    if (!suggestedId || !suggestedName) return;

    // Search for the suggested product to get full data
    try {
      const res = await this.host.hass.callWS<SearchProductsResponse>({
        type: "voedingslog/search_products",
        query: suggestedName,
      });
      const match = res.products?.find((p) => p.id === suggestedId);
      if (match) {
        this.selectProduct(match);
        // Add AI name as alias
        if (product.ai_name) {
          this.host.hass.callWS({ type: "voedingslog/add_alias", product_id: suggestedId, alias: product.ai_name }).catch(() => {});
        }
      }
    } catch { /* ignore */ }
  }

  selectProduct(product: Product): void {
    const idx = this.validateIndex;
    const current = this.parsedProducts[idx];
    this.parsedProducts = [
      ...this.parsedProducts.slice(0, idx),
      { ...product, serving_grams: current.serving_grams, ai_name: current.ai_name, matched: true },
      ...this.parsedProducts.slice(idx + 1),
    ];
    this.validateSearchResults = [];
    this.validateSearch = "";
    this.host.requestUpdate();
  }

  skip(): void {
    this.validateIndex++;
    this.validateSearch = "";
    this.validateSearchResults = [];
    if (this.validateIndex >= this.parsedProducts.length) {
      if (this._validateMode === "recipe") {
        this.host._setDialogMode("meal-edit");
      } else {
        this.host._closeDialog();
        this.host._loadLog();
      }
    } else {
      this.host.requestUpdate();
    }
  }

  async confirm(): Promise<void> {
    const h = this.host;
    const product = this.parsedProducts[this.validateIndex];
    if (!product) return;

    const gramsInput = h.shadowRoot?.getElementById("ai-validate-grams") as HTMLInputElement | null;
    const grams = parseFloat(gramsInput?.value || "") || product.serving_grams || 100;

    // Store AI name as alias on the matched product for future lookups
    if (product.matched && product.id && product.ai_name && product.ai_name.toLowerCase() !== product.name.toLowerCase()) {
      h.hass.callWS({ type: "voedingslog/add_alias", product_id: product.id, alias: product.ai_name }).catch(() => {});
    }

    if (this._validateMode === "recipe") {
      // Add as recipe ingredient
      h._addRecipeIngredientFromAi({
        name: product.name,
        grams,
        nutrients: product.nutrients || {},
      });
    } else {
      // Log to daily intake
      const catSelect = h.shadowRoot?.getElementById("ai-validate-category") as HTMLSelectElement | null;
      const category = (catSelect?.value as MealCategory) || defaultCategory();
      try {
        await h.hass.callWS({
          type: "voedingslog/log_product",
          person: h._selectedPerson,
          name: product.name,
          grams,
          nutrients: product.nutrients || {},
          category,
          date: h._selectedDate,
        });
      } catch (err) {
        console.error("Failed to log AI product:", err);
        alert("Fout bij opslaan.");
        return;
      }
    }

    this.validateIndex++;
    this.validateSearch = "";
    this.validateSearchResults = [];
    if (this.validateIndex >= this.parsedProducts.length) {
      if (this._validateMode === "recipe") {
        h._setDialogMode("product-edit");
      } else {
        h._closeDialog();
        h._loadLog();
      }
    } else {
      h.requestUpdate();
    }
  }
}
