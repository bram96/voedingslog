import { svg, nothing, type TemplateResult } from "lit";
import type { PeriodDay } from "../types.js";
import { shortDay } from "../helpers/dates.js";

export interface ChartConfig {
  key: string;
  label: string;
  unit: string;
  goal: number;
  color: string;
}

/**
 * Render an SVG bar chart with goal line and 3-day moving average.
 */
export function renderBarChart(config: ChartConfig, days: PeriodDay[]): TemplateResult {
  const W = 400;
  const H = 140;
  const padL = 45;
  const padR = 10;
  const padT = 10;
  const padB = 30;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const values = days.map((d) => d.totals[config.key] || 0);
  const maxVal = Math.max(config.goal * 1.3, ...values) || 1;
  const barW = Math.max(4, Math.min(20, (chartW - days.length * 2) / days.length));
  const isMonth = days.length > 14;
  const goalY = padT + chartH - (config.goal / maxVal) * chartH;

  return svg`
    ${_renderGrid(padL, padT, padR, W, chartH, maxVal)}
    ${_renderGoalLine(padL, padR, W, goalY, config)}
    ${_renderBars(values, days.length, padL, padT, chartW, chartH, barW, maxVal, config)}
    ${_renderTrendLine(values, days.length, padL, padT, chartW, chartH, maxVal, config)}
    ${_renderXLabels(days, padL, padT, padB, chartW, H, isMonth)}
  `;
}

function _renderGrid(padL: number, padT: number, padR: number, W: number, chartH: number, maxVal: number): TemplateResult {
  return svg`${[0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = padT + chartH - f * chartH;
    return svg`
      <line x1=${padL} y1=${y} x2=${W - padR} y2=${y} stroke="var(--divider-color, #eee)" stroke-width="0.5" />
      <text x=${padL - 4} y=${y + 3} text-anchor="end" fill="var(--secondary-text-color, #999)" font-size="9">${Math.round(f * maxVal)}</text>
    `;
  })}`;
}

function _renderGoalLine(padL: number, padR: number, W: number, goalY: number, config: ChartConfig): TemplateResult {
  return svg`
    <line x1=${padL} y1=${goalY} x2=${W - padR} y2=${goalY}
      stroke=${config.color} stroke-width="1" stroke-dasharray="4 3" opacity="0.6" />
    <text x=${W - padR} y=${goalY - 3} text-anchor="end" fill=${config.color} font-size="8" opacity="0.8">doel ${config.goal}</text>
  `;
}

function _renderBars(values: number[], count: number, padL: number, padT: number, chartW: number, chartH: number, barW: number, maxVal: number, config: ChartConfig): TemplateResult {
  return svg`${values.map((v, i) => {
    const x = padL + (i / count) * chartW + (chartW / count - barW) / 2;
    const barH = (v / maxVal) * chartH;
    const y = padT + chartH - barH;
    const over = v > config.goal;
    return svg`<rect x=${x} y=${y} width=${barW} height=${barH} rx="2"
      fill=${over ? "#e53935" : config.color} opacity=${over ? 0.8 : 0.7} />`;
  })}`;
}

function _renderTrendLine(values: number[], count: number, padL: number, padT: number, chartW: number, chartH: number, maxVal: number, config: ChartConfig): TemplateResult {
  if (values.length < 3) return svg``;
  const pts: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const w = values.slice(Math.max(0, i - 1), Math.min(values.length, i + 2));
    const avg = w.reduce((a, b) => a + b, 0) / w.length;
    const x = padL + (i / count) * chartW + chartW / count / 2;
    const y = padT + chartH - (avg / maxVal) * chartH;
    pts.push(`${x},${y}`);
  }
  return svg`<polyline points=${pts.join(" ")} fill="none" stroke=${config.color} stroke-width="1.5" opacity="0.9" />`;
}

function _renderXLabels(days: PeriodDay[], padL: number, _padT: number, _padB: number, chartW: number, H: number, isMonth: boolean): TemplateResult {
  return svg`${days.map((d, i) => {
    if (isMonth && i % 5 !== 0 && i !== days.length - 1) return nothing;
    const x = padL + (i / days.length) * chartW + chartW / days.length / 2;
    const label = isMonth ? d.date.slice(8) : shortDay(d.date);
    return svg`<text x=${x} y=${H - 5} text-anchor="middle" fill="var(--secondary-text-color, #999)" font-size="8">${label}</text>`;
  })}`;
}
