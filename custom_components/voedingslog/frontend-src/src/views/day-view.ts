/**
 * Day view — pie chart, nutrient table, grouped items, daily review, export preview.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { LogItem, MealCategory, NutrientMap, VoedingslogConfig } from "../types.js";
import { itemKcal, NUTRIENTS_META, groupByCategory, CATEGORY_ICONS, DEFAULT_CATEGORY_LABELS } from "../helpers.js";

export interface Slice {
  pct: number;
  color: string;
  label: string;
  grams: number;
  goal: number;
}

export interface DayViewParams {
  totals: NutrientMap;
  items: LogItem[];
  config: VoedingslogConfig | null;
  caloriesGoal: number;
  slices: Slice[];
  exportImageUrl: string | null;
  hasAiEntity: boolean;
  reviewLoading: boolean;
  dailyReview: string | null;
  onExport: (slices: Slice[]) => void;
  onDownload: () => void;
  onShare: () => void;
  onLoadReview: () => void;
}

export function renderDayView(params: DayViewParams): TemplateResult {
  const {
    totals, items, config, caloriesGoal, slices, exportImageUrl,
    hasAiEntity, reviewLoading, dailyReview,
    onExport, onDownload, onShare, onLoadReview,
  } = params;

  const kcal = totals["energy-kcal_100g"] || 0;

  let gradientStops = "";
  let angle = 0;
  for (const s of slices) {
    const end = angle + s.pct;
    gradientStops += `${s.color} ${angle}% ${end}%, `;
    angle = end;
  }
  gradientStops = gradientStops.replace(/, $/, "");

  const labels = config?.category_labels || DEFAULT_CATEGORY_LABELS;

  return html`
    <div class="pie-section">
      <div class="pie-chart" style="background: conic-gradient(${gradientStops || "#eee 0% 100%"})">
        <div class="pie-center">
          <span class="pie-kcal">${Math.round(kcal)}</span>
          <span class="pie-unit">/ ${caloriesGoal} kcal</span>
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
      ${Object.entries(config?.nutrients || {}).map(([key, meta]) => {
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

    ${hasAiEntity ? html`
      <div style="margin-top:12px">
        ${reviewLoading
          ? html`<div class="period-loading"><ha-circular-progress indeterminate size="small"></ha-circular-progress> Analyse laden...</div>`
          : dailyReview
            ? html`
              <div class="ai-advice">
                <ha-icon icon="mdi:robot-outline" style="--mdc-icon-size:16px;color:var(--primary-color);flex-shrink:0"></ha-icon>
                <div>
                  <ul class="suggestion-bullets" style="margin:0;padding-left:16px">
                    ${dailyReview.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter((l) => l).map((l) => html`<li>${l}</li>`)}
                  </ul>
                </div>
              </div>
            `
            : html`
              <button class="btn-secondary btn-confirm" @click=${() => onLoadReview()}>
                <ha-icon icon="mdi:robot-outline"></ha-icon>
                Daganalyse
              </button>
            `}
      </div>
    ` : nothing}

    <div style="margin-top:12px">
      <div class="detail-table-header">Gelogde items (${items.length})</div>
      ${_renderGroupedItems(items, labels)}
    </div>

    ${exportImageUrl
      ? html`
        <div class="export-preview">
          <img src=${exportImageUrl} alt="Voedingslog export"
            style="width:100%;border-radius:8px;border:1px solid var(--divider-color);margin-top:8px;" />
          <div class="export-actions">
            <button class="btn-primary btn-confirm" @click=${() => onDownload()}>
              <ha-icon icon="mdi:download"></ha-icon>
              Download
            </button>
            ${(navigator as Navigator & { share?: unknown }).share ? html`
              <button class="btn-secondary btn-confirm" @click=${() => onShare()}>
                <ha-icon icon="mdi:share-variant"></ha-icon>
                Delen
              </button>
            ` : nothing}
          </div>
        </div>
      `
      : html`
        <button class="btn-secondary btn-confirm" @click=${() => onExport(slices)}>
          <ha-icon icon="mdi:download"></ha-icon>
          Exporteer als afbeelding
        </button>
      `}
  `;
}

function _renderGroupedItems(items: LogItem[], labels: Record<MealCategory, string>): TemplateResult {
  const groups = groupByCategory(items);
  const categories: MealCategory[] = ["breakfast", "lunch", "dinner", "snack"];
  return html`
    ${categories.map((cat) => {
      const catItems = groups[cat];
      if (catItems.length === 0) return nothing;
      return html`
        <div class="detail-category">
          <div class="detail-category-header">
            <ha-icon icon=${CATEGORY_ICONS[cat]} style="--mdc-icon-size:16px"></ha-icon>
            <span>${labels[cat]}</span>
          </div>
          ${catItems.map((item) => {
            const kcalVal = itemKcal(item);
            return html`
              <div class="detail-row">
                <span>${item.name}</span>
                <span>${item.grams}g · ${Math.round(kcalVal)} kcal</span>
              </div>
            `;
          })}
        </div>
      `;
    })}
  `;
}
