/**
 * Export controller — day detail dialog, PNG export, download/share.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { LogItem, VoedingslogConfig } from "../types.js";
import { sumNutrients, itemKcal, NUTRIENTS_META } from "../helpers.js";

export interface ExportControllerHost {
  shadowRoot: ShadowRoot | null;
  _config: VoedingslogConfig | null;
  _selectedPerson: string | null;
  _selectedDate: string;
  _items: LogItem[];
  requestUpdate(): void;
  _closeDialog(): void;
  _getCaloriesGoal(): number;
  _getMacroGoals(): { carbs: number; protein: number; fat: number; fiber: number };
  _formatDateLabel(dateStr: string): string;
}

type Slice = { pct: number; color: string; label: string; grams: number; goal: number };

export class ExportController {
  host: ExportControllerHost;
  exportImageUrl: string | null = null;

  constructor(host: ExportControllerHost) {
    this.host = host;
  }

  reset(): void {
    this.exportImageUrl = null;
  }

  renderDayDetailDialog(): TemplateResult {
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
      <div class="dialog-header">
        <h2>Dagdetails — ${h._formatDateLabel(h._selectedDate)}</h2>
        <button class="close-btn" @click=${() => h._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
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
      </div>
    `;
  }

  // ── Export ────────────────────────────────────────────────────

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

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      this.exportImageUrl = canvas.toDataURL("image/png");
      h.requestUpdate();
    }, "image/png");
  }

  download(): void {
    if (!this.exportImageUrl) return;
    const h = this.host;
    const a = document.createElement("a");
    a.href = this.exportImageUrl;
    a.download = `voedingslog-${h._selectedPerson}-${h._selectedDate}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async share(): Promise<void> {
    if (!this.exportImageUrl) return;
    const h = this.host;
    try {
      const res = await fetch(this.exportImageUrl);
      const blob = await res.blob();
      const file = new File([blob], `voedingslog-${h._selectedPerson}-${h._selectedDate}.png`, { type: "image/png" });
      await navigator.share({ files: [file] });
    } catch {
      this.download();
    }
  }
}
