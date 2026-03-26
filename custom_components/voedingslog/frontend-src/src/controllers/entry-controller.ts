/**
 * Entry controller — weight/portion selection and item edit dialogs.
 */
import { html, nothing, type TemplateResult } from "lit";
import type {
  HomeAssistant,
  MealCategory,
  Product,
  Portion,
  IndexedLogItem,
  VoedingslogConfig,
} from "../types.js";
import { KEY_NUTRIENTS_DISPLAY, DEFAULT_CATEGORY_LABELS, defaultCategory } from "../helpers.js";

export interface EntryControllerHost {
  hass: HomeAssistant;
  shadowRoot: ShadowRoot | null;
  _config: VoedingslogConfig | null;
  _selectedPerson: string | null;
  _selectedDate: string;
  _pendingProduct: Product | null;
  _editingItem: IndexedLogItem | null;
  requestUpdate(): void;
  _closeDialog(): void;
  _setDialogMode(mode: string): void;
  _loadLog(): Promise<void>;
}

export class EntryController {
  host: EntryControllerHost;

  constructor(host: EntryControllerHost) {
    this.host = host;
  }

  // ── Weight / portion dialog ──────────────────────────────────

  renderWeightDialog(): TemplateResult | typeof nothing {
    const h = this.host;
    const p = h._pendingProduct;
    if (!p) return nothing;

    return html`
      <div class="dialog-header">
        <h2>${p.name}</h2>
        <button class="close-btn" @click=${() => h._closeDialog()}>
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
          <input type="number" id="weight-input"
            .value=${String(p.serving_grams || 100)}
            min="1" step="1" inputmode="numeric"
            @input=${() => h.requestUpdate()} />
        </div>

        <div class="form-field">
          <label>Maaltijd</label>
          <select id="category-select">
            ${(["breakfast", "lunch", "dinner", "snack"] as MealCategory[]).map(
              (cat) => html`
                <option value=${cat} ?selected=${cat === defaultCategory()}>
                  ${(h._config?.category_labels || DEFAULT_CATEGORY_LABELS)[cat]}
                </option>
              `
            )}
          </select>
        </div>

        <div class="form-field">
          <label>Datum</label>
          <input type="date" id="log-date-input" .value=${h._selectedDate} />
        </div>

        <button class="btn-primary btn-confirm" @click=${() => this.confirmLog()}>
          <ha-icon icon="mdi:plus"></ha-icon>
          Toevoegen
        </button>
      </div>
    `;
  }

  private _renderPortionChips(portions: Portion[]): TemplateResult | typeof nothing {
    if (!portions || portions.length === 0) return nothing;
    const h = this.host;
    return html`
      <div class="portion-chips">
        ${portions.map(
          (p) => html`
            <button class="portion-chip" @click=${() => {
              const input = h.shadowRoot?.getElementById("weight-input") as HTMLInputElement | null;
              if (input) { input.value = String(p.grams); h.requestUpdate(); }
            }}>
              ${p.label}
            </button>
          `
        )}
      </div>
    `;
  }

  async confirmLog(): Promise<void> {
    const h = this.host;
    const p = h._pendingProduct;
    if (!p) return;

    const gramsInput = h.shadowRoot?.getElementById("weight-input") as HTMLInputElement | null;
    const catSelect = h.shadowRoot?.getElementById("category-select") as HTMLSelectElement | null;
    const dateInput = h.shadowRoot?.getElementById("log-date-input") as HTMLInputElement | null;
    const grams = parseFloat(gramsInput?.value || "") || 100;
    const category = (catSelect?.value as MealCategory) || defaultCategory();
    const logDate = dateInput?.value || h._selectedDate;

    try {
      await h.hass.callWS({
        type: "voedingslog/log_product",
        person: h._selectedPerson,
        name: p.name,
        grams,
        nutrients: p.nutrients || {},
        category,
        date: logDate,
      });
      h._selectedDate = logDate;
      h._closeDialog();
      await h._loadLog();
    } catch (e) {
      console.error("Failed to log product:", e);
      alert("Fout bij opslaan.");
    }
  }

