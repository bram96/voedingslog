import { LitElement, html, css, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Html5Qrcode } from "html5-qrcode";
import type {
  HomeAssistant,
  MealCategory,
  LogItem,
  IndexedLogItem,
  Product,
  Portion,
  CustomMeal,
  MealIngredient,
  VoedingslogConfig,
  GetLogResponse,
  GetMealsResponse,
  LookupBarcodeResponse,
  SearchProductsResponse,
  SaveMealResponse,
  AnalyzePhotoResponse,
  DialogMode,
} from "./types.js";
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_LABELS,
  KEY_NUTRIENTS_DISPLAY,
  defaultCategory,
  groupByCategory,
  calcItemNutrients,
  sumNutrients,
} from "./helpers.js";

@customElement("voedingslog-panel")
export class VoedingslogPanel extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @property({ type: Boolean }) narrow = false;
  @property({ attribute: false }) panel?: Record<string, unknown>;

  @state() private _config: VoedingslogConfig | null = null;
  @state() private _selectedPerson: string | null = null;
  @state() private _selectedDate: string = new Date().toISOString().split("T")[0];
  @state() private _items: LogItem[] = [];
  @state() private _loading = true;

  @state() private _dialogMode: DialogMode = null;
  @state() private _pendingProduct: Product | null = null;
  @state() private _searchResults: Product[] = [];
  @state() private _searchQuery = "";
  @state() private _scanning = false;
  @state() private _scanFailed = false;
  @state() private _photoCameraActive = false;
  @state() private _prefillProduct: Product | null = null;
  @state() private _analyzing = false;
  @state() private _searching = false;
  @state() private _searchSource: "local" | "online" = "local";
  @state() private _editingItem: IndexedLogItem | null = null;
  @state() private _meals: CustomMeal[] = [];
  @state() private _editingMeal: CustomMeal | null = null;
  @state() private _mealIngredientSearch = "";
  @state() private _mealIngredientResults: Product[] = [];

  private _html5Qrcode: Html5Qrcode | null = null;
  private _scannerContainerId = "vl-barcode-reader";
  private _positionFrame: number | null = null;
  private _photoCameraStream: MediaStream | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────

  override async connectedCallback(): Promise<void> {
    super.connectedCallback();
    await this._loadConfig();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopCamera();
    this._cleanupScannerContainer();
  }

  private async _loadConfig(): Promise<void> {
    try {
      this._config = await this.hass.callWS<VoedingslogConfig>({
        type: "voedingslog/get_config",
      });
      if (this._config?.persons?.length && !this._selectedPerson) {
        this._selectedPerson = this._config.persons[0];
      }
      await this._loadLog();
    } catch (e) {
      console.error("Failed to load voedingslog config:", e);
      this._loading = false;
    }
  }

  private async _loadLog(): Promise<void> {
    if (!this._selectedPerson) return;
    this._loading = true;
    try {
      const res = await this.hass.callWS<GetLogResponse>({
        type: "voedingslog/get_log",
        person: this._selectedPerson,
        date: this._selectedDate,
      });
      this._items = res.items || [];
    } catch (e) {
      console.error("Failed to load log:", e);
    }
    this._loading = false;
  }

  // ── Rendering ────────────────────────────────────────────────────

  override render(): TemplateResult {
    if (!this._config || this._loading) {
      return html`<div class="container"><p>Laden...</p></div>`;
    }

    const labels = this._config.category_labels || DEFAULT_CATEGORY_LABELS;
    const groups = groupByCategory(this._items);

    return html`
      <div class="panel">
        ${this._renderHeader()}
        <div class="container">
          ${this._renderActions()}
          ${this._renderDayTotals()}
          ${(["breakfast", "lunch", "dinner", "snack"] as MealCategory[]).map(
            (cat) => this._renderCategorySection(cat, labels[cat], groups[cat])
          )}
        </div>
      </div>
      ${this._renderDialog()}
    `;
  }

  private _toggleMenu(): void {
    this.dispatchEvent(
      new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true })
    );
  }

  private _changeDate(delta: number): void {
    const d = new Date(this._selectedDate);
    d.setDate(d.getDate() + delta);
    this._selectedDate = d.toISOString().split("T")[0];
    this._loadLog();
  }

  private _openDatePicker(): void {
    const input = this.shadowRoot?.getElementById("header-date-picker") as HTMLInputElement | null;
    if (input) {
      input.showPicker();
    }
  }

  private _formatDateLabel(dateStr: string): string {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    if (dateStr === today) return "Vandaag";
    if (dateStr === yesterday) return "Gisteren";
    const d = new Date(dateStr);
    return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
  }

  private _renderHeader(): TemplateResult {
    const persons = this._config?.persons || [];
    return html`
      <div class="header">
        <div class="header-top">
          ${this.narrow
            ? html`<button class="menu-btn" @click=${() => this._toggleMenu()}>
                <ha-icon icon="mdi:menu"></ha-icon>
              </button>`
            : nothing}
          <h1>Voedingslog</h1>
        </div>
        <div class="date-nav">
          <button class="date-nav-btn" @click=${() => this._changeDate(-1)}>
            <ha-icon icon="mdi:chevron-left"></ha-icon>
          </button>
          <button class="date-picker-btn" @click=${() => this._openDatePicker()}>
            <span class="date-text">${this._formatDateLabel(this._selectedDate)}</span>
          </button>
          <input
            type="date"
            id="header-date-picker"
            .value=${this._selectedDate}
            @change=${(e: Event) => {
              this._selectedDate = (e.target as HTMLInputElement).value;
              this._loadLog();
            }}
            style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;"
          />
          <button class="date-nav-btn" @click=${() => this._changeDate(1)}>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
          </button>
        </div>
        ${persons.length > 1
          ? html`<div class="person-tabs">
              ${persons.map(
                (p) => html`
                  <button
                    class="person-tab ${p === this._selectedPerson ? "active" : ""}"
                    @click=${() => {
                      this._selectedPerson = p;
                      this._loadLog();
                    }}
                  >
                    ${p}
                  </button>
                `
              )}
            </div>`
          : nothing}
      </div>
    `;
  }

  private _renderActions(): TemplateResult {
    const hasAI = !!this._config?.ai_task_entity;
    return html`
      <div class="actions">
        <button class="action-btn" @click=${() => this._openBarcodeScanner()}>
          <ha-icon icon="mdi:barcode-scan"></ha-icon>
          <span>Scan barcode</span>
        </button>
        <button class="action-btn" @click=${() => this._openSearch()}>
          <ha-icon icon="mdi:magnify"></ha-icon>
          <span>Zoek product</span>
        </button>
        <button class="action-btn" @click=${() => this._openPhotoCapture()} ?disabled=${!hasAI}>
          <ha-icon icon="mdi:camera"></ha-icon>
          <span>Foto etiket</span>
        </button>
        <button class="action-btn" @click=${() => this._openMeals()}>
          <ha-icon icon="mdi:pot-steam"></ha-icon>
          <span>Maaltijden</span>
        </button>
        <button class="action-btn" @click=${() => { this._prefillProduct = null; this._dialogMode = "manual"; }}>
          <ha-icon icon="mdi:pencil-plus"></ha-icon>
          <span>Handmatig</span>
        </button>
      </div>
    `;
  }

  private _renderDayTotals(): TemplateResult {
    const totals = sumNutrients(this._items);
    const goal = this._config?.calories_goal || 2000;
    const kcal = totals["energy-kcal_100g"] || 0;
    const pct = Math.min(100, Math.round((kcal / goal) * 100));

    return html`
      <div class="day-totals card">
        <div class="totals-header">
          <span class="totals-title">Dagtotaal</span>
          <span class="totals-cal">${Math.round(kcal)} / ${goal} kcal</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            style="width: ${pct}%; background: ${
              pct > 100
                ? "var(--error-color, #db4437)"
                : "var(--primary-color)"
            }"
          ></div>
        </div>
        <div class="macro-row">
          ${KEY_NUTRIENTS_DISPLAY.filter((n) => n.key !== "energy-kcal_100g").map(
            (n) => html`
              <div class="macro-item">
                <span class="macro-value">${(totals[n.key] || 0).toFixed(n.decimals)}${n.unit}</span>
                <span class="macro-label">${n.label}</span>
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  private _renderCategorySection(
    category: MealCategory,
    label: string,
    items: IndexedLogItem[]
  ): TemplateResult {
    const catTotals = sumNutrients(items);
    return html`
      <div class="category-section card">
        <div class="category-header">
          <ha-icon icon=${CATEGORY_ICONS[category] || "mdi:food"}></ha-icon>
          <span class="category-title">${label}</span>
          <span class="category-cal">${Math.round(catTotals["energy-kcal_100g"] || 0)} kcal</span>
        </div>
        ${items.length === 0
          ? html`<div class="empty-hint">Nog geen items</div>`
          : items.map((item) => this._renderItem(item))}
      </div>
    `;
  }

  private _renderItem(item: IndexedLogItem): TemplateResult {
    const vals = calcItemNutrients(item);
    return html`
      <div class="food-item" @click=${() => this._openEditDialog(item)}>
        <div class="item-main">
          <span class="item-name">${item.name}</span>
          <span class="item-meta">${item.grams}g · ${item.time}</span>
        </div>
        <div class="item-nutrients">
          <span class="item-kcal">${Math.round(vals["energy-kcal_100g"] || 0)} kcal</span>
        </div>
        <button class="item-delete" @click=${(e: Event) => { e.stopPropagation(); this._deleteItem(item._index); }}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
    `;
  }

  // ── Dialogs ──────────────────────────────────────────────────────

  private _renderDialog(): TemplateResult | typeof nothing {
    if (!this._dialogMode) return nothing;
    return html`
      <div class="dialog-overlay" @click=${() => this._closeDialog()}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          ${this._dialogMode === "barcode" ? this._renderBarcodeDialog() : nothing}
          ${this._dialogMode === "search" ? this._renderSearchDialog() : nothing}
          ${this._dialogMode === "photo" ? this._renderPhotoDialog() : nothing}
          ${this._dialogMode === "weight" ? this._renderWeightDialog() : nothing}
          ${this._dialogMode === "edit" ? this._renderEditDialog() : nothing}
          ${this._dialogMode === "meals" ? this._renderMealsDialog() : nothing}
          ${this._dialogMode === "meal-edit" ? this._renderMealEditDialog() : nothing}
          ${this._dialogMode === "manual" ? this._renderManualEntryDialog() : nothing}
        </div>
      </div>
    `;
  }



  private _renderCameraCapture(purpose: "barcode" | "photo"): TemplateResult {
    const fileChangeHandler = purpose === "barcode"
      ? (e: Event) => this._handleBarcodePhoto(e)
      : (e: Event) => this._handlePhotoCapture(e);

    return html`
      <input type="file" accept="image/*"
        id=${"file-input-" + purpose}
        @change=${fileChangeHandler} style="display:none" />
      <button class="btn-primary photo-btn" @click=${() => this._openFileInput("file-input-" + purpose)}>
        <ha-icon icon="mdi:image"></ha-icon>
        ${purpose === "barcode" ? "Foto van barcode" : "Foto van etiket"}
      </button>
    `;
  }

  private _renderBarcodeDialog(): TemplateResult {
    return html`
      <div class="dialog-header">
        <h2>Scan barcode</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">

        ${this._scanFailed
          ? html`
            ${this._renderCameraCapture("barcode")}
          `
          : html`
            <div id="barcode-scanner-placeholder" class="scanner-area">
              ${this._scanning
                ? nothing
                : html`<p class="scanner-hint">Camera wordt gestart...</p>`}
            </div>
          `}
        <div class="manual-barcode">
          <span>Of voer handmatig in:</span>
          <div class="input-row">
            <input
              type="text"
              id="manual-barcode"
              placeholder="Barcode nummer"
              inputmode="numeric"
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === "Enter") this._lookupManualBarcode();
              }}
            />
            <button class="btn-primary" @click=${() => this._lookupManualBarcode()}>Zoek</button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderSearchDialog(): TemplateResult {
    return html`
      <div class="dialog-header">
        <h2>Zoek product</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="input-row">
          <input
            type="text"
            id="search-input"
            placeholder="Productnaam..."
            .value=${this._searchQuery}
            @input=${(e: Event) => {
              this._searchQuery = (e.target as HTMLInputElement).value;
            }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === "Enter") this._doSearch();
            }}
          />
          <button class="btn-primary" @click=${() => this._doSearch()}>Zoek</button>
        </div>
        ${this._searching
          ? html`<div class="search-loading"><ha-circular-progress indeterminate size="small"></ha-circular-progress> Zoeken...</div>`
          : nothing}
        <div class="search-results">
          ${this._searchResults.map(
            (p) => html`
              <div class="search-result" @click=${() => this._selectProduct(p)}>
                <span class="result-name">${p.name}</span>
                <span class="result-meta">${Math.round(p.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g</span>
              </div>
            `
          )}
        </div>
        ${this._searchSource === "local" && this._searchResults.length >= 0 && this._searchQuery.trim()
          ? html`<button class="btn-secondary search-online-btn" @click=${() => this._doSearch(true)}>
              <ha-icon icon="mdi:cloud-search"></ha-icon> Zoek online (Open Food Facts)
            </button>`
          : nothing}
      </div>
    `;
  }

  private _renderPhotoDialog(): TemplateResult {
    return html`
      <div class="dialog-header">
        <h2>Foto van etiket</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        ${this._analyzing
          ? html`<div class="analyzing">
              <ha-circular-progress indeterminate></ha-circular-progress>
              <p>Analyseren...</p>
            </div>`
          : this._photoCameraActive
            ? html`
              <div class="camera-preview">
                <video id="photo-camera-video" autoplay playsinline></video>
                <button class="btn-primary camera-capture-btn" @click=${() => this._capturePhotoFrame()}>
                  <ha-icon icon="mdi:camera"></ha-icon> Maak foto
                </button>
              </div>
            `
            : html`
              <p class="photo-hint">Maak een foto van het voedingsetiket op de verpakking.</p>
              <div class="photo-buttons">
                <button class="btn-primary photo-btn" @click=${() => this._startPhotoCamera()}>
                  <ha-icon icon="mdi:camera"></ha-icon> Open camera
                </button>
                <button class="btn-secondary photo-btn" @click=${() => this._openFileInput("file-input-photo")}>
                  <ha-icon icon="mdi:image"></ha-icon> Kies afbeelding
                </button>
              </div>
              <input type="file" accept="image/*"
                id="file-input-photo"
                @change=${(e: Event) => this._handlePhotoCapture(e)}
                style="display:none" />
            `}
      </div>
    `;
  }

  private _renderPortionChips(portions: Portion[]): TemplateResult | typeof nothing {
    if (!portions || portions.length === 0) return nothing;
    return html`
      <div class="portion-chips">
        ${portions.map(
          (p) => html`
            <button
              class="portion-chip"
              @click=${() => {
                const input = this.shadowRoot?.getElementById("weight-input") as HTMLInputElement | null;
                if (input) {
                  input.value = String(p.grams);
                  this.requestUpdate();
                }
              }}
            >
              ${p.label}
            </button>
          `
        )}
      </div>
    `;
  }

  private _renderWeightDialog(): TemplateResult | typeof nothing {
    if (!this._pendingProduct) return nothing;
    const p = this._pendingProduct;

    return html`
      <div class="dialog-header">
        <h2>${p.name}</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="nutrient-preview">
          <div class="preview-title">Voedingswaarden per 100g</div>
          <div class="nutrient-grid">
            ${KEY_NUTRIENTS_DISPLAY.map(
              (n) => html`
                <div class="nutrient-row">
                  <span>${n.label}</span>
                  <span>${(p.nutrients?.[n.key] || 0).toFixed(n.decimals)} ${n.unit}</span>
                </div>
              `
            )}
          </div>
        </div>

        <div class="weight-section">
          <label>Gewicht (gram)</label>
          ${this._renderPortionChips(p.portions || [])}
          <input
            type="number"
            id="weight-input"
            .value=${String(p.serving_grams || 100)}
            min="1"
            step="1"
            inputmode="numeric"
            @input=${() => this.requestUpdate()}
          />
        </div>

        <div class="category-section-dialog">
          <label>Maaltijd</label>
          <select id="category-select">
            ${(["breakfast", "lunch", "dinner", "snack"] as MealCategory[]).map(
              (cat) => html`
                <option value=${cat} ?selected=${cat === defaultCategory()}>
                  ${(this._config?.category_labels || DEFAULT_CATEGORY_LABELS)[cat]}
                </option>
              `
            )}
          </select>
        </div>

        <div class="date-section-dialog">
          <label>Datum</label>
          <input
            type="date"
            id="log-date-input"
            .value=${this._selectedDate}
          />
        </div>

        <button class="btn-primary btn-confirm" @click=${() => this._confirmLog()}>
          <ha-icon icon="mdi:plus"></ha-icon>
          Toevoegen
        </button>
      </div>
    `;
  }

  private _renderEditDialog(): TemplateResult | typeof nothing {
    if (!this._editingItem) return nothing;
    const item = this._editingItem;

    return html`
      <div class="dialog-header">
        <h2>${item.name}</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="nutrient-preview">
          <div class="preview-title">Voedingswaarden per 100g</div>
          <div class="nutrient-grid">
            ${KEY_NUTRIENTS_DISPLAY.map(
              (n) => html`
                <div class="nutrient-row">
                  <span>${n.label}</span>
                  <span>${(item.nutrients?.[n.key] || 0).toFixed(n.decimals)} ${n.unit}</span>
                </div>
              `
            )}
          </div>
        </div>

        <div class="weight-section">
          <label>Gewicht (gram)</label>
          <input
            type="number"
            id="edit-weight-input"
            .value=${String(item.grams)}
            min="1"
            step="1"
            inputmode="numeric"
            @input=${() => this.requestUpdate()}
          />
        </div>

        <div class="category-section-dialog">
          <label>Maaltijd</label>
          <select id="edit-category-select">
            ${(["breakfast", "lunch", "dinner", "snack"] as MealCategory[]).map(
              (cat) => html`
                <option value=${cat} ?selected=${cat === item.category}>
                  ${(this._config?.category_labels || DEFAULT_CATEGORY_LABELS)[cat]}
                </option>
              `
            )}
          </select>
        </div>

        <div class="date-section-dialog">
          <label>Datum</label>
          <input
            type="date"
            id="edit-date-input"
            .value=${this._selectedDate}
          />
        </div>

        <button class="btn-primary btn-confirm" @click=${() => this._confirmEdit()}>
          <ha-icon icon="mdi:check"></ha-icon>
          Opslaan
        </button>
      </div>
    `;
  }

  // ── Manual entry dialog ──────────────────────────────────────────

  private _renderManualEntryDialog(): TemplateResult {
    const pre = this._prefillProduct;
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
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        ${pre ? html`<p class="manual-hint">Door AI herkend. Controleer en pas aan indien nodig.</p>` : nothing}
        <div class="weight-section">
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
        <button class="btn-primary btn-confirm" @click=${() => this._confirmManualEntry(fields)}>
          <ha-icon icon="mdi:arrow-right"></ha-icon>
          Verder
        </button>
      </div>
    `;
  }

  private _openManualWithPrefill(product: Product): void {
    this._prefillProduct = product;
    this._dialogMode = "manual";
  }

  private _confirmManualEntry(fields: { id: string; key: string }[]): void {
    const nameInput = this.shadowRoot?.getElementById("manual-name") as HTMLInputElement | null;
    const name = nameInput?.value?.trim();
    if (!name) {
      alert("Vul een productnaam in.");
      return;
    }

    const nutrients: Record<string, number> = {};
    for (const f of fields) {
      const input = this.shadowRoot?.getElementById(f.id) as HTMLInputElement | null;
      nutrients[f.key] = parseFloat(input?.value || "0") || 0;
    }

    const product: Product = {
      name,
      serving_grams: 100,
      nutrients,
    };
    this._pendingProduct = product;
    this._dialogMode = "weight";
  }

  // ── Meals dialogs ────────────────────────────────────────────────

  private _renderMealsDialog(): TemplateResult {
    return html`
      <div class="dialog-header">
        <h2>Maaltijden</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        ${this._meals.length === 0
          ? html`<p class="empty-hint">Nog geen maaltijden. Maak een maaltijd aan om snel te kunnen loggen.</p>`
          : this._meals.map(
              (meal) => html`
                <div class="meal-item">
                  <div class="meal-info" @click=${() => this._logMeal(meal)}>
                    <span class="meal-name">${meal.name}</span>
                    <span class="meal-meta">
                      ${meal.ingredients.length} ingrediënten · ${Math.round(meal.total_grams)}g totaal ·
                      ${Math.round((meal.nutrients_per_100g?.["energy-kcal_100g"] || 0) * meal.total_grams / 100)} kcal
                    </span>
                  </div>
                  <button class="item-edit" @click=${() => this._openMealEditor(meal)}>
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                  <button class="item-delete" @click=${() => this._deleteMeal(meal.id)}>
                    <ha-icon icon="mdi:close"></ha-icon>
                  </button>
                </div>
              `
            )}
        <button class="btn-primary btn-confirm" style="margin-top:12px" @click=${() => this._openMealEditor(null)}>
          <ha-icon icon="mdi:plus"></ha-icon>
          Nieuwe maaltijd
        </button>
      </div>
    `;
  }

  private _renderMealEditDialog(): TemplateResult {
    const meal = this._editingMeal;
    const ingredients = meal?.ingredients || [];
    return html`
      <div class="dialog-header">
        <h2>${meal?.id ? "Maaltijd bewerken" : "Nieuwe maaltijd"}</h2>
        <button class="close-btn" @click=${() => { this._dialogMode = "meals"; this._editingMeal = null; }}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="weight-section">
          <label>Naam</label>
          <input
            type="text"
            id="meal-name-input"
            .value=${meal?.name || ""}
            placeholder="Bijv. Macaroni"
          />
        </div>

        <div class="weight-section">
          <label>Standaard portie (gram)</label>
          <input
            type="number"
            id="meal-portion-input"
            .value=${String(meal?.preferred_portion || "")}
            placeholder="Bijv. 400"
            min="1"
            step="1"
            inputmode="numeric"
          />
        </div>

        <div class="meal-ingredients-section">
          <label class="section-label">Ingrediënten</label>
          ${ingredients.map(
            (ing, idx) => html`
              <div class="ingredient-row">
                <span class="ingredient-name">${ing.name}</span>
                <input
                  type="number"
                  class="ingredient-grams-input"
                  .value=${String(ing.grams)}
                  min="1"
                  step="1"
                  inputmode="numeric"
                  @change=${(e: Event) => this._updateIngredientGrams(idx, parseFloat((e.target as HTMLInputElement).value))}
                />
                <span class="ingredient-unit">g</span>
                <button class="item-delete" @click=${() => this._removeMealIngredient(idx)}>
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
              </div>
            `
          )}

          <div class="add-ingredient">
            <div class="input-row">
              <input
                type="text"
                id="ingredient-search"
                placeholder="Zoek ingrediënt..."
                .value=${this._mealIngredientSearch}
                @input=${(e: Event) => {
                  this._mealIngredientSearch = (e.target as HTMLInputElement).value;
                }}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter") this._searchMealIngredient();
                }}
              />
              <button class="btn-primary" @click=${() => this._searchMealIngredient()}>Zoek</button>
            </div>
            ${this._searching
              ? html`<div class="search-loading"><ha-circular-progress indeterminate size="small"></ha-circular-progress> Zoeken...</div>`
              : nothing}
            <div class="search-results">
              ${this._mealIngredientResults.map(
                (p) => html`
                  <div class="search-result" @click=${() => this._addMealIngredient(p)}>
                    <span class="result-name">${p.name}</span>
                    <span class="result-meta">${Math.round(p.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g</span>
                  </div>
                `
              )}
            </div>
          </div>
        </div>

        <button class="btn-primary btn-confirm" @click=${() => this._saveMeal()}>
          <ha-icon icon="mdi:check"></ha-icon>
          Opslaan
        </button>
      </div>
    `;
  }

  // ── Actions ──────────────────────────────────────────────────────

  private _openBarcodeScanner(): void {
    this._dialogMode = "barcode";
    this._scanning = false;
    this._scanFailed = false;
    this.updateComplete.then(() => this._startLiveScanner());
  }

  private _trackScannerPosition(): void {
    const container = document.getElementById(this._scannerContainerId);
    const placeholder = this.shadowRoot?.getElementById("barcode-scanner-placeholder");
    if (!container || !placeholder) return;

    const rect = placeholder.getBoundingClientRect();
    container.style.position = "fixed";
    container.style.top = `${rect.top}px`;
    container.style.left = `${rect.left}px`;
    container.style.width = `${rect.width}px`;
    container.style.height = `${Math.max(rect.height, 250)}px`;
    container.style.zIndex = "101";
    container.style.borderRadius = "8px";
    container.style.overflow = "hidden";

    this._positionFrame = requestAnimationFrame(() => this._trackScannerPosition());
  }

  private async _startLiveScanner(): Promise<void> {
    try {
      this._cleanupScannerContainer();

      const container = document.createElement("div");
      container.id = this._scannerContainerId;
      document.body.appendChild(container);

      const placeholder = this.shadowRoot?.getElementById("barcode-scanner-placeholder");
      if (placeholder) {
        placeholder.style.minHeight = "250px";
      }

      // Continuously track placeholder position (dialog animates in)
      this._trackScannerPosition();

      this._html5Qrcode = new Html5Qrcode(this._scannerContainerId);
      this._scanning = true;

      const startPromise = this._html5Qrcode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.5 },
        (decodedText: string) => {
          this._scanning = false;
          this._stopCamera();
          this._lookupBarcode(decodedText);
        },
        () => {}
      );

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Camera timeout")), 10000)
      );

      await Promise.race([startPromise, timeout]);
    } catch (e) {
      console.warn("Live barcode scanner failed:", e);
      this._scanning = false;
      this._scanFailed = true;
      this._stopCamera();
    }
  }

  private _openSearch(): void {
    this._dialogMode = "search";
    this._searchResults = [];
    this._searchQuery = "";
    this._searchSource = "local";
  }

  private _openEditDialog(item: IndexedLogItem): void {
    this._editingItem = item;
    this._dialogMode = "edit";
  }

  private _openPhotoCapture(): void {
    this._dialogMode = "photo";
    this._analyzing = false;
    this._photoCameraActive = false;
  }

  private async _startPhotoCamera(): Promise<void> {
    try {
      this._photoCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      this._photoCameraActive = true;
      await this.updateComplete;
      const video = this.shadowRoot?.getElementById("photo-camera-video") as HTMLVideoElement | null;
      if (video) {
        video.srcObject = this._photoCameraStream;
      }
    } catch (e) {
      console.warn("Photo camera failed:", e);
      alert("Camera niet beschikbaar. Gebruik 'Kies afbeelding'.");
    }
  }

  private async _capturePhotoFrame(): Promise<void> {
    const video = this.shadowRoot?.getElementById("photo-camera-video") as HTMLVideoElement | null;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    this._stopPhotoCamera();
    this._analyzing = true;

    try {
      const b64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
      const res = await this.hass.callWS<AnalyzePhotoResponse>({
        type: "voedingslog/analyze_photo",
        photo_b64: b64,
      });
      this._analyzing = false;
      if (res.product) {
        this._openManualWithPrefill(res.product);
      } else {
        alert("Kon voedingswaarden niet herkennen. Probeer een duidelijkere foto.");
      }
    } catch (err) {
      this._analyzing = false;
      alert("Fout bij analyseren foto: " + ((err as Error).message || err));
    }
  }

  private _stopPhotoCamera(): void {
    this._photoCameraActive = false;
    if (this._photoCameraStream) {
      this._photoCameraStream.getTracks().forEach((t) => t.stop());
      this._photoCameraStream = null;
    }
  }

  private async _openMeals(): Promise<void> {
    try {
      const res = await this.hass.callWS<GetMealsResponse>({ type: "voedingslog/get_meals" });
      this._meals = res.meals || [];
    } catch (e) {
      console.error("Failed to load meals:", e);
    }
    this._dialogMode = "meals";
  }

  private _openMealEditor(meal: CustomMeal | null): void {
    this._editingMeal = meal
      ? { ...meal, ingredients: [...meal.ingredients] }
      : { id: "", name: "", ingredients: [], total_grams: 0, nutrients_per_100g: {} };
    this._mealIngredientSearch = "";
    this._mealIngredientResults = [];
    this._dialogMode = "meal-edit";
  }

  private _logMeal(meal: CustomMeal): void {
    const defaultGrams = meal.preferred_portion || meal.total_grams;
    const portions: Portion[] = [];
    if (meal.preferred_portion) {
      portions.push({ label: `Portie (${Math.round(meal.preferred_portion)}g)`, grams: meal.preferred_portion });
    }
    portions.push({ label: `Heel recept (${Math.round(meal.total_grams)}g)`, grams: meal.total_grams });
    if (defaultGrams !== 100 && meal.total_grams !== 100) {
      portions.push({ label: "100g", grams: 100 });
    }

    const product: Product = {
      name: meal.name,
      serving_grams: defaultGrams,
      portions,
      nutrients: meal.nutrients_per_100g,
    };
    this._pendingProduct = product;
    this._dialogMode = "weight";
  }

  private async _searchMealIngredient(): Promise<void> {
    const query = this._mealIngredientSearch.trim();
    if (!query) return;
    this._searching = true;
    try {
      const res = await this.hass.callWS<SearchProductsResponse>({
        type: "voedingslog/search_products",
        query,
      });
      this._mealIngredientResults = res.products || [];
    } catch (e) {
      console.error("Ingredient search failed:", e);
    }
    this._searching = false;
  }

  private _addMealIngredient(product: Product): void {
    if (!this._editingMeal) return;
    const grams = parseFloat(prompt(`Hoeveel gram ${product.name}?`, String(product.serving_grams || 100)) || "");
    if (!grams || grams <= 0) return;

    const ingredient: MealIngredient = {
      name: product.name,
      grams,
      nutrients: product.nutrients,
    };
    this._editingMeal = {
      ...this._editingMeal,
      ingredients: [...this._editingMeal.ingredients, ingredient],
    };
    this._mealIngredientResults = [];
    this._mealIngredientSearch = "";
  }

  private _updateIngredientGrams(index: number, grams: number): void {
    if (!this._editingMeal || !grams || grams <= 0) return;
    const ingredients = [...this._editingMeal.ingredients];
    ingredients[index] = { ...ingredients[index], grams };
    this._editingMeal = { ...this._editingMeal, ingredients };
  }

  private _removeMealIngredient(index: number): void {
    if (!this._editingMeal) return;
    const ingredients = [...this._editingMeal.ingredients];
    ingredients.splice(index, 1);
    this._editingMeal = { ...this._editingMeal, ingredients };
  }

  private async _saveMeal(): Promise<void> {
    if (!this._editingMeal) return;
    const nameInput = this.shadowRoot?.getElementById("meal-name-input") as HTMLInputElement | null;
    const name = nameInput?.value?.trim();
    if (!name) {
      alert("Vul een naam in.");
      return;
    }
    if (this._editingMeal.ingredients.length === 0) {
      alert("Voeg minimaal één ingrediënt toe.");
      return;
    }

    const portionInput = this.shadowRoot?.getElementById("meal-portion-input") as HTMLInputElement | null;
    const preferredPortion = parseFloat(portionInput?.value || "") || undefined;

    try {
      await this.hass.callWS<SaveMealResponse>({
        type: "voedingslog/save_meal",
        meal: {
          id: this._editingMeal.id || undefined,
          name,
          ingredients: this._editingMeal.ingredients,
          preferred_portion: preferredPortion,
        },
      });
      await this._openMeals(); // Refresh list and go back
    } catch (e) {
      console.error("Failed to save meal:", e);
      alert("Fout bij opslaan.");
    }
  }

  private async _deleteMeal(mealId: string): Promise<void> {
    if (!confirm("Maaltijd verwijderen?")) return;
    try {
      await this.hass.callWS({ type: "voedingslog/delete_meal", meal_id: mealId });
      this._meals = this._meals.filter((m) => m.id !== mealId);
    } catch (e) {
      console.error("Failed to delete meal:", e);
    }
  }

  private _closeDialog(): void {
    this._stopCamera();
    this._stopPhotoCamera();
    this._dialogMode = null;
    this._pendingProduct = null;
    this._editingItem = null;
    this._searchResults = [];
    this._analyzing = false;
    this._scanning = false;
    this._scanFailed = false;
    this._editingMeal = null;
    this._mealIngredientSearch = "";
    this._mealIngredientResults = [];
    this._prefillProduct = null;
  }

  private _openFileInput(id: string): void {
    const input = this.shadowRoot?.getElementById(id) as HTMLInputElement | null;
    if (input) {
      input.value = "";
      input.click();
    }
  }

  private async _handleBarcodePhoto(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Create a hidden container in the light DOM for html5-qrcode
    this._cleanupScannerContainer();
    const container = document.createElement("div");
    container.id = this._scannerContainerId;
    container.style.display = "none";
    document.body.appendChild(container);

    try {
      const scanner = new Html5Qrcode(this._scannerContainerId);
      const result = await scanner.scanFile(file, false);
      this._cleanupScannerContainer();
      await this._lookupBarcode(result);
    } catch (err) {
      console.warn("Could not decode barcode from photo:", err);
      this._cleanupScannerContainer();
      alert("Kon geen barcode herkennen in de foto. Probeer opnieuw of voer het nummer handmatig in.");
    }
  }

  private _stopCamera(): void {
    if (this._html5Qrcode) {
      this._html5Qrcode
        .stop()
        .catch(() => {
          // ignore stop errors
        })
        .finally(() => {
          this._html5Qrcode = null;
          this._cleanupScannerContainer();
        });
    } else {
      this._cleanupScannerContainer();
    }
  }

  private _cleanupScannerContainer(): void {
    if (this._positionFrame) {
      cancelAnimationFrame(this._positionFrame);
      this._positionFrame = null;
    }
    const existing = document.getElementById(this._scannerContainerId);
    if (existing) {
      existing.remove();
    }
  }

  private async _lookupManualBarcode(): Promise<void> {
    const input = this.shadowRoot?.getElementById(
      "manual-barcode"
    ) as HTMLInputElement | null;
    const barcode = input?.value?.trim();
    if (!barcode) return;
    await this._lookupBarcode(barcode);
  }

  private async _lookupBarcode(barcode: string): Promise<void> {
    try {
      const res = await this.hass.callWS<LookupBarcodeResponse>({
        type: "voedingslog/lookup_barcode",
        barcode,
      });
      if (res.product) {
        this._selectProduct(res.product);
      } else {
        alert(`Barcode ${barcode} niet gevonden in Open Food Facts.`);
      }
    } catch (e) {
      console.error("Barcode lookup failed:", e);
      alert("Fout bij opzoeken barcode.");
    }
  }

  private async _doSearch(online = false): Promise<void> {
    const input = this.shadowRoot?.getElementById("search-input") as HTMLInputElement | null;
    const query = (input?.value || this._searchQuery).trim();
    if (!query) return;
    this._searching = true;
    try {
      const res = await this.hass.callWS<SearchProductsResponse & { source?: string }>({
        type: "voedingslog/search_products",
        query,
        online,
      });
      this._searchResults = res.products || [];
      this._searchSource = (res.source as "local" | "online") || "local";
    } catch (e) {
      console.error("Search failed:", e);
      alert("Fout bij zoeken. Controleer de verbinding.");
    }
    this._searching = false;
  }

  private _selectProduct(product: Product): void {
    this._pendingProduct = product;
    this._stopCamera();
    this._dialogMode = "weight";
  }

  private async _handlePhotoCapture(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this._analyzing = true;

    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await this.hass.callWS<AnalyzePhotoResponse>({
        type: "voedingslog/analyze_photo",
        photo_b64: b64,
      });

      this._analyzing = false;
      if (res.product) {
        this._openManualWithPrefill(res.product);
      } else {
        alert("Kon voedingswaarden niet herkennen. Probeer een duidelijkere foto.");
      }
    } catch (err) {
      console.error("Photo analysis failed:", err);
      this._analyzing = false;
      alert("Fout bij analyseren foto: " + ((err as Error).message || err));
    }
  }

  private async _confirmLog(): Promise<void> {
    const p = this._pendingProduct;
    if (!p) return;

    const gramsInput = this.shadowRoot?.getElementById(
      "weight-input"
    ) as HTMLInputElement | null;
    const catSelect = this.shadowRoot?.getElementById(
      "category-select"
    ) as HTMLSelectElement | null;
    const dateInput = this.shadowRoot?.getElementById(
      "log-date-input"
    ) as HTMLInputElement | null;
    const grams = parseFloat(gramsInput?.value || "") || 100;
    const category = (catSelect?.value as MealCategory) || defaultCategory();
    const logDate = dateInput?.value || this._selectedDate;

    try {
      await this.hass.callWS({ type: "voedingslog/log_product",
        person: this._selectedPerson,
        name: p.name,
        grams,
        nutrients: p.nutrients || {},
        category,
        date: logDate,
      });
      // Switch to the date we logged to
      this._selectedDate = logDate;
      this._closeDialog();
      await this._loadLog();
    } catch (e) {
      console.error("Failed to log product:", e);
      alert("Fout bij opslaan.");
    }
  }

  private async _confirmEdit(): Promise<void> {
    const item = this._editingItem;
    if (!item) return;

    const gramsInput = this.shadowRoot?.getElementById(
      "edit-weight-input"
    ) as HTMLInputElement | null;
    const catSelect = this.shadowRoot?.getElementById(
      "edit-category-select"
    ) as HTMLSelectElement | null;
    const dateInput = this.shadowRoot?.getElementById(
      "edit-date-input"
    ) as HTMLInputElement | null;
    const grams = parseFloat(gramsInput?.value || "") || item.grams;
    const category = (catSelect?.value as MealCategory) || item.category;
    const newDate = dateInput?.value || this._selectedDate;

    try {
      if (newDate !== this._selectedDate) {
        // Moving to a different date: delete from old date, add to new date
        await this.hass.callWS({
          type: "voedingslog/delete_item",
          person: this._selectedPerson,
          index: item._index,
          date: this._selectedDate,
        });
        await this.hass.callWS({
          type: "voedingslog/log_product",
          person: this._selectedPerson,
          name: item.name,
          grams,
          nutrients: item.nutrients || {},
          category,
          date: newDate,
        });
      } else {
        await this.hass.callWS({
          type: "voedingslog/edit_item",
          person: this._selectedPerson,
          index: item._index,
          grams,
          category,
          date: this._selectedDate,
        });
      }
      this._closeDialog();
      await this._loadLog();
    } catch (e) {
      console.error("Failed to edit item:", e);
      alert("Fout bij bewerken.");
    }
  }

  private async _deleteItem(index: number): Promise<void> {
    const items = this._items;
    const item = items[index];
    const name = item?.name || "dit item";
    if (!confirm(`${name} verwijderen?`)) return;

    try {
      await this.hass.callWS({
        type: "voedingslog/delete_item",
        person: this._selectedPerson,
        index,
        date: this._selectedDate,
      });
      await this._loadLog();
    } catch (e) {
      console.error("Failed to delete item:", e);
    }
  }

  // ── Styles ───────────────────────────────────────────────────────

  static override styles = css`
    :host {
      --panel-padding: 16px;
      display: block;
      background: var(--primary-background-color);
      min-height: 100vh;
      font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
      color: var(--primary-text-color);
    }

    .panel {
      max-width: 600px;
      margin: 0 auto;
      padding-bottom: 24px;
    }

    /* Header */
    .header {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      padding: var(--panel-padding);
      padding-top: calc(var(--panel-padding) + env(safe-area-inset-top, 0px));
    }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .menu-btn {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 4px;
      margin-right: 8px;
      display: flex;
      align-items: center;
    }
    .menu-btn ha-icon {
      --mdc-icon-size: 24px;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
    }
    .date-nav {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 10px;
    }
    .date-nav-btn {
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: inherit;
      padding: 6px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .date-nav-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .date-nav-btn ha-icon {
      --mdc-icon-size: 22px;
    }
    .date-picker-btn {
      flex: 1;
      text-align: center;
      cursor: pointer;
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: inherit;
      border-radius: 8px;
      padding: 8px 12px;
      transition: background 0.2s;
    }
    .date-picker-btn:hover {
      background: rgba(255, 255, 255, 0.25);
    }
    .date-text {
      font-size: 15px;
      font-weight: 500;
    }
    .person-tabs {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }
    .person-tab {
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: inherit;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }
    .person-tab.active {
      background: rgba(255, 255, 255, 0.35);
      font-weight: 500;
    }

    .container {
      padding: var(--panel-padding);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* Actions */
    .actions {
      display: flex;
      gap: 8px;
    }
    .action-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 12px 8px;
      background: var(--card-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      color: var(--primary-color);
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }
    .action-btn:hover {
      background: var(--secondary-background-color);
    }
    .action-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .action-btn ha-icon {
      --mdc-icon-size: 24px;
    }

    /* Cards */
    .card {
      background: var(--card-background-color);
      border-radius: 12px;
      padding: 16px;
      border: 1px solid var(--divider-color);
    }

    /* Day totals */
    .totals-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .totals-title {
      font-weight: 500;
      font-size: 16px;
    }
    .totals-cal {
      font-size: 14px;
      color: var(--secondary-text-color);
    }
    .progress-bar {
      height: 8px;
      background: var(--divider-color);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 12px;
    }
    .progress-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }
    .macro-row {
      display: flex;
      justify-content: space-around;
    }
    .macro-item {
      text-align: center;
    }
    .macro-value {
      display: block;
      font-size: 16px;
      font-weight: 500;
    }
    .macro-label {
      display: block;
      font-size: 12px;
      color: var(--secondary-text-color);
    }

    /* Category sections */
    .category-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--divider-color);
    }
    .category-header ha-icon {
      --mdc-icon-size: 20px;
      color: var(--primary-color);
    }
    .category-title {
      font-weight: 500;
      flex: 1;
    }
    .category-cal {
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .empty-hint {
      font-size: 13px;
      color: var(--secondary-text-color);
      font-style: italic;
      padding: 4px 0;
    }

    /* Food items */
    .food-item {
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--divider-color);
    }
    .food-item:last-child {
      border-bottom: none;
    }
    .item-main {
      flex: 1;
      min-width: 0;
    }
    .item-name {
      display: block;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item-meta {
      display: block;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .item-kcal {
      font-size: 13px;
      white-space: nowrap;
      font-weight: 500;
    }
    .food-item {
      cursor: pointer;
      border-radius: 8px;
      margin: 0 -8px;
      padding: 8px;
      transition: background 0.15s;
    }
    .food-item:hover {
      background: var(--secondary-background-color);
    }
    .item-delete {
      background: none;
      border: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      display: flex;
    }
    .item-delete:hover {
      color: var(--error-color, #db4437);
    }
    .item-delete ha-icon {
      --mdc-icon-size: 18px;
    }

    /* Dialog overlay */
    .dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 100;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .dialog {
      background: var(--card-background-color);
      border-radius: 16px 16px 0 0;
      width: 100%;
      max-width: 600px;
      max-height: 85vh;
      overflow-y: auto;
      padding: 0;
    }
    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--divider-color);
    }
    .dialog-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
    }
    .close-btn {
      background: none;
      border: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      padding: 4px;
      display: flex;
    }
    .dialog-body {
      padding: 16px;
    }

    /* Barcode scanner */
    .scanner-area {
      min-height: 250px;
      background: #000;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .scanner-hint {
      color: #999;
      font-size: 14px;
    }
    .camera-preview {
      position: relative;
      margin-bottom: 12px;
    }
    #camera-video {
      width: 100%;
      border-radius: 8px;
      background: #000;
      max-height: 300px;
      object-fit: cover;
    }
    .camera-capture-btn {
      margin-top: 8px;
      width: 100%;
    }
    .manual-barcode {
      margin-top: 16px;
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .manual-barcode span {
      display: block;
      margin-bottom: 8px;
    }

    /* Input rows */
    .input-row {
      display: flex;
      gap: 8px;
    }
    .input-row input {
      flex: 1;
      padding: 10px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      font-size: 14px;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
    }
    .btn-primary {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      justify-content: center;
    }
    .btn-primary:hover {
      opacity: 0.9;
    }

    /* Search results */
    .search-results {
      margin-top: 12px;
      max-height: 300px;
      overflow-y: auto;
    }
    .search-result {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 8px;
      border-bottom: 1px solid var(--divider-color);
      cursor: pointer;
      border-radius: 8px;
    }
    .search-result:hover {
      background: var(--secondary-background-color);
    }
    .result-name {
      font-size: 14px;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-right: 8px;
    }
    .result-meta {
      font-size: 12px;
      color: var(--secondary-text-color);
      white-space: nowrap;
    }

    /* Photo */
    .photo-hint {
      font-size: 14px;
      color: var(--secondary-text-color);
      margin-bottom: 16px;
    }
    .photo-buttons {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .photo-btn {
      width: 100%;
      padding: 14px;
      font-size: 16px;
    }
    .btn-secondary {
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      border: 1px solid var(--divider-color);
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      justify-content: center;
    }
    .btn-secondary:hover {
      background: var(--divider-color);
    }
    .scanner-hint-text {
      font-size: 14px;
      color: var(--secondary-text-color);
      margin-bottom: 16px;
    }
    .barcode-photo-fallback {
      margin-bottom: 16px;
    }
    .analyzing {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px 0;
    }

    /* Weight dialog */
    .nutrient-preview {
      background: var(--primary-background-color);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
    }
    .preview-title {
      font-size: 13px;
      color: var(--secondary-text-color);
      margin-bottom: 8px;
    }
    .nutrient-grid {
      display: grid;
      gap: 4px;
    }
    .nutrient-row {
      display: flex;
      justify-content: space-between;
      font-size: 14px;
      padding: 2px 0;
    }
    .weight-section,
    .category-section-dialog,
    .date-section-dialog {
      margin-bottom: 16px;
    }
    .weight-section label,
    .category-section-dialog label,
    .date-section-dialog label {
      display: block;
      font-size: 13px;
      color: var(--secondary-text-color);
      margin-bottom: 6px;
    }
    .portion-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }
    .portion-chip {
      background: var(--secondary-background-color);
      border: 1px solid var(--divider-color);
      border-radius: 16px;
      padding: 4px 12px;
      font-size: 13px;
      cursor: pointer;
      color: var(--primary-text-color);
      transition: background 0.2s;
    }
    .portion-chip:hover {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      border-color: var(--primary-color);
    }
    .weight-section input,
    .category-section-dialog select,
    .date-section-dialog input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 8px;
      font-size: 16px;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
      box-sizing: border-box;
    }
    .btn-confirm {
      width: 100%;
      padding: 14px;
      font-size: 16px;
      margin-top: 8px;
    }

    /* Meals */
    .meal-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 0;
      border-bottom: 1px solid var(--divider-color);
    }
    .meal-item:last-of-type {
      border-bottom: none;
    }
    .meal-info {
      flex: 1;
      cursor: pointer;
      min-width: 0;
    }
    .meal-name {
      display: block;
      font-size: 15px;
      font-weight: 500;
    }
    .meal-meta {
      display: block;
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    .item-edit {
      background: none;
      border: none;
      color: var(--secondary-text-color);
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      display: flex;
    }
    .item-edit:hover {
      color: var(--primary-color);
    }
    .item-edit ha-icon {
      --mdc-icon-size: 18px;
    }
    .section-label {
      display: block;
      font-size: 13px;
      color: var(--secondary-text-color);
      margin-bottom: 8px;
      font-weight: 500;
    }
    .meal-ingredients-section {
      margin-bottom: 16px;
    }
    .ingredient-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid var(--divider-color);
    }
    .ingredient-name {
      flex: 1;
      font-size: 14px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ingredient-grams-input {
      width: 65px;
      padding: 4px 8px;
      border: 1px solid var(--divider-color);
      border-radius: 6px;
      font-size: 14px;
      text-align: right;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
    }
    .ingredient-unit {
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .search-online-btn {
      width: 100%;
      margin-top: 8px;
    }
    .search-loading {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 0;
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .manual-hint {
      font-size: 13px;
      color: var(--secondary-text-color);
      margin-bottom: 8px;
    }
    .manual-fields {
      display: grid;
      gap: 8px;
      margin-bottom: 16px;
    }
    .manual-field-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .manual-field-row label {
      font-size: 14px;
      flex: 1;
    }
    .manual-field-row input {
      width: 80px;
      padding: 6px 8px;
      border: 1px solid var(--divider-color);
      border-radius: 6px;
      font-size: 14px;
      text-align: right;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
    }
    .add-ingredient {
      margin-top: 12px;
    }
  `;
}
