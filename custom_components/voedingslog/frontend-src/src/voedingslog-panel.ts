import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Html5Qrcode } from "html5-qrcode";
import type {
  HomeAssistant,
  MealCategory,
  LogItem,
  IndexedLogItem,
  Product,
  Portion,
  VoedingslogConfig,
  GetLogResponse,
  GetFavoritesResponse,
  LookupBarcodeResponse,
  SearchProductsResponse,
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
import { panelStyles } from "./styles.js";
import { AiController } from "./mixins/ai-mixin.js";
import { MealsController } from "./controllers/meals-controller.js";
import { ExportController } from "./controllers/export-controller.js";
import { renderPhotoPicker, captureVideoFrame, readFileAsBase64 } from "./photo-capture.js";

@customElement("voedingslog-panel")
export class VoedingslogPanel extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @property({ type: Boolean }) narrow = false;
  @property({ attribute: false }) panel?: Record<string, unknown>;

  @state() _config: VoedingslogConfig | null = null;
  @state() _selectedPerson: string | null = null;
  @state() _selectedDate: string = new Date().toISOString().split("T")[0];
  @state() _items: LogItem[] = [];
  @state() private _loading = true;

  @state() _dialogMode: DialogMode = null;
  @state() private _pendingProduct: Product | null = null;
  @state() private _searchResults: Product[] = [];
  @state() private _searchQuery = "";
  @state() private _scanning = false;
  @state() private _scanFailed = false;
  @state() _photoCameraActive = false;
  @state() private _prefillProduct: Product | null = null;
  @state() _analyzing = false;
  @state() _searching = false;
  @state() private _searchSource: "local" | "online" = "local";
  @state() private _editingItem: IndexedLogItem | null = null;
  @state() private _favorites: Product[] = [];

  private _ai = new AiController(this);
  private _meals = new MealsController(this);
  private _export = new ExportController(this);

  private _html5Qrcode: Html5Qrcode | null = null;
  private _scannerContainerId = "vl-barcode-reader";
  private _positionFrame: number | null = null;

  // ── Lifecycle ────────────────────────────────────────────────────

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    await this._loadConfig();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopCamera();
    this._cleanupScannerContainer();
  }

  private _autoSelectPerson(): void {
    if (!this._config?.persons?.length) return;
    if (this._selectedPerson && this._config.persons.includes(this._selectedPerson)) return;

    // Try to match HA user name to a configured person
    const haUser = this.hass?.user?.name?.toLowerCase() || "";
    if (haUser) {
      const match = this._config.persons.find(
        (p) => p.toLowerCase() === haUser || haUser.includes(p.toLowerCase()) || p.toLowerCase().includes(haUser)
      );
      if (match) {
        this._selectedPerson = match;
        return;
      }
    }
    this._selectedPerson = this._config.persons[0];
  }

  _getCaloriesGoal(): number {
    const pg = this._config?.person_goals?.[this._selectedPerson || ""];
    return pg?.calories_goal ?? this._config?.calories_goal ?? 2000;
  }

  _getMacroGoals(): { carbs: number; protein: number; fat: number; fiber: number } {
    const pg = this._config?.person_goals?.[this._selectedPerson || ""];
    return pg?.macro_goals ?? this._config?.macro_goals ?? { carbs: 0, protein: 0, fat: 0, fiber: 0 };
  }

  private async _loadConfig(): Promise<void> {
    try {
      this._config = await this.hass.callWS<VoedingslogConfig>({
        type: "voedingslog/get_config",
      });
      this._autoSelectPerson();
      await this._loadLog();
    } catch (e) {
      console.error("Failed to load voedingslog config:", e);
      this._loading = false;
    }
  }

  async _loadLog(): Promise<void> {
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

  render(): TemplateResult {
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

  _formatDateLabel(dateStr: string): string {
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
      </div>
    `;
  }

  private _renderActions(): TemplateResult {
    return html`
      <div class="actions">
        <button class="action-btn action-btn-primary" @click=${() => { this._dialogMode = "add-chooser"; }}>
          <ha-icon icon="mdi:plus"></ha-icon>
          <span>Toevoegen</span>
        </button>
        <button class="action-btn" @click=${() => this._meals.loadMeals()}>
          <ha-icon icon="mdi:pot-steam"></ha-icon>
          <span>Maaltijden</span>
        </button>
      </div>
    `;
  }

  private _renderDayTotals(): TemplateResult {
    const totals = sumNutrients(this._items);
    const goal = this._getCaloriesGoal();
    const kcal = totals["energy-kcal_100g"] || 0;
    const pct = Math.min(100, Math.round((kcal / goal) * 100));

    return html`
      <div class="day-totals card" @click=${() => { this._dialogMode = "day-detail"; }} style="cursor:pointer">
        <div class="totals-header">
          <span class="totals-title">Dagtotaal</span>
          <span class="totals-cal">${Math.round(kcal)} / ${goal} kcal</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${pct}%; background: ${pct > 100 ? "var(--error-color, #db4437)" : "var(--primary-color)"}"></div>
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
          ${this._dialogMode === "add-chooser" ? this._renderAddChooser() : nothing}
          ${this._dialogMode === "barcode" ? this._renderBarcodeDialog() : nothing}
          ${this._dialogMode === "search" ? this._renderSearchDialog() : nothing}
          ${this._dialogMode === "photo" ? this._renderPhotoDialog() : nothing}
          ${this._dialogMode === "weight" ? this._renderWeightDialog() : nothing}
          ${this._dialogMode === "edit" ? this._renderEditDialog() : nothing}
          ${this._dialogMode === "meals" ? this._meals.renderMealsDialog() : nothing}
          ${this._dialogMode === "meal-edit" ? this._meals.renderEditDialog() : nothing}
          ${this._dialogMode === "manual" ? this._renderManualEntryDialog() : nothing}
          ${this._dialogMode === "day-detail" ? this._export.renderDayDetailDialog() : nothing}
          ${this._dialogMode === "ai-text" ? this._ai.renderTextDialog() : nothing}
          ${this._dialogMode === "ai-handwriting" ? this._ai.renderHandwritingDialog() : nothing}
          ${this._dialogMode === "ai-validate" ? this._ai.renderValidateDialog() : nothing}
          ${this._dialogMode === "meal-ai-text" ? this._ai.renderMealTextDialog() : nothing}
        </div>
      </div>
    `;
  }



  private _renderAddChooser(): TemplateResult {
    const hasAI = !!this._config?.ai_task_entity;
    return html`
      <div class="dialog-header">
        <h2>Toevoegen voor ${this._selectedPerson}</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="chooser-grid">
          <button class="chooser-item" @click=${() => this._openBarcodeScanner()}>
            <ha-icon icon="mdi:barcode-scan"></ha-icon>
            <span>Scan barcode</span>
          </button>
          <button class="chooser-item" @click=${() => this._openSearch()}>
            <ha-icon icon="mdi:magnify"></ha-icon>
            <span>Zoek product</span>
          </button>
          <button class="chooser-item" @click=${() => this._openPhotoCapture()} ?disabled=${!hasAI}>
            <ha-icon icon="mdi:camera"></ha-icon>
            <span>Foto etiket</span>
          </button>
          <button class="chooser-item" @click=${() => { this._prefillProduct = null; this._dialogMode = "manual"; }}>
            <ha-icon icon="mdi:pencil-plus"></ha-icon>
            <span>Handmatig</span>
          </button>
          <button class="chooser-item" @click=${() => { this._dialogMode = "ai-text"; }} ?disabled=${!hasAI}>
            <ha-icon icon="mdi:text-box-outline"></ha-icon>
            <span>AI tekst</span>
          </button>
          <button class="chooser-item" @click=${() => { this._dialogMode = "ai-handwriting"; }} ?disabled=${!hasAI}>
            <ha-icon icon="mdi:note-text-outline"></ha-icon>
            <span>Handgeschreven lijst</span>
          </button>
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

  private _renderSearchResult(p: Product, showFavToggle = false): TemplateResult {
    return html`
      <div class="search-result">
        <div class="search-result-main" @click=${() => this._selectProduct(p)}>
          <span class="result-name">${p.name}</span>
          <span class="result-meta">${Math.round(p.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g</span>
        </div>
        ${showFavToggle
          ? html`<button class="fav-btn" @click=${(e: Event) => { e.stopPropagation(); this._toggleFavorite(p); }}>
              <ha-icon icon=${p.favorite ? "mdi:star" : "mdi:star-outline"}></ha-icon>
            </button>`
          : nothing}
      </div>
    `;
  }

  private _renderSearchDialog(): TemplateResult {
    const showFavorites = !this._searchQuery.trim() && this._favorites.length > 0;
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
        ${showFavorites
          ? html`
            <div class="favorites-section">
              <div class="section-label"><ha-icon icon="mdi:star" style="--mdc-icon-size:16px;vertical-align:middle;color:#ff9800"></ha-icon> Favorieten</div>
              ${this._favorites.map((p) => this._renderSearchResult(p, true))}
            </div>
          `
          : nothing}
        <div class="search-results">
          ${this._searchResults.map((p) => this._renderSearchResult(p, true))}
        </div>
        ${this._searchSource === "local" && this._searchQuery.trim()
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
        ${renderPhotoPicker(
          this,
          "file-input-photo",
          (e: Event) => this._handlePhotoCapture(e),
          () => this._capturePhotoFrame(),
          "Maak een foto van het voedingsetiket op de verpakking.",
        )}
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

        <div class="form-field">
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

        <div class="form-field">
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

        <div class="form-field">
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
        <div class="form-field">
          <label>Naam</label>
          <input type="text" id="edit-name-input" .value=${item.name} />
        </div>

        <div class="form-field">
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

        <div class="form-field">
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

        <div class="form-field">
          <label>Datum</label>
          <input
            type="date"
            id="edit-date-input"
            .value=${this._selectedDate}
          />
        </div>

        <div class="nutrient-edit-section">
          <div class="preview-title">Voedingswaarden per 100g</div>
          ${Object.entries(this._config?.nutrients || {}).map(
            ([key, meta]) => html`
              <div class="form-field form-field-inline">
                <label>${meta.label} (${meta.unit})</label>
                <input
                  type="number"
                  id="edit-nutrient-${key}"
                  .value=${String((item.nutrients?.[key] || 0).toFixed(2))}
                  min="0"
                  step="0.01"
                  inputmode="decimal"
                />
              </div>
            `
          )}
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

  private async _openSearch(): Promise<void> {
    this._dialogMode = "search";
    this._searchResults = [];
    this._searchQuery = "";
    this._searchSource = "local";
    try {
      const res = await this.hass.callWS<GetFavoritesResponse>({ type: "voedingslog/get_favorites" });
      this._favorites = res.products || [];
    } catch {
      this._favorites = [];
    }
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

  private _photoCameraContainerId = "vl-photo-camera";
  private _photoHtml5Qrcode: Html5Qrcode | null = null;
  private _photoPosFrame: number | null = null;

  private _trackPhotoCameraPosition(): void {
    const container = document.getElementById(this._photoCameraContainerId);
    const placeholder = this.shadowRoot?.getElementById("photo-camera-placeholder");
    if (!container || !placeholder) return;
    const rect = placeholder.getBoundingClientRect();
    container.style.cssText = `
      position:fixed; top:${rect.top}px; left:${rect.left}px;
      width:${rect.width}px; height:${Math.max(rect.height, 250)}px;
      z-index:101; border-radius:8px; overflow:hidden;
    `;
    this._photoPosFrame = requestAnimationFrame(() => this._trackPhotoCameraPosition());
  }

  async _startPhotoCamera(): Promise<void> {
    try {
      this._cleanupPhotoCameraContainer();
      // Set active first so the placeholder renders
      this._photoCameraActive = true;
      await this.updateComplete;

      const container = document.createElement("div");
      container.id = this._photoCameraContainerId;
      document.body.appendChild(container);

      const placeholder = this.shadowRoot?.getElementById("photo-camera-placeholder");
      if (placeholder) placeholder.style.minHeight = "250px";
      this._trackPhotoCameraPosition();

      this._photoHtml5Qrcode = new Html5Qrcode(this._photoCameraContainerId);
      await this._photoHtml5Qrcode.start(
        { facingMode: "environment" },
        { fps: 2, qrbox: { width: 9999, height: 9999 } },
        () => {},
        () => {}
      );
    } catch (e) {
      console.warn("Photo camera failed:", e);
      this._photoCameraActive = false;
      this._cleanupPhotoCameraContainer();
      alert("Camera niet beschikbaar. Gebruik 'Kies afbeelding'.");
    }
  }

  private _cleanupPhotoCameraContainer(): void {
    if (this._photoPosFrame) {
      cancelAnimationFrame(this._photoPosFrame);
      this._photoPosFrame = null;
    }
    const existing = document.getElementById(this._photoCameraContainerId);
    if (existing) existing.remove();
  }

  private async _capturePhotoFrame(): Promise<void> {
    const b64 = captureVideoFrame();
    if (!b64) return;
    this._stopPhotoCamera();
    await this._analyzePhotoB64(b64);
  }

  private async _analyzePhotoB64(b64: string): Promise<void> {
    this._analyzing = true;
    try {
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

  _stopPhotoCamera(): void {
    this._photoCameraActive = false;
    if (this._photoHtml5Qrcode) {
      this._photoHtml5Qrcode.stop().catch(() => {}).finally(() => {
        this._photoHtml5Qrcode = null;
        this._cleanupPhotoCameraContainer();
      });
    } else {
      this._cleanupPhotoCameraContainer();
    }
  }


  _addMealIngredientFromAi(ingredient: import("./types.js").MealIngredient): void {
    this._meals.addIngredientFromAi(ingredient);
  }

  _selectProduct(product: Product): void {
    this._pendingProduct = product;
    this._stopCamera();
    this._dialogMode = "weight";
  }

  _closeDialog(): void {
    this._stopCamera();
    this._stopPhotoCamera();
    this._dialogMode = null;
    this._pendingProduct = null;
    this._editingItem = null;
    this._searchResults = [];
    this._analyzing = false;
    this._scanning = false;
    this._scanFailed = false;
    this._prefillProduct = null;
    this._meals.reset();
    this._export.reset();
    this._ai.reset();
  }

  _setDialogMode(mode: string): void {
    this._dialogMode = mode as DialogMode;
  }

  _openFileInput(id: string): void {
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

  private async _toggleFavorite(product: Product): Promise<void> {
    try {
      const res = await this.hass.callWS<{ favorite: boolean }>({
        type: "voedingslog/toggle_favorite",
        product_name: product.name,
      });
      product.favorite = res.favorite;
      // Update favorites list
      if (res.favorite) {
        if (!this._favorites.find((f) => f.name === product.name)) {
          this._favorites = [...this._favorites, product];
        }
      } else {
        this._favorites = this._favorites.filter((f) => f.name !== product.name);
      }
      this.requestUpdate();
    } catch (e) {
      console.error("Failed to toggle favorite:", e);
    }
  }


  private async _handlePhotoCapture(e: Event): Promise<void> {
    const b64 = await readFileAsBase64(e);
    if (!b64) return;
    await this._analyzePhotoB64(b64);
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

    const nameInput = this.shadowRoot?.getElementById("edit-name-input") as HTMLInputElement | null;
    const gramsInput = this.shadowRoot?.getElementById("edit-weight-input") as HTMLInputElement | null;
    const catSelect = this.shadowRoot?.getElementById("edit-category-select") as HTMLSelectElement | null;
    const dateInput = this.shadowRoot?.getElementById("edit-date-input") as HTMLInputElement | null;

    const name = nameInput?.value || item.name;
    const grams = parseFloat(gramsInput?.value || "") || item.grams;
    const category = (catSelect?.value as MealCategory) || item.category;
    const newDate = dateInput?.value || this._selectedDate;

    // Read nutrient inputs
    const nutrients: Record<string, number> = { ...item.nutrients };
    for (const key of Object.keys(this._config?.nutrients || {})) {
      const input = this.shadowRoot?.getElementById(`edit-nutrient-${key}`) as HTMLInputElement | null;
      if (input) {
        nutrients[key] = parseFloat(input.value) || 0;
      }
    }

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
          name,
          grams,
          nutrients,
          category,
          date: newDate,
        });
      } else {
        await this.hass.callWS({
          type: "voedingslog/edit_item",
          person: this._selectedPerson,
          index: item._index,
          name,
          grams,
          nutrients,
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

  static styles = panelStyles;
}
