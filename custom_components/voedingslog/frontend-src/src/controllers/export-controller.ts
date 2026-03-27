/**
 * Export controller — day detail dialog, period charts, PNG export, download/share.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { HomeAssistant, LogItem, VoedingslogConfig, PeriodDay, GetPeriodResponse } from "../types.js";
import { sumNutrients, itemKcal, NUTRIENTS_META } from "../helpers.js";
import { svg } from "lit";

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

type Slice = { pct: number; color: string; label: string; grams: number; goal: number };
type PeriodMode = "day" | "week" | "month";

/** 1 = Monday (ISO/European default). 0 = Sunday. */
const WEEK_START_DAY = 1;

interface GoalNutrient {
  key: string;
  label: string;
  unit: string;
  goal: number;
  color: string;
}

export class ExportController {
  host: ExportControllerHost;
  exportImageUrl: string | null = null;
  periodMode: PeriodMode = "day";
  periodData: PeriodDay[] | null = null;
  periodLoading = false;
  /** Anchor date for the current period (start of week/month, or the selected day). */
  private _periodAnchor: string = "";

  constructor(host: ExportControllerHost) {
    this.host = host;
  }

  reset(): void {
    this.exportImageUrl = null;
    this.periodMode = "day";
    this.periodData = null;
    this.periodLoading = false;
    this._periodAnchor = "";
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

        ${this.periodMode === "day" ? this._renderDayView() : this._renderPeriodView()}
      </div>
    `;
  }

  async setPeriodMode(mode: PeriodMode): Promise<void> {
    this.periodMode = mode;
    this.exportImageUrl = null;
    this._snapAnchor();
    if (mode !== "day") {
      await this._loadPeriodData();
    } else {
      // Sync panel's selected date with anchor
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
      this._periodAnchor = _toDateStr(anchor);
      this.host._selectedDate = this._periodAnchor;
      await this.host._loadLog();
    } else if (this.periodMode === "week") {
      anchor.setDate(anchor.getDate() + delta * 7);
      this._periodAnchor = _toDateStr(anchor);
      await this._loadPeriodData();
    } else {
      anchor.setMonth(anchor.getMonth() + delta);
      this._periodAnchor = _toDateStr(anchor);
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
      // Find previous WEEK_START_DAY
      const day = ref.getDay();
      const diff = (day - WEEK_START_DAY + 7) % 7;
      ref.setDate(ref.getDate() - diff);
      this._periodAnchor = _toDateStr(ref);
    } else {
      // First of month
      ref.setDate(1);
      this._periodAnchor = _toDateStr(ref);
    }
  }

  /** Compute start/end dates for the current period. */
  private _periodRange(): { start: string; end: string } {
    const anchor = new Date(this._periodAnchor + "T12:00:00");
    if (this.periodMode === "week") {
      const end = new Date(anchor);
      end.setDate(end.getDate() + 6);
      return { start: _toDateStr(anchor), end: _toDateStr(end) };
    }
    // Month: 1st to last day
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { start: _toDateStr(anchor), end: _toDateStr(end) };
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
    // Month
    const anchor = new Date(this._periodAnchor + "T12:00:00");
    return anchor.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  }

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

  // ── Day view (existing pie chart) ─────────────────────────────

  private _renderDayView(): TemplateResult {
    const h = this.host;
    const totals = sumNutrients(h._items);
    const mg = h._getMacroGoals();
    const goal = h._getCaloriesGoal();
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
    const slices: Slice[] = [
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
      <div class="pie-section">
        <div class="pie-chart" style="background: conic-gradient(${gradientStops || "#eee 0% 100%"})">
          <div class="pie-center">
            <span class="pie-kcal">${Math.round(kcal)}</span>
            <span class="pie-unit">/ ${goal} kcal</span>
          </div>
        </div>
        <div class="pie-legend">
          ${slices.map((s) => {
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
          })}
        </div>
      </div>

      <div class="detail-table">
        <div class="detail-table-header">Alle voedingswaarden</div>
        ${Object.entries(h._config?.nutrients || {}).map(([key, meta]) => {
          const raw = totals[key] || 0;
          const factor = (NUTRIENTS_META as Record<string, number>)[key] || 1;
          const value = raw * factor;
          return html`
            <div class="detail-row">
              <span>${meta.label}</span>
              <span>${value.toFixed(1)} ${meta.unit}</span>
            </div>
          `;
        })}
      </div>

      <div style="margin-top:12px">
        <div class="detail-table-header">Gelogde items (${h._items.length})</div>
        ${h._items.map((item) => {
          const kcalVal = itemKcal(item);
          return html`
            <div class="detail-row">
              <span>${item.name}</span>
              <span>${item.grams}g · ${Math.round(kcalVal)} kcal</span>
            </div>
          `;
        })}
      </div>

      ${this.exportImageUrl
        ? html`
          <div class="export-preview">
            <img src=${this.exportImageUrl} alt="Voedingslog export"
              style="width:100%;border-radius:8px;border:1px solid var(--divider-color);margin-top:8px;" />
            <div class="export-actions">
              <button class="btn-primary btn-confirm" @click=${() => this.download()}>
                <ha-icon icon="mdi:download"></ha-icon>
                Download
              </button>
              ${(navigator as any).share ? html`
                <button class="btn-secondary btn-confirm" @click=${() => this.share()}>
                  <ha-icon icon="mdi:share-variant"></ha-icon>
                  Delen
                </button>
              ` : nothing}
            </div>
          </div>
        `
        : html`
          <button class="btn-secondary btn-confirm" @click=${() => this.exportImage(slices)}>
            <ha-icon icon="mdi:download"></ha-icon>
            Exporteer als afbeelding
          </button>
        `}
    `;
  }

