import { LitElement, html, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { Html5Camera } from "./barcode-capture.js";
import type {
  HomeAssistant,
  MealCategory,
  LogItem,
  IndexedLogItem,
  Product,
  VoedingslogConfig,
  GetLogResponse,
  DialogMode,
} from "./types.js";
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_LABELS,
  groupByCategory,
  KEY_NUTRIENTS_DISPLAY,
  calcItemNutrients,
  sumNutrients,
  formatDateLabel,
} from "./helpers.js";
import { panelStyles } from "./styles.js";
import { AiController } from "./controllers/ai-controller.js";
import { ProductsController } from "./controllers/products-controller.js";
import { SearchController } from "./controllers/search-controller.js";
import { EntryController } from "./controllers/entry-controller.js";
import { ExportController } from "./controllers/export-controller.js";



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
  @state() private _streak = 0;

  @state() _dialogMode: DialogMode = null;
  @state() _pendingProduct: Product | null = null;
  @state() _scanning = false;
  @state() _scanFailed = false;
  @state() _photoCameraActive = false;
  @state() _prefillProduct: Product | null = null;
  @state() _analyzing = false;
  @state() _editingItem: IndexedLogItem | null = null;

  /** Tracks which dialog to return to when the weight dialog closes. */
  private _weightReturnMode: DialogMode = null;

  private _searchCtrl = new SearchController(this);
  private _entry = new EntryController(this);
  private _ai = new AiController(this);
  private _products = new ProductsController(this);
  private _export = new ExportController(this);

  private _barcodeCamera = new Html5Camera(this, "vl-barcode-reader", "barcode-scanner-placeholder");
  private _photoCamera = new Html5Camera(this, "vl-photo-camera", "photo-camera-placeholder");

  // ── Lifecycle ────────────────────────────────────────────────────

  private _popStateHandler = () => this._handleBackButton();
  private _dialogHistoryDepth = 0;

  async connectedCallback(): Promise<void> {
    super.connectedCallback();
    window.addEventListener("popstate", this._popStateHandler);
    this.addEventListener("touchstart", this._onTouchStart, { passive: true });
    this.addEventListener("touchmove", this._onTouchMove, { passive: true });
    this.addEventListener("touchend", this._onTouchEnd, { passive: true });
    await this._loadConfig();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this._popStateHandler);
    this.removeEventListener("touchstart", this._onTouchStart);
    this.removeEventListener("touchmove", this._onTouchMove);
    this.removeEventListener("touchend", this._onTouchEnd);
    this._barcodeCamera.stop();
    this._photoCamera.stop();
  }

  // ── Touch gestures (swipe + pull to refresh) ─────────────────────
  private _touchStartX = 0;
  private _touchStartY = 0;
  @state() private _pullDistance = 0;
  private _pulling = false;

  private _onTouchStart = (e: TouchEvent) => {
    this._touchStartX = e.touches[0].clientX;
    this._touchStartY = e.touches[0].clientY;
    // Start pull-to-refresh tracking if at top of page
    this._pulling = !this._dialogMode && window.scrollY <= 0;
  };

  private _onTouchMove = (e: TouchEvent) => {
    if (!this._pulling) return;
    const dy = e.touches[0].clientY - this._touchStartY;
    if (dy > 0 && dy < 120) {
      this._pullDistance = dy;
    }
  };

  private _onTouchEnd = (e: TouchEvent) => {
    // Pull to refresh
    if (this._pulling && this._pullDistance > 60) {
      this._pullDistance = 0;
      this._pulling = false;
      this._loadLog();
      return;
    }
    this._pullDistance = 0;
    this._pulling = false;

    if (this._dialogMode) return;
    const dx = e.changedTouches[0].clientX - this._touchStartX;
    const dy = e.changedTouches[0].clientY - this._touchStartY;
    // Require horizontal swipe > 60px and mostly horizontal
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) {
      this._changeDate(dx < 0 ? 1 : -1);
    }
  };

  private _pushDialogHistory(): void {
    this._dialogHistoryDepth++;
    history.pushState({ voedingslogDialog: true }, "");
  }

  private _handleBackButton(): void {
    if (this._dialogHistoryDepth > 0 && this._dialogMode) {
      this._dialogHistoryDepth--;
      this._navigateBack();
    }
  }

  _navigateBack(): void {
    // Mirror the X button logic for each dialog
    switch (this._dialogMode) {
      case "barcode": this._setDialogMode("search"); break;
      case "photo": this._setDialogMode("manual"); break;
      case "manual": this._setDialogMode(this._searchCtrl.returnToMode as string); break;
      case "search": this._searchCtrl.closeSearch(); break;
      case "product-edit": this._setDialogMode("products"); break;
      case "weight":
        if (this._weightReturnMode) {
          const ret = this._weightReturnMode;
          this._weightReturnMode = null;
          this._pendingProduct = null;
          this._setDialogMode(ret as string);
        } else {
          this._closeDialog();
        }
        break;
      case "batch-add":
        if (this._ai.currentMode === "recipe") this._setDialogMode("product-edit");
        else this._closeDialog();
        break;
      default: this._closeDialog(); break;
    }
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
    // Load streak in background
    this.hass.callWS<{ streak: number }>({
      type: "voedingslog/get_streak", person: this._selectedPerson,
    }).then((r) => { this._streak = r.streak; }).catch(() => {});
    this._loading = false;
  }

  // ── Rendering ────────────────────────────────────────────────────

  render(): TemplateResult {
    if (!this._config || this._loading) {
      return html`<div class="container"><p>Laden...</p></div>`;
    }

    try {
      const labels = this._config.category_labels || DEFAULT_CATEGORY_LABELS;
      const groups = groupByCategory(this._items);

      return html`
        ${this._pullDistance > 10 ? html`
          <div class="pull-indicator" style="height:${Math.min(this._pullDistance, 60)}px">
            <ha-icon icon=${this._pullDistance > 60 ? "mdi:refresh" : "mdi:arrow-down"} style="opacity:${Math.min(1, this._pullDistance / 60)}"></ha-icon>
          </div>
        ` : nothing}
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
        ${this._snackbar ? html`
          <div class="snackbar">
            <span>${this._snackbar.name} verwijderd</span>
            <button @click=${() => this._undoDelete()}>Ongedaan maken</button>
          </div>
        ` : nothing}
      `;
    } catch (e) {
      console.error("Render error:", e);
      return html`
        <div class="container" style="padding:24px">
          <p>Er is een fout opgetreden bij het weergeven van de pagina.</p>
          <button class="btn-primary" @click=${() => { this._closeDialog(); this._loadLog(); }}>Probeer opnieuw</button>
        </div>
      `;
    }
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
    return formatDateLabel(dateStr);
  }

  private _renderHeader(): TemplateResult {
    const persons = this._config?.persons || [];
    return html`
      <div class="header">
        <div class="header-bar">
          ${this.narrow
            ? html`<button class="menu-btn" @click=${() => this._toggleMenu()}>
                <ha-icon icon="mdi:menu"></ha-icon>
              </button>`
            : nothing}
          <span class="header-title">Voedingslog</span>
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
    `;
  }

  private _renderActions(): TemplateResult {
    const hasAI = !!this._config?.ai_task_entity;
    return html`
      <div class="actions">
        <button class="action-btn" @click=${() => this._products.open("manage")}>
          <ha-icon icon="mdi:food-variant"></ha-icon>
          <span>Producten</span>
        </button>
        ${hasAI ? html`
          <button class="action-btn" @click=${() => this._openBatchAdd("log")}>
            <ha-icon icon="mdi:text-box-outline"></ha-icon>
            <span>Bulk toevoegen</span>
          </button>
        ` : nothing}
        <button class="action-btn action-btn-primary" @click=${() => this._products.open("add")}>
          <ha-icon icon="mdi:plus"></ha-icon>
          <span>Toevoegen</span>
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
      <div class="day-totals card" @click=${() => this._setDialogMode("day-detail")} style="cursor:pointer">
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
        ${(() => {
          const p = totals["proteins_100g"] || 0;
          const c = totals["carbohydrates_100g"] || 0;
          const f = totals["fat_100g"] || 0;
          const v = totals["fiber_100g"] || 0;
          const total = p + c + f + v;
          if (total < 1) return nothing;
          return html`
            <div class="macro-ratio">
              <div class="macro-ratio-bar">
                <div style="width:${p/total*100}%;background:#4caf50" title="Eiwit"></div>
                <div style="width:${c/total*100}%;background:var(--primary-color,#03a9f4)" title="Koolh."></div>
                <div style="width:${f/total*100}%;background:#ff9800" title="Vet"></div>
                <div style="width:${v/total*100}%;background:#8bc34a" title="Vezels"></div>
              </div>
              <div class="macro-ratio-labels">
                <span style="color:#4caf50">E ${Math.round(p/total*100)}%</span>
                <span style="color:var(--primary-color,#03a9f4)">K ${Math.round(c/total*100)}%</span>
                <span style="color:#ff9800">V ${Math.round(f/total*100)}%</span>
                <span style="color:#8bc34a">Vez ${Math.round(v/total*100)}%</span>
              </div>
            </div>
          `;
        })()}
        <div class="totals-hint">
          ${this._streak > 1
            ? html`<ha-icon icon="mdi:fire"></ha-icon><span>${this._streak} dagen streak</span><span style="margin:0 4px">·</span>`
            : nothing}
          <ha-icon icon="mdi:information-outline"></ha-icon>
          <span>Tik voor details</span>
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

  @state() private _quickEditIndex: number | null = null;

  private _renderItem(item: IndexedLogItem): TemplateResult {
    const vals = calcItemNutrients(item);
    const isQuickEdit = this._quickEditIndex === item._index;
    return html`
      <div class="food-item" @click=${() => this._openEditDialog(item)}>
        <div class="item-main">
          <span class="item-name">${item.name}</span>
          ${isQuickEdit
            ? html`<input type="number" class="quick-gram-input"
                .value=${String(item.grams)} min="1" step="1" inputmode="numeric"
                @click=${(e: Event) => e.stopPropagation()}
                @blur=${(e: Event) => this._saveQuickGrams(item, e)}
                @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); e.stopPropagation(); }}
              />`
            : html`<span class="item-meta item-grams" @click=${(e: Event) => { e.stopPropagation(); this._quickEditIndex = item._index; }}>
                ${item.grams}g · ${item.time}
              </span>`}
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

  private async _saveQuickGrams(item: IndexedLogItem, e: Event): Promise<void> {
    const grams = parseFloat((e.target as HTMLInputElement).value) || item.grams;
    this._quickEditIndex = null;
    if (grams === item.grams) return;
    try {
      await this.hass.callWS({
        type: "voedingslog/edit_item",
        person: this._selectedPerson,
        index: item._index,
        grams,
        date: this._selectedDate,
      });
      await this._loadLog();
    } catch (err) {
      console.error("Failed to update grams:", err);
    }
  }

  // ── Dialogs ──────────────────────────────────────────────────────

  private _renderDialog(): TemplateResult | typeof nothing {
    if (!this._dialogMode) return nothing;
    return html`
      <div class="dialog-overlay" @click=${() => this._navigateBack()}>
        <div class="dialog" @click=${(e: Event) => e.stopPropagation()}>
          ${this._dialogMode === "search" ? this._searchCtrl.renderSearchDialog() : nothing}
          ${this._dialogMode === "barcode" ? this._searchCtrl.renderBarcodeDialog() : nothing}
          ${this._dialogMode === "photo" ? this._searchCtrl.renderPhotoDialog() : nothing}
          ${this._dialogMode === "weight" ? this._entry.renderWeightDialog() : nothing}
          ${this._dialogMode === "edit" ? this._entry.renderEditDialog() : nothing}
          ${this._dialogMode === "products" ? this._products.renderProductsDialog() : nothing}
          ${this._dialogMode === "product-edit" ? this._products.renderEditDialog() : nothing}
          ${this._dialogMode === "manual" ? this._searchCtrl.renderManualEntryDialog() : nothing}
          ${this._dialogMode === "day-detail" ? this._export.renderDayDetailDialog() : nothing}
          ${this._dialogMode === "batch-add" ? this._ai.renderBatchAddDialog(this._ai.currentMode) : nothing}
          ${this._dialogMode === "ai-validate" ? this._ai.renderValidateDialog() : nothing}
        </div>
      </div>
    `;
  }






  _openManualWithPrefill(product: Product): void {
    this._prefillProduct = product;
    this._setDialogMode("manual");
  }


  // ── Actions ──────────────────────────────────────────────────────

  _lookupBarcode(barcode: string): void {
    this.hass.callWS<import("./types.js").LookupBarcodeResponse>({ type: "voedingslog/lookup_barcode", barcode }).then((res) => {
      if (res.product) this._searchCtrl.handleBarcodeResult(res.product);
      else alert("Barcode niet gevonden.");
    }).catch(() => alert("Fout bij opzoeken barcode."));
  }

  _handleBarcodePhoto(_e: Event): void {
    alert("Barcode foto wordt niet ondersteund. Voer de barcode handmatig in.");
  }

  _openBarcodeScanner(): void {
    this._setDialogMode("barcode");
    this._scanning = false;
    this._scanFailed = false;
    this.updateComplete.then(() => {
      this._scanning = true;
      this.requestUpdate();
      this._barcodeCamera.startScanner(
        (barcode) => { this._scanning = false; this._lookupBarcode(barcode); },
        () => { this._scanning = false; this._scanFailed = true; this.requestUpdate(); },
      );
    });
  }



  _openBatchAdd(mode: "log" | "recipe"): void {
    this._ai.currentMode = mode;
    this._ai.batchMode = "text";
    this._setDialogMode("batch-add");
  }

  async _openSearchDialog(callback?: (p: Product) => void, returnMode?: DialogMode): Promise<void> {
    await this._searchCtrl.open(callback, returnMode);
  }

  _openEditDialog(item: IndexedLogItem): void {
    this._editingItem = item;
    this._setDialogMode("edit");
  }




  async _startPhotoCamera(): Promise<void> {
    this._photoCameraActive = true;
    this.requestUpdate();
    const ok = await this._photoCamera.startViewfinder();
    if (!ok) {
      this._photoCameraActive = false;
      this.requestUpdate();
      alert("Camera niet beschikbaar. Gebruik 'Kies afbeelding'.");
    }
  }




  _stopPhotoCamera(): void {
    this._photoCameraActive = false;
    this._photoCamera.stop();
  }

  _capturePhotoFrame(): string | null {
    return this._photoCamera.captureFrame();
  }


  _addRecipeIngredientFromAi(ingredient: import("./types.js").MealIngredient): void {
    this._products.addIngredientFromAi(ingredient);
  }

  _selectProduct(product: Product, returnMode?: DialogMode): void {
    this._pendingProduct = product;
    this._weightReturnMode = returnMode || null;
    this._barcodeCamera.stop();
    this._setDialogMode("weight");
  }

  _closeDialog(): void {
    this._barcodeCamera.stop();
    this._stopPhotoCamera();
    // Remove any history entries we pushed for dialogs
    if (this._dialogHistoryDepth > 0) {
      const depth = this._dialogHistoryDepth;
      this._dialogHistoryDepth = 0;
      history.go(-depth);
    }
    this._dialogMode = null;
    this._pendingProduct = null;
    this._weightReturnMode = null;
    this._editingItem = null;
    this._analyzing = false;
    this._scanning = false;
    this._scanFailed = false;
    this._prefillProduct = null;
    this._searchCtrl.reset();
    this._products.reset();
    this._export.reset();
    this._ai.reset();
  }

  _setDialogMode(mode: string): void {
    // Stop cameras when leaving their dialogs
    if (this._dialogMode === "barcode" && mode !== "barcode") {
      this._barcodeCamera.stop();
    }
    if (this._dialogMode === "photo" && mode !== "photo") {
      this._stopPhotoCamera();
    }
    if (mode) {
      this._pushDialogHistory();
    }
    this._dialogMode = mode as DialogMode;
  }

  _openFileInput(id: string): void {
    const input = this.shadowRoot?.getElementById(id) as HTMLInputElement | null;
    if (input) {
      input.value = "";
      input.click();
    }
  }

  // ── Undo snackbar ────────────────────────────────────────────────
  @state() private _snackbar: { name: string; item: LogItem; timer: number } | null = null;

  private async _deleteItem(index: number): Promise<void> {
    const item = this._items[index];
    if (!item) return;

    try {
      await this.hass.callWS({
        type: "voedingslog/delete_item",
        person: this._selectedPerson,
        index,
        date: this._selectedDate,
      });
      await this._loadLog();

      // Show undo snackbar
      if (this._snackbar) clearTimeout(this._snackbar.timer);
      const timer = window.setTimeout(() => { this._snackbar = null; }, 5000);
      this._snackbar = { name: item.name, item, timer };
    } catch (e) {
      console.error("Failed to delete item:", e);
    }
  }

  private async _undoDelete(): Promise<void> {
    if (!this._snackbar) return;
    const { item } = this._snackbar;
    clearTimeout(this._snackbar.timer);
    this._snackbar = null;
    try {
      await this.hass.callWS({
        type: "voedingslog/log_product",
        person: this._selectedPerson,
        name: item.name,
        grams: item.grams,
        nutrients: item.nutrients,
        category: item.category,
        date: this._selectedDate,
        ...(item.components ? { components: item.components } : {}),
      });
      await this._loadLog();
    } catch (e) {
      console.error("Failed to undo delete:", e);
    }
  }

  static styles = panelStyles;
}
