/**
 * Export controller — day detail dialog, period charts, PNG export, download/share.
 */
import { html, type TemplateResult } from "lit";
import type { HomeAssistant, LogItem, MealCategory, VoedingslogConfig, PeriodDay, GetPeriodResponse } from "../types.js";
import { sumNutrients, itemKcal, NUTRIENTS_META, groupByCategory, DEFAULT_CATEGORY_LABELS, toDateStr, shortDay } from "../helpers.js";
import { renderDayView, type Slice } from "../views/day-view.js";
import { renderPeriodView, type GoalNutrient } from "../views/period-view.js";

export type { Slice };

export interface ExportControllerHost {
  hass: HomeAssistant;
  shadowRoot: ShadowRoot | null;
  _config: VoedingslogConfig | null;
  _selectedPerson: string | null;
  _selectedDate: string;
  _items: LogItem[];
  requestUpdate(): void;
  _closeDialog(): void;
  _loadLog(): Promise<void>;
  _getCaloriesGoal(): number;
  _getMacroGoals(): { carbs: number; protein: number; fat: number; fiber: number };
  _formatDateLabel(dateStr: string): string;
}

type PeriodMode = "day" | "week" | "month";

export class ExportController {
  host: ExportControllerHost;
  exportImageUrl: string | null = null;
  periodMode: PeriodMode = "day";
  periodData: PeriodDay[] | null = null;
  periodLoading = false;
  /** Anchor date for the current period (start of week/month, or the selected day). */
  private _periodAnchor: string = "";
  // Nutrient suggestions
  private _suggestions: { gaps: any[]; ai_advice: { from_database: string; other_suggestions: string } | null } | null = null;
  private _suggestionsLoading = false;
  // Daily review
  private _dailyReview: string | null = null;

  /** Get week start day from HA locale (0=Sunday, 1=Monday). Defaults to 1 (Monday). */
  private get _weekStartDay(): number {
    return this.host.hass?.locale?.first_weekday ?? 1;
  }
  private _reviewLoading = false;

  constructor(host: ExportControllerHost) {
    this.host = host;
  }

  reset(): void {
    this.exportImageUrl = null;
    this.periodMode = "day";
    this.periodData = null;
    this.periodLoading = false;
    this._periodAnchor = "";
    this._suggestions = null;
    this._suggestionsLoading = false;
    this._dailyReview = null;
    this._reviewLoading = false;
  }

  private _getGoalNutrients(): GoalNutrient[] {
    const h = this.host;
    const mg = h._getMacroGoals();
    const goals: GoalNutrient[] = [
      { key: "energy-kcal_100g", label: "Calorieën", unit: "kcal", goal: h._getCaloriesGoal(), color: "#e53935" },
    ];
    if (mg.protein > 0) goals.push({ key: "proteins_100g", label: "Eiwitten", unit: "g", goal: mg.protein, color: "#4caf50" });
    if (mg.carbs > 0) goals.push({ key: "carbohydrates_100g", label: "Koolhydraten", unit: "g", goal: mg.carbs, color: "#03a9f4" });
    if (mg.fat > 0) goals.push({ key: "fat_100g", label: "Vetten", unit: "g", goal: mg.fat, color: "#ff9800" });
    if (mg.fiber > 0) goals.push({ key: "fiber_100g", label: "Vezels", unit: "g", goal: mg.fiber, color: "#8bc34a" });
    return goals;
  }

  // ── Main dialog ─────────────────────────────────────────────

  renderDayDetailDialog(): TemplateResult {
    const h = this.host;
    if (!this._periodAnchor) {
      this._periodAnchor = h._selectedDate;
    }

    const dayContent = this.periodMode === "day"
      ? this._buildDayView()
      : this._buildPeriodView();

    return html`
      <div class="dialog-header">
        <h2>${this._periodTitle()}</h2>
        <button class="close-btn" @click=${() => h._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="period-toggle">
          ${(["day", "week", "month"] as PeriodMode[]).map(
            (m) => html`
              <button class=${this.periodMode === m ? "active" : ""}
                @click=${() => this.setPeriodMode(m)}>
                ${m === "day" ? "Dag" : m === "week" ? "Week" : "Maand"}
              </button>
            `
          )}
        </div>

        <div class="period-nav">
          <button class="date-nav-btn" @click=${() => this._navigate(-1)}>
            <ha-icon icon="mdi:chevron-left"></ha-icon>
          </button>
          <span class="period-nav-label">${this._periodLabel()}</span>
          <button class="date-nav-btn" @click=${() => this._navigate(1)}>
            <ha-icon icon="mdi:chevron-right"></ha-icon>
          </button>
        </div>

        ${dayContent}
      </div>
    `;
  }