  // ── Period view (line charts) ─────────────────────────────────

  private _renderPeriodView(): TemplateResult {
    if (this.periodLoading) {
      return html`<div class="period-loading"><ha-circular-progress indeterminate size="small"></ha-circular-progress> Laden...</div>`;
    }
    if (!this.periodData || this.periodData.length === 0) {
      return html`<p class="empty-hint">Geen data voor deze periode.</p>`;
    }

    const goals = this._getGoalNutrients();
    const days = this.periodData;

    return html`
      ${goals.map((g) => this._renderChart(g, days))}

      <div class="detail-table" style="margin-top:8px">
        <div class="detail-table-header">Gemiddeld per dag</div>
        ${goals.map((g) => {
          const avg = days.reduce((sum, d) => sum + (d.totals[g.key] || 0), 0) / days.length;
          return html`
            <div class="detail-row">
              <span>${g.label}</span>
              <span>${Math.round(avg)} / ${g.goal} ${g.unit}</span>
            </div>
          `;
        })}
      </div>

      ${this.exportImageUrl
        ? html`
          <div class="export-preview">
            <img src=${this.exportImageUrl} alt="Voedingslog export"
              style="width:100%;border-radius:8px;border:1px solid var(--divider-color);margin-top:8px;" />
            <div class="export-actions">
              <button class="btn-primary btn-confirm" @click=${() => this.download()}>
                <ha-icon icon="mdi:download"></ha-icon> Download
              </button>
            </div>
          </div>
        `
        : html`
          <button class="btn-secondary btn-confirm" @click=${() => this._exportPeriodImage()}>
            <ha-icon icon="mdi:download"></ha-icon> Exporteer als afbeelding
          </button>
        `}
    `;
  }

  private _renderChart(goal: GoalNutrient, days: PeriodDay[]): TemplateResult {
    const W = 400;
    const H = 140;
    const padL = 45;
    const padR = 10;
    const padT = 10;
    const padB = 30;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const values = days.map((d) => d.totals[goal.key] || 0);
    const maxVal = Math.max(goal.goal * 1.3, ...values) || 1;
    const barW = Math.max(4, Math.min(20, (chartW - days.length * 2) / days.length));
    const isMonth = days.length > 14;

    const goalY = padT + chartH - (goal.goal / maxVal) * chartH;

    return html`
      <div class="period-chart-title">${goal.label} (${goal.unit})</div>
      <svg viewBox="0 0 ${W} ${H}" class="period-chart">
        <!-- Grid lines -->
        ${[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + chartH - f * chartH;
          const val = Math.round(f * maxVal);
          return svg`
            <line x1=${padL} y1=${y} x2=${W - padR} y2=${y} stroke="#eee" stroke-width="0.5" />
            <text x=${padL - 4} y=${y + 3} text-anchor="end" fill="#999" font-size="9">${val}</text>
          `;
        })}

        <!-- Goal line -->
        <line x1=${padL} y1=${goalY} x2=${W - padR} y2=${goalY}
          stroke=${goal.color} stroke-width="1" stroke-dasharray="4 3" opacity="0.6" />
        <text x=${W - padR} y=${goalY - 3} text-anchor="end" fill=${goal.color} font-size="8" opacity="0.8">doel ${goal.goal}</text>

        <!-- Bars -->
        ${values.map((v, i) => {
          const x = padL + (i / days.length) * chartW + (chartW / days.length - barW) / 2;
          const barH = (v / maxVal) * chartH;
          const y = padT + chartH - barH;
          const over = v > goal.goal;
          return svg`<rect x=${x} y=${y} width=${barW} height=${barH} rx="2"
            fill=${over ? "#e53935" : goal.color} opacity=${over ? 0.8 : 0.7} />`;
        })}

        <!-- X-axis labels -->
        ${days.map((d, i) => {
          if (isMonth && i % 5 !== 0 && i !== days.length - 1) return nothing;
          const x = padL + (i / days.length) * chartW + chartW / days.length / 2;
          const label = isMonth ? d.date.slice(8) : _shortDay(d.date);
          return svg`<text x=${x} y=${H - 5} text-anchor="middle" fill="#999" font-size="8">${label}</text>`;
        })}
      </svg>
    `;
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
    const canvasH = 420 + nutrientEntries.length * rowH + items.length * rowH + 80;
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
      const factor = (NUTRIENTS_META as Record<string, number>)[key] || 1;
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
        const label = isMonth ? days[i].date.slice(8) : _shortDay(days[i].date);
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


function _shortDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return ["zo", "ma", "di", "wo", "do", "vr", "za"][d.getDay()];
}

function _toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}
