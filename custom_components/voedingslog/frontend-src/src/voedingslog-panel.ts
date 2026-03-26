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
  CustomMeal,
  MealIngredient,
  VoedingslogConfig,
  GetLogResponse,
  GetMealsResponse,
  GetFavoritesResponse,
  LookupBarcodeResponse,
  SearchProductsResponse,
  SaveMealResponse,
  AnalyzePhotoResponse,
  ParsedProduct,
  ParseFoodResponse,
  DialogMode,
} from "./types.js";
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_LABELS,
  KEY_NUTRIENTS_DISPLAY,
  defaultCategory,
  groupByCategory,
  calcItemNutrients,
  itemKcal,
  sumNutrients,
  NUTRIENTS_META,
} from "./helpers.js";
import { panelStyles } from "./styles.js";

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
  @state() private _favorites: Product[] = [];
  @state() private _exportImageUrl: string | null = null;
  @state() private _aiParsedProducts: ParsedProduct[] = [];
  @state() private _aiValidateIndex = 0;
  @state() private _aiValidateSearch = "";
  @state() private _aiValidateSearchResults: Product[] = [];

  private _html5Qrcode: Html5Qrcode | null = null;
  private _scannerContainerId = "vl-barcode-reader";
  private _positionFrame: number | null = null;

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

  private _getCaloriesGoal(): number {
    const pg = this._config?.person_goals?.[this._selectedPerson || ""];
    return pg?.calories_goal ?? this._config?.calories_goal ?? 2000;
  }

  private _getMacroGoals(): { carbs: number; protein: number; fat: number; fiber: number } {
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
        <button class="action-btn" @click=${() => this._openMeals()}>
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
          ${this._dialogMode === "meals" ? this._renderMealsDialog() : nothing}
          ${this._dialogMode === "meal-edit" ? this._renderMealEditDialog() : nothing}
          ${this._dialogMode === "manual" ? this._renderManualEntryDialog() : nothing}
          ${this._dialogMode === "day-detail" ? this._renderDayDetailDialog() : nothing}
          ${this._dialogMode === "ai-text" ? this._renderAiTextDialog() : nothing}
          ${this._dialogMode === "ai-handwriting" ? this._renderAiHandwritingDialog() : nothing}
          ${this._dialogMode === "ai-validate" ? this._renderAiValidateDialog() : nothing}
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

  private _renderDayDetailDialog(): TemplateResult {
    const totals = sumNutrients(this._items);
    const mg = this._getMacroGoals();
    const goal = this._getCaloriesGoal();
    const kcal = totals["energy-kcal_100g"] || 0;
    const protein = totals["proteins_100g"] || 0;
    const carbs = totals["carbohydrates_100g"] || 0;
    const fat = totals["fat_100g"] || 0;
    const fiber = totals["fiber_100g"] || 0;
    const macroTotal = protein + carbs + fat + fiber;

    const pctProtein = macroTotal > 0 ? Math.round(protein / macroTotal * 100) : 0;
    const pctCarbs = macroTotal > 0 ? Math.round(carbs / macroTotal * 100) : 0;
    const pctFat = macroTotal > 0 ? Math.round(fat / macroTotal * 100) : 0;
    const pctFiber = macroTotal > 0 ? 100 - pctProtein - pctCarbs - pctFat : 0;

    let gradientStops = "";
    let angle = 0;
    const slices = [
      { pct: pctCarbs, color: "var(--primary-color, #03a9f4)", label: "Koolhydraten", grams: carbs, goal: mg.carbs },
      { pct: pctProtein, color: "#4caf50", label: "Eiwitten", grams: protein, goal: mg.protein },
      { pct: pctFat, color: "#ff9800", label: "Vetten", grams: fat, goal: mg.fat },
      { pct: pctFiber, color: "#8bc34a", label: "Vezels", grams: fiber, goal: mg.fiber },
    ];
    for (const s of slices) {
      const end = angle + s.pct;
      gradientStops += `${s.color} ${angle}% ${end}%, `;
      angle = end;
    }
    gradientStops = gradientStops.replace(/, $/, "");

    return html`
      <div class="dialog-header">
        <h2>Dagdetails — ${this._formatDateLabel(this._selectedDate)}</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="pie-section">
          <div class="pie-chart"
            style="background: conic-gradient(${gradientStops || "#eee 0% 100%"})">
            <div class="pie-center">
              <span class="pie-kcal">${Math.round(kcal)}</span>
              <span class="pie-unit">/ ${goal} kcal</span>
            </div>
          </div>
          <div class="pie-legend">
            ${slices.map(
              (s) => {
                const goalPct = s.goal > 0 ? Math.min(100, Math.round(s.grams / s.goal * 100)) : -1;
                return html`
                  <div class="legend-item">
                    <span class="legend-dot" style="background:${s.color}"></span>
                    <div class="legend-info">
                      <div class="legend-top">
                        <span class="legend-label">${s.label}</span>
                        <span class="legend-value">
                          ${s.grams.toFixed(1)}g${s.goal > 0 ? html` / ${s.goal}g` : nothing} (${s.pct}%)
                        </span>
                      </div>
                      ${goalPct >= 0 ? html`
                        <div class="macro-bar">
                          <div class="macro-bar-fill" style="width:${goalPct}%; background:${s.color}"></div>
                        </div>
                      ` : nothing}
                    </div>
                  </div>
                `;
              }
            )}
          </div>
        </div>

        <div class="detail-table">
          <div class="detail-table-header">Alle voedingswaarden</div>
          ${Object.entries(this._config?.nutrients || {}).map(
            ([key, meta]) => {
              const raw = totals[key] || 0;
              const factor = (NUTRIENTS_META as Record<string, number>)[key] || 1;
              const value = raw * factor;
              return html`
                <div class="detail-row">
                  <span>${meta.label}</span>
                  <span>${value.toFixed(1)} ${meta.unit}</span>
                </div>
              `;
            }
          )}
        </div>

        <div style="margin-top:12px">
          <div class="detail-table-header">Gelogde items (${this._items.length})</div>
          ${this._items.map(
            (item) => {
              const kcalVal = itemKcal(item);
              return html`
                <div class="detail-row">
                  <span>${item.name}</span>
                  <span>${item.grams}g · ${Math.round(kcalVal)} kcal</span>
                </div>
              `;
            }
          )}
        </div>

        ${this._exportImageUrl
          ? html`
            <div class="export-preview">
              <img src=${this._exportImageUrl} alt="Voedingslog export"
                style="width:100%;border-radius:8px;border:1px solid var(--divider-color);margin-top:8px;" />
              <div class="export-actions">
                <button class="btn-primary btn-confirm" @click=${() => this._downloadExportImage()}>
                  <ha-icon icon="mdi:download"></ha-icon>
                  Download
                </button>
                ${(navigator as any).share ? html`
                  <button class="btn-secondary btn-confirm" @click=${() => this._shareExportImage()}>
                    <ha-icon icon="mdi:share-variant"></ha-icon>
                    Delen
                  </button>
                ` : nothing}
              </div>
            </div>
          `
          : html`
            <button class="btn-secondary btn-confirm" @click=${() => this._exportDayImage(slices)}>
              <ha-icon icon="mdi:download"></ha-icon>
              Exporteer als afbeelding
            </button>
          `}
      </div>
    `;
  }

  private _exportDayImage(slices: { pct: number; color: string; label: string; grams: number; goal: number }[]): void {
    const totals = sumNutrients(this._items);
    const goal = this._getCaloriesGoal();
    const kcal = totals["energy-kcal_100g"] || 0;
    const person = this._selectedPerson || "";
    const dateLabel = this._formatDateLabel(this._selectedDate);

    const dpr = window.devicePixelRatio || 1;
    const W = 600;
    const canvas = document.createElement("canvas");
    const items = this._items;
    const rowH = 28;
    const nutrientEntries = Object.entries(this._config?.nutrients || {});
    const canvasH = 420 + nutrientEntries.length * rowH + items.length * rowH + 80;
    canvas.width = W * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = canvasH + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, canvasH);

    // Header
    ctx.fillStyle = "#1976d2";
    ctx.fillRect(0, 0, W, 60);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(`Voedingslog — ${person}`, 20, 28);
    ctx.font = "14px sans-serif";
    ctx.fillText(dateLabel + "  ·  " + Math.round(kcal) + " / " + goal + " kcal", 20, 48);

    // Pie chart
    const cx = 100, cy = 150, r = 70;
    let startAngle = -Math.PI / 2;
    const pieColors = slices.map((s) => s.color.replace(/var\(--primary-color,?\s?/g, "").replace(")", "") || "#03a9f4");
    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      const sliceAngle = (slice.pct / 100) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fillStyle = pieColors[i];
      ctx.fill();
      startAngle += sliceAngle;
    }
    // Center circle
    ctx.beginPath();
    ctx.arc(cx, cy, 40, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.fillStyle = "#333";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(Math.round(kcal)), cx, cy + 2);
    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#888";
    ctx.fillText("kcal", cx, cy + 16);
    ctx.textAlign = "left";

    // Legend
    let ly = 95;
    for (let i = 0; i < slices.length; i++) {
      const s = slices[i];
      ctx.fillStyle = pieColors[i];
      ctx.beginPath();
      ctx.arc(210, ly + 6, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#333";
      ctx.font = "14px sans-serif";
      ctx.fillText(s.label, 224, ly + 10);
      ctx.fillStyle = "#888";
      ctx.font = "13px sans-serif";
      const goalText = s.goal > 0 ? ` / ${s.goal}g` : "";
      ctx.fillText(`${s.grams.toFixed(1)}g${goalText} (${s.pct}%)`, 224, ly + 26);
      // Progress bar
      if (s.goal > 0) {
        const barX = 224, barY = ly + 32, barW = 340, barH = 4;
        ctx.fillStyle = "#eee";
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = pieColors[i];
        ctx.fillRect(barX, barY, Math.min(barW, barW * s.grams / s.goal), barH);
        ly += 44;
      } else {
        ly += 34;
      }
    }

    // Nutrient table
    let y = Math.max(ly + 20, 240);
    ctx.fillStyle = "#333";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("Alle voedingswaarden", 20, y);
    y += 8;
    ctx.font = "13px sans-serif";
    for (const [key, meta] of nutrientEntries) {
      const raw = totals[key] || 0;
      const factor = (NUTRIENTS_META as Record<string, number>)[key] || 1;
      const value = raw * factor;
      y += rowH;
      ctx.fillStyle = "#333";
      ctx.fillText(meta.label, 20, y);
      ctx.fillStyle = "#888";
      ctx.textAlign = "right";
      ctx.fillText(`${value.toFixed(1)} ${meta.unit}`, W - 20, y);
      ctx.textAlign = "left";
      // Divider
      ctx.strokeStyle = "#eee";
      ctx.beginPath();
      ctx.moveTo(20, y + 8);
      ctx.lineTo(W - 20, y + 8);
      ctx.stroke();
    }

    // Items
    y += 30;
    ctx.fillStyle = "#333";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(`Gelogde items (${items.length})`, 20, y);
    y += 8;
    ctx.font = "13px sans-serif";
    for (const item of items) {
      const kcalVal = itemKcal(item);
      y += rowH;
      ctx.fillStyle = "#333";
      const name = item.name.length > 40 ? item.name.substring(0, 37) + "..." : item.name;
      ctx.fillText(name, 20, y);
      ctx.fillStyle = "#888";
      ctx.textAlign = "right";
      ctx.fillText(`${item.grams}g · ${Math.round(kcalVal)} kcal`, W - 20, y);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#eee";
      ctx.beginPath();
      ctx.moveTo(20, y + 8);
      ctx.lineTo(W - 20, y + 8);
      ctx.stroke();
    }

    // Show inline for long-press save / share
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const dataUrl = canvas.toDataURL("image/png");
      this._exportImageUrl = dataUrl;
      this.requestUpdate();
    }, "image/png");
  }

  private _downloadExportImage(): void {
    if (!this._exportImageUrl) return;
    const a = document.createElement("a");
    a.href = this._exportImageUrl;
    a.download = `voedingslog-${this._selectedPerson}-${this._selectedDate}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  private async _shareExportImage(): Promise<void> {
    if (!this._exportImageUrl) return;
    try {
      const res = await fetch(this._exportImageUrl);
      const blob = await res.blob();
      const file = new File([blob], `voedingslog-${this._selectedPerson}-${this._selectedDate}.png`, { type: "image/png" });
      await navigator.share({ files: [file] });
    } catch (e) {
      // User cancelled or share not supported — fall back to download
      this._downloadExportImage();
    }
  }

  // ── AI text / handwriting dialogs ─────────────────────────────

  private _renderAiTextDialog(): TemplateResult {
    return html`
      <div class="dialog-header">
        <h2>AI tekst invoer</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <p style="font-size:13px;color:var(--secondary-text-color);margin-top:0">
          Beschrijf wat je gegeten hebt. AI herkent de producten en zoekt voedingswaarden op.
        </p>
        <textarea
          id="ai-text-input"
          class="ai-textarea"
          placeholder="Bijv. 2 boterhammen met kaas, een appel, kop koffie met melk"
        ></textarea>
        ${this._analyzing
          ? html`<div class="analyzing"><ha-icon icon="mdi:loading" class="spin"></ha-icon> Bezig met analyseren...</div>`
          : html`
            <button class="btn-primary btn-confirm" @click=${() => this._submitAiText()}>
              <ha-icon icon="mdi:auto-fix"></ha-icon>
              Analyseren
            </button>
          `}
      </div>
    `;
  }

  private _renderAiHandwritingDialog(): TemplateResult {
    return html`
      <div class="dialog-header">
        <h2>Handgeschreven lijst</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <p style="font-size:13px;color:var(--secondary-text-color);margin-top:0">
          Maak een foto van je handgeschreven lijst. AI leest de tekst en zoekt producten op.
        </p>
        <input type="file" accept="image/*"
          id="file-input-handwriting"
          @change=${(e: Event) => this._handleHandwritingPhoto(e)} style="display:none" />
        ${this._analyzing
          ? html`<div class="analyzing"><ha-icon icon="mdi:loading" class="spin"></ha-icon> Bezig met analyseren...</div>`
          : html`
            <button class="btn-primary photo-btn" @click=${() => this._openFileInput("file-input-handwriting")}>
              <ha-icon icon="mdi:camera"></ha-icon>
              Foto maken of kiezen
            </button>
          `}
      </div>
    `;
  }

  private _renderAiValidateDialog(): TemplateResult | typeof nothing {
    const products = this._aiParsedProducts;
    if (!products.length) return nothing;
    const idx = this._aiValidateIndex;
    if (idx >= products.length) {
      // All done
      return html`
        <div class="dialog-header">
          <h2>Klaar!</h2>
          <button class="close-btn" @click=${() => this._closeDialog()}>
            <ha-icon icon="mdi:close"></ha-icon>
          </button>
        </div>
        <div class="dialog-body">
          <p>Alle producten zijn verwerkt.</p>
          <button class="btn-primary btn-confirm" @click=${() => { this._closeDialog(); this._loadLog(); }}>
            Sluiten
          </button>
        </div>
      `;
    }

    const product = products[idx];
    const pct = Math.round(((idx) / products.length) * 100);

    return html`
      <div class="dialog-header">
        <h2>Product ${idx + 1} van ${products.length}</h2>
        <button class="close-btn" @click=${() => this._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="ai-validate-progress">
          <div class="ai-validate-bar">
            <div class="ai-validate-fill" style="width:${pct}%"></div>
          </div>
          <span>${idx + 1}/${products.length}</span>
        </div>

        <div class="ai-context">AI herkende: <strong>${product.ai_name || product.name}</strong></div>

        ${!product.matched
          ? html`<div class="ai-warning">Niet gevonden in database — zoek een product of sla over</div>`
          : nothing}

        <div class="ai-validate-search">
          <input
            type="text"
            placeholder="Zoek ander product..."
            .value=${this._aiValidateSearch}
            @input=${(e: Event) => { this._aiValidateSearch = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this._searchAiValidate(); }}
          />
          <div style="display:flex;gap:4px;margin-top:4px">
            <button class="btn-secondary" style="flex:1;padding:6px;font-size:13px" @click=${() => this._searchAiValidate()}>
              Zoek lokaal
            </button>
            <button class="btn-secondary" style="flex:1;padding:6px;font-size:13px" @click=${() => this._searchAiValidate(true)}>
              Zoek online
            </button>
          </div>
          ${this._aiValidateSearchResults.length > 0
            ? html`
              <div class="search-results">
                ${this._aiValidateSearchResults.map(
                  (r) => html`
                    <div class="search-result">
                      <div class="search-result-main" @click=${() => this._selectAiValidateProduct(r)}>
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

        <div class="form-field">
          <label>Maaltijd</label>
          <select id="ai-validate-category">
            ${(["breakfast", "lunch", "dinner", "snack"] as MealCategory[]).map(
              (cat) => html`
                <option value=${cat} ?selected=${cat === defaultCategory()}>
                  ${(this._config?.category_labels || DEFAULT_CATEGORY_LABELS)[cat]}
                </option>
              `
            )}
          </select>
        </div>

        <div class="ai-validate-actions">
          <button class="btn-secondary btn-confirm" @click=${() => this._skipAiProduct()}>
            Overslaan
          </button>
          <button class="btn-primary btn-confirm" @click=${() => this._confirmAiProduct()} ?disabled=${!product.matched}>
            Bevestigen
          </button>
        </div>
      </div>
    `;
  }

  private async _submitAiText(): Promise<void> {
    const textarea = this.shadowRoot?.getElementById("ai-text-input") as HTMLTextAreaElement | null;
    const text = textarea?.value?.trim();
    if (!text) { alert("Voer tekst in."); return; }

    this._analyzing = true;
    try {
      const res = await this.hass.callWS<ParseFoodResponse>({ type: "voedingslog/parse_text", text });
      this._analyzing = false;
      if (res.products?.length) {
        this._aiParsedProducts = res.products;
        this._aiValidateIndex = 0;
        this._aiValidateSearch = "";
        this._aiValidateSearchResults = [];
        this._dialogMode = "ai-validate";
      } else {
        alert("Geen producten herkend. Probeer het opnieuw met meer detail.");
      }
    } catch (err) {
      this._analyzing = false;
      console.error("AI text parsing failed:", err);
      alert("Fout bij analyseren: " + ((err as Error).message || err));
    }
  }

  private async _handleHandwritingPhoto(e: Event): Promise<void> {
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

      const res = await this.hass.callWS<ParseFoodResponse>({ type: "voedingslog/parse_handwriting", photo_b64: b64 });
      this._analyzing = false;
      if (res.products?.length) {
        this._aiParsedProducts = res.products;
        this._aiValidateIndex = 0;
        this._aiValidateSearch = "";
        this._aiValidateSearchResults = [];
        this._dialogMode = "ai-validate";
      } else {
        alert("Geen producten herkend. Probeer een duidelijkere foto.");
      }
    } catch (err) {
      this._analyzing = false;
      console.error("AI handwriting parsing failed:", err);
      alert("Fout bij analyseren: " + ((err as Error).message || err));
    }
  }

  private async _searchAiValidate(online = false): Promise<void> {
    const query = this._aiValidateSearch.trim();
    if (!query) return;
    try {
      const res = await this.hass.callWS<SearchProductsResponse>({
        type: "voedingslog/search_products",
        query,
        online,
      });
      this._aiValidateSearchResults = res.products || [];
    } catch (err) {
      console.error("AI validate search failed:", err);
    }
  }

  private _selectAiValidateProduct(product: Product): void {
    const idx = this._aiValidateIndex;
    const current = this._aiParsedProducts[idx];
    // Replace product but keep AI-estimated grams
    this._aiParsedProducts = [
      ...this._aiParsedProducts.slice(0, idx),
      { ...product, serving_grams: current.serving_grams, ai_name: current.ai_name, matched: true },
      ...this._aiParsedProducts.slice(idx + 1),
    ];
    this._aiValidateSearchResults = [];
    this._aiValidateSearch = "";
  }

  private _skipAiProduct(): void {
    this._aiValidateIndex++;
    this._aiValidateSearch = "";
    this._aiValidateSearchResults = [];
    if (this._aiValidateIndex >= this._aiParsedProducts.length) {
      this._closeDialog();
      this._loadLog();
    }
  }

  private async _confirmAiProduct(): Promise<void> {
    const product = this._aiParsedProducts[this._aiValidateIndex];
    if (!product) return;

    const gramsInput = this.shadowRoot?.getElementById("ai-validate-grams") as HTMLInputElement | null;
    const catSelect = this.shadowRoot?.getElementById("ai-validate-category") as HTMLSelectElement | null;
    const grams = parseFloat(gramsInput?.value || "") || product.serving_grams || 100;
    const category = (catSelect?.value as MealCategory) || defaultCategory();

    try {
      await this.hass.callWS({
        type: "voedingslog/log_product",
        person: this._selectedPerson,
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

    this._aiValidateIndex++;
    this._aiValidateSearch = "";
    this._aiValidateSearchResults = [];
    if (this._aiValidateIndex >= this._aiParsedProducts.length) {
      this._closeDialog();
      this._loadLog();
    }
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
        ${this._analyzing
          ? html`<div class="analyzing">
              <ha-circular-progress indeterminate></ha-circular-progress>
              <p>Analyseren...</p>
            </div>`
          : this._photoCameraActive
            ? html`
              <div id="photo-camera-placeholder" class="scanner-area"></div>
              <button class="btn-primary camera-capture-btn" style="margin-top:8px" @click=${() => this._capturePhotoFrame()}>
                <ha-icon icon="mdi:camera"></ha-icon> Maak foto
              </button>
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
        <div class="form-field">
          <label>Naam</label>
          <input
            type="text"
            id="meal-name-input"
            .value=${meal?.name || ""}
            placeholder="Bijv. Macaroni"
          />
        </div>

        <div class="form-field">
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

  private async _startPhotoCamera(): Promise<void> {
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
    // Find the video element created by html5-qrcode
    const container = document.getElementById(this._photoCameraContainerId);
    const video = container?.querySelector("video");
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
    if (this._photoHtml5Qrcode) {
      this._photoHtml5Qrcode.stop().catch(() => {}).finally(() => {
        this._photoHtml5Qrcode = null;
        this._cleanupPhotoCameraContainer();
      });
    } else {
      this._cleanupPhotoCameraContainer();
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
    this._exportImageUrl = null;
    this._aiParsedProducts = [];
    this._aiValidateIndex = 0;
    this._aiValidateSearch = "";
    this._aiValidateSearchResults = [];
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

  static override styles = panelStyles;
}