  // ── Edit item dialog ─────────────────────────────────────────

  renderEditDialog(): TemplateResult | typeof nothing {
    const h = this.host;
    const item = h._editingItem;
    if (!item) return nothing;

    return html`
      <div class="dialog-header">
        <h2>${item.name}</h2>
        <button class="close-btn" @click=${() => h._closeDialog()}>
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
          <input type="number" id="edit-weight-input"
            .value=${String(item.grams)} min="1" step="1"
            inputmode="numeric" @input=${() => h.requestUpdate()} />
        </div>

        <div class="form-field">
          <label>Maaltijd</label>
          <select id="edit-category-select">
            ${(["breakfast", "lunch", "dinner", "snack"] as MealCategory[]).map(
              (cat) => html`
                <option value=${cat} ?selected=${cat === item.category}>
                  ${(h._config?.category_labels || DEFAULT_CATEGORY_LABELS)[cat]}
                </option>
              `
            )}
          </select>
        </div>

        <div class="form-field">
          <label>Datum</label>
          <input type="date" id="edit-date-input" .value=${h._selectedDate} />
        </div>

        <div class="nutrient-edit-section">
          <div class="preview-title">Voedingswaarden per 100g</div>
          ${Object.entries(h._config?.nutrients || {}).map(
            ([key, meta]) => html`
              <div class="form-field form-field-inline">
                <label>${meta.label} (${meta.unit})</label>
                <input type="number" id="edit-nutrient-${key}"
                  .value=${String((item.nutrients?.[key] || 0).toFixed(2))}
                  min="0" step="0.01" inputmode="decimal" />
              </div>
            `
          )}
        </div>

        <button class="btn-primary btn-confirm" @click=${() => this.confirmEdit()}>
          <ha-icon icon="mdi:check"></ha-icon>
          Opslaan
        </button>
      </div>
    `;
  }

  async confirmEdit(): Promise<void> {
    const h = this.host;
    const item = h._editingItem;
    if (!item) return;

    const nameInput = h.shadowRoot?.getElementById("edit-name-input") as HTMLInputElement | null;
    const gramsInput = h.shadowRoot?.getElementById("edit-weight-input") as HTMLInputElement | null;
    const catSelect = h.shadowRoot?.getElementById("edit-category-select") as HTMLSelectElement | null;
    const dateInput = h.shadowRoot?.getElementById("edit-date-input") as HTMLInputElement | null;

    const name = nameInput?.value || item.name;
    const grams = parseFloat(gramsInput?.value || "") || item.grams;
    const category = (catSelect?.value as MealCategory) || item.category;
    const newDate = dateInput?.value || h._selectedDate;

    const nutrients: Record<string, number> = { ...item.nutrients };
    for (const key of Object.keys(h._config?.nutrients || {})) {
      const input = h.shadowRoot?.getElementById(`edit-nutrient-${key}`) as HTMLInputElement | null;
      if (input) nutrients[key] = parseFloat(input.value) || 0;
    }

    try {
      if (newDate !== h._selectedDate) {
        await h.hass.callWS({
          type: "voedingslog/delete_item",
          person: h._selectedPerson,
          index: item._index,
          date: h._selectedDate,
        });
        await h.hass.callWS({
          type: "voedingslog/log_product",
          person: h._selectedPerson,
          name, grams, nutrients, category,
          date: newDate,
        });
      } else {
        await h.hass.callWS({
          type: "voedingslog/edit_item",
          person: h._selectedPerson,
          index: item._index,
          name, grams, nutrients, category,
          date: h._selectedDate,
        });
      }
      h._closeDialog();
      await h._loadLog();
    } catch (e) {
      console.error("Failed to edit item:", e);
      alert("Fout bij bewerken.");
    }
  }
}