  private _buildDayView(): TemplateResult {
    const h = this.host;
    const totals = sumNutrients(h._items);
    const mg = h._getMacroGoals();
    const protein = totals["proteins_100g"] || 0;
    const carbs = totals["carbohydrates_100g"] || 0;
    const fat = totals["fat_100g"] || 0;
    const fiber = totals["fiber_100g"] || 0;
    const macroTotal = protein + carbs + fat + fiber;

    const pctProtein = macroTotal > 0 ? Math.round(protein / macroTotal * 100) : 0;
    const pctCarbs = macroTotal > 0 ? Math.round(carbs / macroTotal * 100) : 0;
    const pctFat = macroTotal > 0 ? Math.round(fat / macroTotal * 100) : 0;
    const pctFiber = macroTotal > 0 ? 100 - pctProtein - pctCarbs - pctFat : 0;

    const slices: Slice[] = [
      { pct: pctCarbs, color: "var(--primary-color, #03a9f4)", label: "Koolhydraten", grams: carbs, goal: mg.carbs },
      { pct: pctProtein, color: "#4caf50", label: "Eiwitten", grams: protein, goal: mg.protein },
      { pct: pctFat, color: "#ff9800", label: "Vetten", grams: fat, goal: mg.fat },
      { pct: pctFiber, color: "#8bc34a", label: "Vezels", grams: fiber, goal: mg.fiber },
    ];

    return renderDayView({
      totals,
      items: h._items,
      config: h._config,
      caloriesGoal: h._getCaloriesGoal(),
      slices,
      exportImageUrl: this.exportImageUrl,
      hasAiEntity: !!h._config?.ai_task_entity,
      reviewLoading: this._reviewLoading,
      dailyReview: this._dailyReview,
      onExport: (s) => this.exportImage(s),
      onDownload: () => this.download(),
      onShare: () => this.share(),
      onLoadReview: () => this._loadDailyReview(),
    });
  }

  private _buildPeriodView(): TemplateResult {
    return renderPeriodView({
      periodData: this.periodData,
      goals: this._getGoalNutrients(),
      periodLoading: this.periodLoading,
      suggestionsLoading: this._suggestionsLoading,
      suggestions: this._suggestions,
      exportImageUrl: this.exportImageUrl,
      onExportPeriodImage: () => this._exportPeriodImage(),
      onDownload: () => this.download(),
      onLoadSuggestions: () => this._loadSuggestions(),
    });
  }

  // ── Navigation ──────────────────────────────────────────────

  async setPeriodMode(mode: PeriodMode): Promise<void> {
    this.periodMode = mode;
    this.exportImageUrl = null;
    this._snapAnchor();
    if (mode !== "day") {
      await this._loadPeriodData();
    } else {
      this.host._selectedDate = this._periodAnchor;
      await this.host._loadLog();
    }
    this.host.requestUpdate();
  }

  private async _navigate(delta: number): Promise<void> {
    this.exportImageUrl = null;
    const anchor = new Date(this._periodAnchor + "T12:00:00");
    if (this.periodMode === "day") {
      anchor.setDate(anchor.getDate() + delta);
      this._periodAnchor = toDateStr(anchor);
      this.host._selectedDate = this._periodAnchor;
      await this.host._loadLog();
    } else if (this.periodMode === "week") {
      anchor.setDate(anchor.getDate() + delta * 7);
      this._periodAnchor = toDateStr(anchor);
      await this._loadPeriodData();
    } else {
      anchor.setMonth(anchor.getMonth() + delta);
      this._periodAnchor = toDateStr(anchor);
      await this._loadPeriodData();
    }
    this.host.requestUpdate();
  }

  /** Snap the anchor to the start of the current period based on _selectedDate. */
  private _snapAnchor(): void {
    const ref = new Date(this.host._selectedDate + "T12:00:00");
    if (this.periodMode === "day") {
      this._periodAnchor = this.host._selectedDate;
    } else if (this.periodMode === "week") {
      const day = ref.getDay();
      const diff = (day - this._weekStartDay + 7) % 7;
      ref.setDate(ref.getDate() - diff);
      this._periodAnchor = toDateStr(ref);
    } else {
      ref.setDate(1);
      this._periodAnchor = toDateStr(ref);
    }
  }

