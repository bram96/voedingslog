import { html, nothing, type TemplateResult } from "lit";
import type { MealCategory, ParsedProduct, Product, VoedingslogConfig } from "../types.js";
import { KEY_NUTRIENTS_DISPLAY } from "../helpers/nutrients.js";
import { DEFAULT_CATEGORY_LABELS, defaultCategory } from "../helpers/categories.js";
import { renderDialogHeader } from "../ui/dialog-header.js";

interface ValidateViewParams {
  products: ParsedProduct[];
  index: number;
  validateMode: "log" | "recipe";
  validateSearch: string;
  validateSearchResults: Product[];
  config: VoedingslogConfig | null;
  onClose: () => void;
  onDone: () => void;
  onSkip: () => void;
  onConfirm: () => void;
  onSearchInput: (value: string) => void;
  onSearchLocal: () => void;
  onSearchOnline: () => void;
  onAiGuess?: () => void;
  onSelectProduct: (p: Product) => void;
  onAcceptSuggestion: () => void;
}

export function renderValidateView(params: ValidateViewParams): TemplateResult {
  const { products, index, validateMode, validateSearch, validateSearchResults, config, onClose, onDone, onSkip, onConfirm, onSearchInput, onSearchLocal, onSearchOnline, onAiGuess, onSelectProduct, onAcceptSuggestion } = params;

  if (!products.length) return html``;
  if (index >= products.length) {
    return html`
      ${renderDialogHeader("Klaar!", onClose)}
      <div class="dialog-body">
        <p>Alle producten zijn verwerkt.</p>
        <button class="btn-primary btn-confirm" @click=${onDone}>Sluiten</button>
      </div>
    `;
  }

  const product = products[index];
  const pct = Math.round((index / products.length) * 100);

  return html`
    ${renderDialogHeader(`Product ${index + 1} van ${products.length}`, onClose)}
    <div class="dialog-body">
      <div class="ai-validate-progress">
        <div class="ai-validate-bar">
          <div class="ai-validate-fill" style="width:${pct}%"></div>
        </div>
        <span>${index + 1}/${products.length}</span>
      </div>

      <div class="ai-context">AI herkende: <strong>${product.ai_name || product.name}</strong></div>

      ${!product.matched
        ? html`
          <div class="ai-warning">Niet gevonden in database — zoek een product of sla over</div>
          ${(product as any).suggested_product ? html`
            <button class="btn-secondary btn-confirm" style="margin-top:4px" @click=${onAcceptSuggestion}>
              <ha-icon icon="mdi:lightbulb-outline"></ha-icon>
              Bedoel je "${(product as any).suggested_product}"?
            </button>
          ` : nothing}
        `
        : nothing}

      <div class="ai-validate-search">
        <input type="text" placeholder="Zoek ander product..."
          .value=${validateSearch}
          @input=${(e: Event) => onSearchInput((e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") onSearchLocal(); }} />
        <div style="display:flex;gap:4px;margin-top:4px">
          <button class="btn-secondary" style="flex:1;padding:6px;font-size:13px" @click=${onSearchLocal}>Zoek lokaal</button>
          <button class="btn-secondary" style="flex:1;padding:6px;font-size:13px" @click=${onSearchOnline}>Zoek online</button>
          ${onAiGuess ? html`<button class="btn-secondary" style="flex:1;padding:6px;font-size:13px" @click=${onAiGuess}>
            <ha-icon icon="mdi:robot" style="--mdc-icon-size:14px"></ha-icon> AI
          </button>` : nothing}
        </div>
        ${validateSearchResults.length > 0 ? html`
          <div class="search-results">
            ${validateSearchResults.map((r) => html`
              <div class="search-result">
                <div class="search-result-main" @click=${() => onSelectProduct(r)}>
                  <span class="result-name">${r.name}</span>
                  <span class="result-meta">${Math.round(r.nutrients?.["energy-kcal_100g"] || 0)} kcal/100g</span>
                </div>
              </div>
            `)}
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

      ${validateMode === "log" ? html`
        <div class="form-field">
          <label>Maaltijd</label>
          <select id="ai-validate-category">
            ${(["breakfast", "lunch", "dinner", "snack"] as MealCategory[]).map(
              (cat) => html`
                <option value=${cat} ?selected=${cat === defaultCategory()}>
                  ${(config?.category_labels || DEFAULT_CATEGORY_LABELS)[cat]}
                </option>
              `
            )}
          </select>
        </div>
      ` : nothing}

      <div class="ai-validate-actions">
        <button class="btn-secondary btn-confirm" @click=${onSkip}>Overslaan</button>
        <button class="btn-primary btn-confirm" @click=${onConfirm} ?disabled=${!product.matched}>
          ${validateMode === "recipe" ? "Ingrediënt toevoegen" : "Bevestigen"}
        </button>
      </div>
    </div>
  `;
}
