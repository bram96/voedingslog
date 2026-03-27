/**
 * Period view — bar charts, averages, nutrient gaps, suggestions, export preview.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { PeriodDay } from "../types.js";
import { renderBarChart, type ChartConfig } from "../ui/chart.js";

export interface GoalNutrient {
  key: string;
  label: string;
  unit: string;
  goal: number;
  color: string;
}

interface Suggestions {
  gaps: { nutrient_label?: string; suggestions?: { name: string; value_per_100g: string }[] }[];
  ai_advice: { from_database: string; other_suggestions: string } | null;
}

export interface PeriodViewParams {
  periodData: PeriodDay[] | null;
  goals: GoalNutrient[];
  periodLoading: boolean;
  suggestionsLoading: boolean;
  suggestions: Suggestions | null;
  exportImageUrl: string | null;
  onExportPeriodImage: () => void;
  onDownload: () => void;
  onLoadSuggestions: () => void;
}

export function renderPeriodView(params: PeriodViewParams): TemplateResult {
  const {
    periodData, goals, periodLoading, suggestionsLoading, suggestions,
    exportImageUrl, onExportPeriodImage, onDownload, onLoadSuggestions,
  } = params;

  if (periodLoading) {
    return html`<div class="period-loading"><ha-circular-progress indeterminate size="small"></ha-circular-progress> Laden...</div>`;
  }
  if (!periodData || periodData.length === 0) {
    return html`<p class="empty-hint">Geen data voor deze periode.</p>`;
  }

  const days = periodData;

  return html`
    ${goals.map((g) => {
      const chartConfig: ChartConfig = { key: g.key, label: g.label, unit: g.unit, goal: g.goal, color: g.color };
      return html`
        <div class="period-chart-title">${g.label} (${g.unit})</div>
        <svg viewBox="0 0 400 140" class="period-chart">
          ${renderBarChart(chartConfig, days)}
        </svg>
      `;
    })}

    <div class="detail-table" style="margin-top:8px">
      <div class="detail-table-header">Gemiddeld per dag${(() => {
        const today = new Date().toISOString().split("T")[0];
        const completed = days.filter((d) => d.item_count > 0 && d.date !== today).length;
        return completed < days.length ? ` (${completed} afgeronde dagen)` : "";
      })()}</div>
      ${goals.map((g) => {
        const today = new Date().toISOString().split("T")[0];
        const loggedDays = days.filter((d) => d.item_count > 0 && d.date !== today);
        const avg = loggedDays.length > 0 ? loggedDays.reduce((sum, d) => sum + (d.totals[g.key] || 0), 0) / loggedDays.length : 0;
        const pct = g.goal > 0 ? Math.round(avg / g.goal * 100) : 0;
        return html`
          <div class="detail-row">
            <span>${g.label} ${pct < 80 ? html`<span class="nutrient-gap-badge">laag</span>` : nothing}</span>
            <span>${Math.round(avg)} / ${g.goal} ${g.unit} (${pct}%)</span>
          </div>
        `;
      })}
    </div>

    ${(() => {
      const todayStr = new Date().toISOString().split("T")[0];
      const completedDays = days.filter((d) => d.item_count > 0 && d.date !== todayStr);
      const gaps = goals.filter((g) => {
        const avg = completedDays.length > 0 ? completedDays.reduce((sum, d) => sum + (d.totals[g.key] || 0), 0) / completedDays.length : 0;
        return g.goal > 0 && avg / g.goal < 0.8;
      });
      return gaps.length > 0 ? html`
        <div class="nutrient-gaps" style="margin-top:8px">
          <div class="detail-table-header">
            <ha-icon icon="mdi:alert-outline" style="--mdc-icon-size:16px;color:#ff9800;vertical-align:middle"></ha-icon>
            Aandachtspunten
          </div>
          ${gaps.map((g) => {
            const avg = completedDays.length > 0 ? completedDays.reduce((sum, d) => sum + (d.totals[g.key] || 0), 0) / completedDays.length : 0;
            const deficit = Math.round(g.goal - avg);
            return html`
              <div class="detail-row">
                <span>${g.label}</span>
                <span style="color:#ff9800">${deficit} ${g.unit}/dag tekort</span>
              </div>
            `;
          })}
          ${suggestionsLoading
            ? html`<div class="period-loading"><ha-circular-progress indeterminate size="small"></ha-circular-progress> Suggesties laden...</div>`
            : suggestions
              ? _renderSuggestions(suggestions)
              : html`<button class="btn-secondary btn-confirm" style="margin-top:8px" @click=${() => onLoadSuggestions()}>
                  <ha-icon icon="mdi:lightbulb-outline"></ha-icon>
                  Wat kan ik eten?
                </button>`}
        </div>
      ` : nothing;
    })()}

    ${exportImageUrl
      ? html`
        <div class="export-preview">
          <img src=${exportImageUrl} alt="Voedingslog export"
            style="width:100%;border-radius:8px;border:1px solid var(--divider-color);margin-top:8px;" />
          <div class="export-actions">
            <button class="btn-primary btn-confirm" @click=${() => onDownload()}>
              <ha-icon icon="mdi:download"></ha-icon> Download
            </button>
          </div>
        </div>
      `
      : html`
        <button class="btn-secondary btn-confirm" @click=${() => onExportPeriodImage()}>
          <ha-icon icon="mdi:download"></ha-icon> Exporteer als afbeelding
        </button>
      `}
  `;
}

function _renderSuggestions(suggestions: Suggestions): TemplateResult {
  const { gaps, ai_advice } = suggestions;

  const parseBullets = (text: string): string[] =>
    text.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter((l) => l.length > 0);

  return html`
    <div class="suggestions-section">
      ${ai_advice?.from_database ? html`
        <div class="suggestion-group">
          <div class="suggestion-label">
            <ha-icon icon="mdi:food-variant" style="--mdc-icon-size:14px;vertical-align:middle"></ha-icon>
            Uit je producten
          </div>
          <ul class="suggestion-bullets">
            ${parseBullets(ai_advice.from_database).map((b) => html`<li>${b}</li>`)}
          </ul>
        </div>
      ` : nothing}
      ${ai_advice?.other_suggestions ? html`
        <div class="suggestion-group">
          <div class="suggestion-label">
            <ha-icon icon="mdi:lightbulb-outline" style="--mdc-icon-size:14px;vertical-align:middle"></ha-icon>
            Anders
          </div>
          <ul class="suggestion-bullets">
            ${parseBullets(ai_advice.other_suggestions).map((b) => html`<li>${b}</li>`)}
          </ul>
        </div>
      ` : nothing}
      ${!ai_advice ? html`
        ${gaps.map((g) => g.suggestions && g.suggestions.length > 0 ? html`
          <div class="suggestion-group">
            <div class="suggestion-label">${g.nutrient_label} aanvullen:</div>
            ${g.suggestions.slice(0, 3).map((s) => html`
              <div class="detail-row">
                <span>${s.name}</span>
                <span style="color:#4caf50">${s.value_per_100g}/100g</span>
              </div>
            `)}
          </div>
        ` : nothing)}
      ` : nothing}
    </div>
  `;
}
