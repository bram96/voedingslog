/**
 * AI features controller — text parsing, handwriting OCR, validation dialog.
 * Used via composition: the panel creates an instance and delegates to it.
 */
import { html, nothing, type TemplateResult } from "lit";
import type {
  MealCategory,
  MealIngredient,
  Product,
  ParsedProduct,
  ParseFoodResponse,
  SearchProductsResponse,
  VoedingslogConfig,
} from "../types.js";
import { KEY_NUTRIENTS_DISPLAY, DEFAULT_CATEGORY_LABELS, defaultCategory } from "../helpers.js";
import { renderPhotoPicker, readFileAsBase64, type PhotoCaptureHost } from "../photo-capture.js";

export interface AiControllerHost extends PhotoCaptureHost {
  hass: { callWS<T = unknown>(msg: Record<string, unknown>): Promise<T> };
  shadowRoot: ShadowRoot | null;
  _config: VoedingslogConfig | null;
  _selectedPerson: string | null;
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
    const title = isRecipe ? "AI ingrediënten invoer" : "Batch toevoegen";
    const closeAction = isRecipe ? () => h._setDialogMode("product-edit") : () => h._closeDialog();
    const placeholder = isRecipe
      ? "Bijv. 200g kipfilet, 100g rijst, 150g broccoli, scheutje olijfolie"
      : "Bijv. 2 boterhammen met kaas, een appel, kop koffie met melk";

    return html`
      <div class="dialog-header">
        <h2>${title}</h2>
        <button class="close-btn" @click=${closeAction}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        ${this.batchMode === "text"
          ? html`
            <p style="font-size:13px;color:var(--secondary-text-color);margin-top:0">
              Beschrijf wat je gegeten hebt. AI herkent de producten en zoekt voedingswaarden op.
            </p>
            <textarea
              id="ai-text-input"
              class="ai-textarea"
              placeholder=${placeholder}
            ></textarea>
            ${h._analyzing
              ? html`<div class="analyzing"><ha-icon icon="mdi:loading" class="spin"></ha-icon> Bezig met analyseren...</div>`
              : html`
                <button class="btn-primary btn-confirm" @click=${() => this.submitText(mode)}>
                  <ha-icon icon="mdi:auto-fix"></ha-icon>
                  Analyseren
                </button>
                <button class="btn-secondary btn-confirm" @click=${() => { this.batchMode = "photo"; h.requestUpdate(); }}>
                  <ha-icon icon="mdi:camera"></ha-icon>
                  Foto van handgeschreven lijst
                </button>
              `}
          `
          : html`
            <button class="btn-secondary" style="margin-bottom:12px;width:100%;padding:8px" @click=${() => { this.batchMode = "text"; h.requestUpdate(); }}>
              <ha-icon icon="mdi:keyboard"></ha-icon> Terug naar tekst invoer
            </button>
            ${renderPhotoPicker(
              h,
              "file-input-handwriting",
              (e: Event) => this.handleHandwritingPhoto(e),
              () => this._captureForHandwriting(),
              "Maak een foto van je handgeschreven lijst.",
            )}
          `}
      </div>
    `;
  }

  renderValidateDialog(): TemplateResult | typeof nothing {
    const h = this.host;
    if (!this.parsedProducts.length) return nothing;
    const idx = this.validateIndex;
    if (idx >= this.parsedProducts.length) {
      return html`
        <div class="dialog-header">
          <h2>Klaar!</h2>
          <button class="close-btn" @click=${() => h._closeDialog()}>
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>
        <div class="dialog-body">
          <p>Alle producten zijn verwerkt.</p>
          <button class="btn-primary btn-confirm" @click=${() => { h._closeDialog(); h._loadLog(); }}>
            Sluiten
          </button>
        </div>
      `;
    }

    const product = this.parsedProducts[idx];
    const pct = Math.round(((idx) / this.parsedProducts.length) * 100);

    return html`
      <div class="dialog-header">
        <h2>Product ${idx + 1} van ${this.parsedProducts.length}</h2>
        <button class="close-btn" @click=${() => h._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="ai-validate-progress">
          <div class="ai-validate-bar">
            <div class="ai-validate-fill" style="width:${pct}%"></div>
          </div>
          <span>${idx + 1}/${this.parsedProducts.length}</span>
        </div>

        <div class="ai-context">AI herkende: <strong>${product.ai_name || product.name}</strong></div>

        ${!product.matched
          ? html`<div class="ai-warning">Niet gevonden in database — zoek een product of sla over</div>`
          : nothing}

        <div class="ai-validate-search">
          <input
            type="text"
            placeholder="Zoek ander product..."
            .value=${this.validateSearch}
            @input=${(e: Event) => { this.validateSearch = (e.target as HTMLInputElement).value; h.requestUpdate(); }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this.searchValidate(); }}
          />
          <div style="display:flex;gap:4px;margin-top:4px">
            <button class="btn-secondary" style="flex:1;padding:6px;font-size:13px" @click=${() => this.searchValidate()}>
              Zoek lokaal
            </button>
            <button class="btn-secondary" style="flex:1;padding:6px;font-size:13px" @click=${() => this.searchValidate(true)}>
              Zoek online
            </button>
          </div>
          ${this.validateSearchResults.length > 0
            ? html`
              <div class="search-results">
                ${this.validateSearchResults.map(
                  (r) => html`
                    <div class="search-result">
                      <div class="search-result-main" @click=${() => this.selectProduct(r)}>
                        <span class="result-name">${r.name}</span>
                        <span class="result-meta">${Math.round(r.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g</span>
                      </div>
                    </div>
                  `
                )}
              </div>
            ` : nothing}
        </div>

        <div class="nutrient-preview">
          <div class="preview-title">${product.name}</div>
          <div class="nutrient-grid">
            ${KEY_NUTRIENTS_DISPLAY.map(
              (n) => html`
                <div class="nutrient-row">
                  <span>${n.label}</span>
                  <span>${(product.nutrients?.[n.key] || 0).toFixed(n.decimals)} ${n.unit}</span>
                </div>
              `
            )}
          </div>
        </div>

        <div class="form-field">
          <label>Gewicht (gram)</label>
          <input type="number" id="ai-validate-grams" .value=${String(product.serving_grams || 100)}
            min="1" step="1" inputmode="numeric" />
        </div>

        ${this._validateMode === "log" ? html`
          <div class="form-field">
            <label>Maaltijd</label>
            <select id="ai-validate-category">
              ${(["breakfast", "lunch", "dinner", "snack"] as MealCategory[]).map(
                (cat) => html`
                  <option value=${cat} ?selected=${cat === defaultCategory()}>
                    ${(h._config?.category_labels || DEFAULT_CATEGORY_LABELS)[cat]}
                  </option>
                `
              )}
            </select>
          </div>
        ` : nothing}

        <div class="ai-validate-actions">
          <button class="btn-secondary btn-confirm" @click=${() => this.skip()}>
            Overslaan
          </button>
          <button class="btn-primary btn-confirm" @click=${() => this.confirm()} ?disabled=${!product.matched}>
            ${this._validateMode === "recipe" ? "Ingrediënt toevoegen" : "Bevestigen"}
          </button>
        </div>
      </div>
    `;
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