  /** Compute start/end dates for the current period. */
  private _periodRange(): { start: string; end: string } {
    const anchor = new Date(this._periodAnchor + "T12:00:00");
    if (this.periodMode === "week") {
      const end = new Date(anchor);
      end.setDate(end.getDate() + 6);
      return { start: toDateStr(anchor), end: toDateStr(end) };
    }
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start: toDateStr(anchor), end: toDateStr(end) };
  }

  private _periodTitle(): string {
    if (this.periodMode === "day") return "Dagdetails";
    if (this.periodMode === "week") return "Weekoverzicht";
    return "Maandoverzicht";
  }

  private _periodLabel(): string {
    if (this.periodMode === "day") {
      return this.host._formatDateLabel(this._periodAnchor || this.host._selectedDate);
    }
    if (this.periodMode === "week") {
      const { start, end } = this._periodRange();
      const s = new Date(start);
      const e = new Date(end);
      const fmt = (d: Date) => d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
      return `${fmt(s)} – ${fmt(e)}`;
    }
    const anchor = new Date(this._periodAnchor + "T12:00:00");
    return anchor.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  }

  // ── Data loading ────────────────────────────────────────────

  private async _loadPeriodData(): Promise<void> {
    this.periodLoading = true;
    this.host.requestUpdate();
    const { start, end } = this._periodRange();
    try {
      const res = await this.host.hass.callWS<GetPeriodResponse>({
        type: "voedingslog/get_period",
        person: this.host._selectedPerson,
        start_date: start,
        end_date: end,
      });
      this.periodData = res.days;
    } catch (e) {
      console.error("Failed to load period data:", e);
      this.periodData = [];
    }
    this.periodLoading = false;
    this.host.requestUpdate();
  }

  private async _loadDailyReview(): Promise<void> {
    this._reviewLoading = true;
    this.host.requestUpdate();
    try {
      const res = await this.host.hass.callWS<{ review: string }>({
        type: "voedingslog/daily_review",
        person: this.host._selectedPerson,
      });
      this._dailyReview = res.review || null;
    } catch (e) {
      console.error("Failed to load daily review:", e);
      this._dailyReview = null;
    }
    this._reviewLoading = false;
    this.host.requestUpdate();
  }

  private async _loadSuggestions(): Promise<void> {
    this._suggestionsLoading = true;
    this.host.requestUpdate();
    try {
      const res = await this.host.hass.callWS<{ gaps: any[]; ai_advice: { from_database: string; other_suggestions: string } | null }>({
        type: "voedingslog/get_suggestions",
        person: this.host._selectedPerson,
      });
      this._suggestions = res;
    } catch (e) {
      console.error("Failed to load suggestions:", e);
      this._suggestions = { gaps: [], ai_advice: null };
    }
    this._suggestionsLoading = false;
    this.host.requestUpdate();
  }

  // ── Export (day) ───────────────────────────────────────────────

  exportImage(slices: Slice[]): void {
    const h = this.host;
    const totals = sumNutrients(h._items);
    const goal = h._getCaloriesGoal();
    const kcal = totals["energy-kcal_100g"] || 0;
    const person = h._selectedPerson || "";
    const dateLabel = h._formatDateLabel(h._selectedDate);

    const dpr = window.devicePixelRatio || 1;
    const W = 600;
    const items = h._items;
    const rowH = 28;
    const nutrientEntries = Object.entries(h._config?.nutrients || {});
    const canvasH = 420 + nutrientEntries.length * rowH + items.length * rowH + 4 * 22 + 80;
    const canvas = document.createElement("canvas");
    canvas.width = W * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = canvasH + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, canvasH);

    ctx.fillStyle = "#1976d2";
    ctx.fillRect(0, 0, W, 60);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(`Voedingslog — ${person}`, 20, 28);
    ctx.font = "14px sans-serif";
    ctx.fillText(dateLabel + "  ·  " + Math.round(kcal) + " / " + goal + " kcal", 20, 48);

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

    let y = Math.max(ly + 20, 240);
    ctx.fillStyle = "#333";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("Alle voedingswaarden", 20, y);
    y += 8;
    ctx.font = "13px sans-serif";
    for (const [key, meta] of nutrientEntries) {
      const raw = totals[key] || 0;
      const factor = NUTRIENTS_META[key] || 1;
      const value = raw * factor;
      y += rowH;
      ctx.fillStyle = "#333";
      ctx.fillText(meta.label, 20, y);
      ctx.fillStyle = "#888";
      ctx.textAlign = "right";
      ctx.fillText(`${value.toFixed(1)} ${meta.unit}`, W - 20, y);
      ctx.textAlign = "left";
      ctx.strokeStyle = "#eee";
      ctx.beginPath();
      ctx.moveTo(20, y + 8);
      ctx.lineTo(W - 20, y + 8);
      ctx.stroke();
    }

    y += 30;
    ctx.fillStyle = "#333";
    ctx.font = "bold 14px sans-serif";
    const labels = h._config?.category_labels || DEFAULT_CATEGORY_LABELS;
    const groups = groupByCategory(items);
    const categories: MealCategory[] = ["breakfast", "lunch", "dinner", "snack"];
    ctx.fillText(`Gelogde items (${items.length})`, 20, y);
    for (const cat of categories) {
      const catItems = groups[cat];
      if (catItems.length === 0) continue;
      y += 22;
      ctx.fillStyle = "#888";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(labels[cat], 20, y);
      ctx.font = "13px sans-serif";
      for (const item of catItems) {
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
    }

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      this.exportImageUrl = canvas.toDataURL("image/png");
      this.host.requestUpdate();
    }, "image/png");
  }

  // ── Export (period) ───────────────────────────────────────────

  private _exportPeriodImage(): void {
    if (!this.periodData) return;
    const h = this.host;
    const goals = this._getGoalNutrients();
    const days = this.periodData;
    const person = h._selectedPerson || "";
    const periodLabel = this.periodMode === "week" ? "Week" : "Maand";

    const dpr = window.devicePixelRatio || 1;
    const W = 600;
    const chartH = 160;
    const canvasH = 80 + goals.length * (chartH + 40) + 20;
    const canvas = document.createElement("canvas");
    canvas.width = W * dpr;
    canvas.height = canvasH * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, canvasH);

    // Header
    ctx.fillStyle = "#1976d2";
    ctx.fillRect(0, 0, W, 60);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText(`Voedingslog — ${person}`, 20, 28);
    ctx.font = "14px sans-serif";
    const range = `${days[0]?.date || ""} – ${days[days.length - 1]?.date || ""}`;
    ctx.fillText(`${periodLabel}overzicht  ·  ${range}`, 20, 48);

    let y = 70;
    const padL = 55;
    const padR = 20;
    const cW = W - padL - padR;

    for (const g of goals) {
      ctx.fillStyle = "#333";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`${g.label} (${g.unit})`, padL, y + 10);
      y += 18;

      const values = days.map((d) => d.totals[g.key] || 0);
      const maxVal = Math.max(g.goal * 1.3, ...values) || 1;
      const barW = Math.max(3, Math.min(16, (cW - days.length * 2) / days.length));
      const isMonth = days.length > 14;

      // Grid
      for (const f of [0, 0.5, 1]) {
        const gy = y + chartH - f * chartH;
        ctx.strokeStyle = "#eee";
        ctx.beginPath();
        ctx.moveTo(padL, gy);
        ctx.lineTo(W - padR, gy);
        ctx.stroke();
        ctx.fillStyle = "#999";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(String(Math.round(f * maxVal)), padL - 4, gy + 3);
      }

      // Goal line
      const goalY = y + chartH - (g.goal / maxVal) * chartH;
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = g.color;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(padL, goalY);
      ctx.lineTo(W - padR, goalY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Bars
      ctx.textAlign = "left";
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        const x = padL + (i / days.length) * cW + (cW / days.length - barW) / 2;
        const bH = (v / maxVal) * chartH;
        const bY = y + chartH - bH;
        ctx.fillStyle = v > g.goal ? "#e53935" : g.color;
        ctx.globalAlpha = v > g.goal ? 0.8 : 0.7;
        ctx.fillRect(x, bY, barW, bH);
        ctx.globalAlpha = 1;
      }

      // X labels
      ctx.fillStyle = "#999";
      ctx.font = "8px sans-serif";
      ctx.textAlign = "center";
      for (let i = 0; i < days.length; i++) {
        if (isMonth && i % 5 !== 0 && i !== days.length - 1) continue;
        const x = padL + (i / days.length) * cW + cW / days.length / 2;
        const label = isMonth ? days[i].date.slice(8) : shortDay(days[i].date);
        ctx.fillText(label, x, y + chartH + 12);
      }

      y += chartH + 30;
    }

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      this.exportImageUrl = canvas.toDataURL("image/png");
      h.requestUpdate();
    }, "image/png");
  }

  // ── Download / share ──────────────────────────────────────────

  download(): void {
    if (!this.exportImageUrl) return;
    const h = this.host;
    const suffix = this.periodMode === "day" ? h._selectedDate : `${this.periodMode}-${h._selectedDate}`;
    const a = document.createElement("a");
    a.href = this.exportImageUrl;
    a.download = `voedingslog-${h._selectedPerson}-${suffix}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async share(): Promise<void> {
    if (!this.exportImageUrl) return;
    const h = this.host;
    const suffix = this.periodMode === "day" ? h._selectedDate : `${this.periodMode}-${h._selectedDate}`;
    try {
      const res = await fetch(this.exportImageUrl);
      const blob = await res.blob();
      const file = new File([blob], `voedingslog-${h._selectedPerson}-${suffix}.png`, { type: "image/png" });
      await navigator.share({ files: [file] });
    } catch {
      this.download();
    }
  }
}

