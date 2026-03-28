/**
 * Search controller — product search, barcode, photo label dialogs.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { Product, VoedingslogConfig, DialogMode, GetFavoritesResponse, LookupBarcodeResponse, AnalyzePhotoResponse } from "../types.js";
import { ProductSearch } from "../product-search.js";
import { readFileAsBase64 } from "../photo-capture.js";
import { readNutrientFields } from "../ui/nutrient-fields.js";
import { aiGuessNutrients } from "../helpers/api.js";
import { renderSearchView } from "../views/search-view.js";
import { renderBarcodeView } from "../views/barcode-view.js";
import { renderPhotoView } from "../views/photo-view.js";
import { renderManualEntryView } from "../views/manual-entry-view.js";

export interface SearchControllerHost {
  hass: { callWS<T = unknown>(msg: Record<string, unknown>): Promise<T> };
  shadowRoot: ShadowRoot | null;
  _config: VoedingslogConfig | null;
  _dialogMode: DialogMode;
  _scanning: boolean;
  _scanFailed: boolean;
  _photoCameraActive: boolean;
  _analyzing: boolean;
  _prefillProduct: Product | null;
  requestUpdate(): void;
  _closeDialog(): void;
  _setDialogMode(mode: string): void;
  _selectProduct(product: Product, returnMode?: DialogMode): void;
  _openFileInput(id: string): void;
  _startPhotoCamera(): Promise<void>;
  _stopPhotoCamera(): void;
  _openBarcodeScanner(): void;
  _handleBarcodePhoto(e: Event): void;
  _prefillSource: "photo" | "ai-guess" | null;
  _openManualWithPrefill(product: Product, source?: "photo" | "ai-guess"): void;
  _capturePhotoFrame(): string | null;
}

export class SearchController {
  host: SearchControllerHost;
  search: ProductSearch;
  favorites: Product[] = [];
  private _callback: ((p: Product) => void) | null = null;
  private _returnMode: DialogMode = null;

  /** The dialog to return to when closing sub-dialogs (barcode, manual, photo). */
  get returnToMode(): DialogMode {
    return this._returnMode || "products";
  }

  constructor(host: SearchControllerHost) {
    this.host = host;
    this.search = new ProductSearch(host);
  }

  reset(): void {
    this.search.reset();
    this._callback = null;
    this._returnMode = null;
  }

  async open(callback?: (p: Product) => void, returnMode?: DialogMode): Promise<void> {
    this._callback = callback || null;
    this._returnMode = returnMode || null;
    this.search.reset();
    try {
      const res = await this.host.hass.callWS<GetFavoritesResponse>({ type: "voedingslog/get_favorites" });
      this.favorites = res.products || [];
    } catch {
      this.favorites = [];
    }
    this.host._setDialogMode("search");
  }

  // ── Search dialog ────────────────────────────────────────────

  renderSearchDialog(): TemplateResult {
    const h = this.host;
    return renderSearchView({
      search: this.search,
      favorites: this.favorites,
      onClose: () => this.closeSearch(),
      onSelected: (p) => this._onSelected(p),
      renderResult: (p) => this._renderResult(p, true),
      onBarcode: () => h._openBarcodeScanner(),
      onManual: () => { h._prefillProduct = null; h._setDialogMode("manual"); },
      onAiGuess: h._config?.ai_task_entity ? () => this.aiGuessNutrients() : undefined,
    });
  }

  // ── Barcode dialog ───────────────────────────────────────────

  renderBarcodeDialog(): TemplateResult {
    const h = this.host;
    return renderBarcodeView({
      scanning: h._scanning,
      scanFailed: h._scanFailed,
      onClose: () => h._setDialogMode("search"),
      onBarcodePhoto: (e) => h._handleBarcodePhoto(e),
      onOpenFileInput: (id) => h._openFileInput(id),
      onLookup: () => this.lookupManualBarcode(),
    });
  }

  // ── Photo label dialog ───────────────────────────────────────

  renderPhotoDialog(): TemplateResult {
    const h = this.host;
    return renderPhotoView({
      host: h,
      onClose: () => h._setDialogMode("manual"),
      onCapture: (e) => this.handlePhotoCapture(e),
      onFrame: () => this.capturePhotoFrame(),
    });
  }

  // ── Manual entry dialog ──────────────────────────────────────

  renderManualEntryDialog(): TemplateResult {
    const h = this.host;
    return renderManualEntryView({
      prefill: h._prefillProduct,
      prefillSource: h._prefillSource,
      config: h._config,
      onClose: () => h._setDialogMode(this.returnToMode as string),
      onConfirm: () => this.confirmManualEntry(),
      onPhoto: () => this.openPhotoCapture(),
    });
  }

  // ── Actions ──────────────────────────────────────────────────

  closeSearch(): void {
    if (this._returnMode) {
      this.host._setDialogMode(this._returnMode as string);
      this._returnMode = null;
    } else {
      this.host._closeDialog();
    }
  }

  handleBarcodeResult(product: Product): void {
    this._onSelected(product);
  }

  private _onSelected(product: Product): void {
    if (this._callback) {
      this._callback(product);
      this._callback = null;
      if (this._returnMode) {
        this.host._setDialogMode(this._returnMode as string);
        this._returnMode = null;
      }
    } else {
      this.host._selectProduct(product, "products");
    }
  }

  private _renderResult(p: Product, showFav: boolean): TemplateResult {
    return html`
      <div class="search-result">
        <div class="search-result-main" @click=${() => this._onSelected(p)}>
          <span class="result-name">${p.name}</span>
          <span class="result-meta">${Math.round(p.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g${p.completeness !== undefined && p.completeness < 60 ? " · onvolledig" : ""}</span>
        </div>
        ${showFav && p.id
          ? html`<button class="fav-btn" @click=${(e: Event) => { e.stopPropagation(); this.toggleFavorite(p); }}>
              <ha-icon icon=${p.favorite ? "mdi:star" : "mdi:star-outline"}></ha-icon>
            </button>`
          : nothing}
      </div>
    `;
  }

  async toggleFavorite(product: Product): Promise<void> {
    if (!product.id) return;
    try {
      const res = await this.host.hass.callWS<{ favorite: boolean }>({
        type: "voedingslog/toggle_favorite",
        product_id: product.id,
      });
      product.favorite = res.favorite;
      this.host.requestUpdate();
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
    }
  }

  async lookupManualBarcode(): Promise<void> {
    const h = this.host;
    const input = h.shadowRoot?.getElementById("manual-barcode") as HTMLInputElement | null;
    const barcode = input?.value?.trim();
    if (!barcode) return;
    try {
      const res = await h.hass.callWS<LookupBarcodeResponse>({ type: "voedingslog/lookup_barcode", barcode });
      if (res.product) {
        this._onSelected(res.product);
      } else {
        alert("Barcode niet gevonden.");
      }
    } catch (e) {
      console.error("Barcode lookup failed:", e);
      alert("Fout bij opzoeken barcode.");
    }
  }

  openPhotoCapture(): void {
    this.host._analyzing = false;
    this.host._photoCameraActive = false;
    this.host._setDialogMode("photo");
  }

  async capturePhotoFrame(): Promise<void> {
    const b64 = this.host._capturePhotoFrame();
    if (!b64) return;
    this.host._stopPhotoCamera();
    await this._analyzePhoto(b64);
  }

  async handlePhotoCapture(e: Event): Promise<void> {
    const b64 = await readFileAsBase64(e);
    if (!b64) return;
    await this._analyzePhoto(b64);
  }

  private async _analyzePhoto(b64: string): Promise<void> {
    const h = this.host;
    h._analyzing = true;
    h.requestUpdate();
    try {
      const res = await h.hass.callWS<AnalyzePhotoResponse>({
        type: "voedingslog/analyze_photo",
        photo_b64: b64,
      });
      h._analyzing = false;
      if (res.product) {
        h._openManualWithPrefill(res.product);
      } else {
        alert("Kon voedingswaarden niet herkennen. Probeer een duidelijkere foto.");
        h.requestUpdate();
      }
    } catch (err) {
      h._analyzing = false;
      h.requestUpdate();
      alert("Fout bij analyseren foto: " + ((err as Error).message || err));
    }
  }

  async aiGuessNutrients(): Promise<void> {
    const h = this.host;
    const foodName = this.search.query.trim() || prompt("Voer een productnaam in (bijv. paprika):");
    if (!foodName) return;
    h._analyzing = true;
    h.requestUpdate();
    const product = await aiGuessNutrients(h.hass, foodName);
    h._analyzing = false;
    if (product) {
      h._openManualWithPrefill(product, "ai-guess");
    } else {
      h.requestUpdate();
    }
  }

  confirmManualEntry(): void {
    const h = this.host;
    const nameInput = h.shadowRoot?.getElementById("manual-name") as HTMLInputElement | null;
    const name = nameInput?.value?.trim();
    if (!name) { alert("Vul een productnaam in."); return; }

    const nutrients = readNutrientFields("manual", h.shadowRoot);
    const product: Product = { name, serving_grams: 100, nutrients };
    this._onSelected(product);
  }
}
