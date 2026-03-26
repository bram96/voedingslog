/**
 * Shared product search UI and logic.
 * Used by both the main search dialog and the meal ingredient search.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { Product, SearchProductsResponse } from "./types.js";

export interface SearchHost {
  hass: { callWS<T = unknown>(msg: Record<string, unknown>): Promise<T> };
  requestUpdate(): void;
}

export class ProductSearch {
  host: SearchHost;
  query = "";
  results: Product[] = [];
  source: "local" | "online" = "local";
  searching = false;

  constructor(host: SearchHost) {
    this.host = host;
  }

  reset(): void {
    this.query = "";
    this.results = [];
    this.source = "local";
    this.searching = false;
  }

  async search(online = false): Promise<void> {
    const q = this.query.trim();
    if (!q) return;
    this.searching = true;
    this.host.requestUpdate();
    try {
      const res = await this.host.hass.callWS<SearchProductsResponse>({
        type: "voedingslog/search_products",
        query: q,
        online,
      });
      this.results = res.products || [];
      this.source = online ? "online" : "local";
    } catch (e) {
      console.error("Product search failed:", e);
    }
    this.searching = false;
    this.host.requestUpdate();
  }

  /**
   * Render a search bar with results list.
   * @param onSelect - called when a product is clicked
   * @param options.showOnlineButton - show "Zoek online" button (default true)
   * @param options.renderExtra - extra content after each result (e.g. fav toggle)
   */
  renderSearchBar(
    onSelect: (p: Product) => void,
    options: {
      showOnlineButton?: boolean;
      renderResult?: (p: Product) => TemplateResult;
      placeholder?: string;
    } = {},
  ): TemplateResult {
    const { showOnlineButton = true, renderResult, placeholder = "Productnaam..." } = options;

    return html`
      <div class="input-row">
        <input type="text" placeholder=${placeholder}
          .value=${this.query}
          @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value; this.host.requestUpdate(); }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") this.search(); }}
        />
        <button class="btn-primary" @click=${() => this.search()}>Zoek</button>
      </div>
      ${this.searching
        ? html`<div class="search-loading"><ha-circular-progress indeterminate size="small"></ha-circular-progress> Zoeken...</div>`
        : nothing}
      <div class="search-results">
        ${this.results.map((p) =>
          renderResult
            ? renderResult(p)
            : html`
              <div class="search-result">
                <div class="search-result-main" @click=${() => onSelect(p)}>
                  <span class="result-name">${p.name}</span>
                  <span class="result-meta">${Math.round(p.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g</span>
                </div>
              </div>
            `
        )}
      </div>
      ${showOnlineButton && this.source === "local" && this.query.trim()
        ? html`<button class="btn-secondary search-online-btn" @click=${() => this.search(true)}>
            <ha-icon icon="mdi:cloud-search"></ha-icon> Zoek online (Open Food Facts)
          </button>`
        : nothing}
    `;
  }
}
