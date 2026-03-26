/**
 * Search controller — product search, barcode, photo label dialogs.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { Product, VoedingslogConfig, DialogMode, GetFavoritesResponse, LookupBarcodeResponse, AnalyzePhotoResponse } from "../types.js";
import { ProductSearch } from "../product-search.js";
import { renderPhotoPicker, readFileAsBase64 } from "../photo-capture.js";

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
  _selectProduct(product: Product): void;
  _openFileInput(id: string): void;
  _startPhotoCamera(): Promise<void>;
  _stopPhotoCamera(): void;
  _openBarcodeScanner(): void;
  _handleBarcodePhoto(e: Event): void;
  _openManualWithPrefill(product: Product): void;
  _capturePhotoFrame(): string | null;
}

export class SearchController {
  host: SearchControllerHost;
  search: ProductSearch;
  favorites: Product[] = [];
  private _callback: ((p: Product) => void) | null = null;
  private _returnMode: DialogMode = null;

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
    const showFavorites = !this.search.query.trim() && this.favorites.length > 0;
    return html`
      <div class="dialog-header">
        <h2>Zoek product</h2>
        <button class="close-btn" @click=${() => this.closeSearch()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        ${showFavorites
          ? html`
            <div class="favorites-section">
              <div class="section-label"><ha-icon icon="mdi:star" style="--mdc-icon-size:16px;vertical-align:middle;color:#ff9800"></ha-icon> Favorieten</div>
              ${this.favorites.map((p) => this._renderResult(p, true))}
            </div>
          `
          : nothing}
        ${this.search.renderSearchBar(
          (p) => this._onSelected(p),
          { renderResult: (p) => this._renderResult(p, true) },
        )}

        <div class="ai-validate-actions" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--divider-color)">
          <button class="btn-secondary btn-confirm" @click=${() => h._openBarcodeScanner()}>
            <ha-icon icon="mdi:barcode-scan"></ha-icon>
            Barcode
          </button>
          <button class="btn-secondary btn-confirm" @click=${() => { h._prefillProduct = null; h._setDialogMode("manual"); }}>
            <ha-icon icon="mdi:pencil-plus"></ha-icon>
            Handmatig
          </button>
        </div>
      </div>
    `;
  }

  // ── Barcode dialog ───────────────────────────────────────────

  renderBarcodeDialog(): TemplateResult {
    const h = this.host;
    return html`
      <div class="dialog-header">
        <h2>Scan barcode</h2>
        <button class="close-btn" @click=${() => h._setDialogMode("search")}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        ${h._scanFailed
          ? html`
            <input type="file" accept="image/*" id="file-input-barcode"
              @change=${(e: Event) => h._handleBarcodePhoto(e)} style="display:none" />
            <button class="btn-primary photo-btn" @click=${() => h._openFileInput("file-input-barcode")}>
              <ha-icon icon="mdi:image"></ha-icon>
              Foto van barcode
            </button>
          `
          : html`
            <div id="barcode-scanner-placeholder" class="scanner-area">
              ${h._scanning
                ? nothing
                : html`<p class="scanner-hint">Camera wordt gestart...</p>`}
            </div>
          `}
        <div class="manual-barcode">
          <span>Of voer handmatig in:</span>
          <div class="input-row">
            <input type="text" id="manual-barcode" placeholder="Barcode nummer"
              inputmode="numeric"
              @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this.lookupManualBarcode(); }} />
            <button class="btn-primary" @click=${() => this.lookupManualBarcode()}>Zoek</button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Photo label dialog ───────────────────────────────────────

  renderPhotoDialog(): TemplateResult {
    const h = this.host;
    return html`
      <div class="dialog-header">
        <h2>Foto van etiket</h2>
        <button class="close-btn" @click=${() => h._setDialogMode("manual")}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        ${renderPhotoPicker(
          h,
          "file-input-photo",
          (e: Event) => this.handlePhotoCapture(e),
          () => this.capturePhotoFrame(),
          "Maak een foto van het voedingsetiket op de verpakking.",
        )}
      </div>
    `;
  }

  // ── Manual entry dialog ──────────────────────────────────────

  renderManualEntryDialog(): TemplateResult {
    const h = this.host;
    const pre = h._prefillProduct;
    const fields = [
      { id: "manual-kcal", label: "Calorieën (kcal)", key: "energy-kcal_100g" },
      { id: "manual-fat", label: "Vetten (g)", key: "fat_100g" },
      { id: "manual-satfat", label: "Verzadigd vet (g)", key: "saturated-fat_100g" },
      { id: "manual-carbs", label: "Koolhydraten (g)", key: "carbohydrates_100g" },
      { id: "manual-sugars", label: "Waarvan suikers (g)", key: "sugars_100g" },
      { id: "manual-fiber", label: "Vezels (g)", key: "fiber_100g" },
      { id: "manual-protein", label: "Eiwitten (g)", key: "proteins_100g" },
      { id: "manual-sodium", label: "Natrium/zout (g)", key: "sodium_100g" },
    ];

    return html`
      <div class="dialog-header">
        <h2>${pre ? "Controleer voedingswaarden" : "Handmatig toevoegen"}</h2>
        <button class="close-btn" @click=${() => h._setDialogMode("search")}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        ${pre ? html`<p class="manual-hint">Door AI herkend. Controleer en pas aan indien nodig.</p>` : nothing}
        <div class="form-field">
          <label>Productnaam</label>
          <input type="text" id="manual-name"
            placeholder="Bijv. Zelfgemaakte soep"
            .value=${pre?.name || ""} />
        </div>
        <p class="manual-hint">Voedingswaarden per 100g:</p>
        <div class="manual-fields">
          ${fields.map(
            (f) => html`
              <div class="manual-field-row">
                <label>${f.label}</label>
                <input type="number" id=${f.id} min="0" step="0.1" inputmode="decimal"
                  .value=${String(pre?.nutrients?.[f.key] ?? 0)} />
              </div>
            `
          )}
        </div>
        ${!pre && !!h._config?.ai_task_entity ? html`
          <button class="btn-secondary btn-confirm" @click=${() => this.openPhotoCapture()}>
            <ha-icon icon="mdi:camera"></ha-icon>
            Foto van etiket (AI)
          </button>
        ` : nothing}
        <button class="btn-primary btn-confirm" @click=${() => this.confirmManualEntry(fields)}>
          <ha-icon icon="mdi:arrow-right"></ha-icon>
          Verder
        </button>
      </div>
    `;
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

  private _onSelected(product: Product): void {
    if (this._callback) {
      this._callback(product);
      this._callback = null;
      if (this._returnMode) {
        this.host._setDialogMode(this._returnMode as string);
        this._returnMode = null;
      }
    } else {
      this.host._selectProduct(product);
    }
  }

  private _renderResult(p: Product, showFav: boolean): TemplateResult {
    return html`
      <div class="search-result">
        <div class="search-result-main" @click=${() => this._onSelected(p)}>
          <span class="result-name">${p.name}</span>
          <span class="result-meta">${Math.round(p.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g</span>
        </div>
        ${showFav
          ? html`<button class="fav-btn" @click=${(e: Event) => { e.stopPropagation(); this.toggleFavorite(p); }}>
              <ha-icon icon=${p.favorite ? "mdi:star" : "mdi:star-outline"}></ha-icon>
            </button>`
          : nothing}
      </div>
    `;
  }

  async toggleFavorite(product: Product): Promise<void> {
    try {
      const res = await this.host.hass.callWS<{ favorite: boolean }>({
        type: "voedingslog/toggle_favorite",
        product_name: product.name,
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
        h._selectProduct(res.product);
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

  confirmManualEntry(fields: { id: string; key: string }[]): void {
    const h = this.host;
    const nameInput = h.shadowRoot?.getElementById("manual-name") as HTMLInputElement | null;
    const name = nameInput?.value?.trim();
    if (!name) { alert("Vul een productnaam in."); return; }

    const nutrients: Record<string, number> = {};
    for (const f of fields) {
      const input = h.shadowRoot?.getElementById(f.id) as HTMLInputElement | null;
      nutrients[f.key] = parseFloat(input?.value || "0") || 0;
    }

    const product: Product = { name, serving_grams: 100, nutrients };
    h._selectProduct(product);
  }
}
