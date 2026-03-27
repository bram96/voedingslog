/**
 * Entry controller — weight/portion selection and item edit dialogs.
 */
import { html, nothing, type TemplateResult } from "lit";
import type {
  HomeAssistant,
  MealCategory,
  MealIngredient,
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
  /** Mutable copy of component grams for the weight dialog. */
  private _pendingComponents: MealIngredient[] | null = null;

  constructor(host: EntryControllerHost) {
    this.host = host;
  }

  // ── Weight / portion dialog ──────────────────────────────────

  renderWeightDialog(): TemplateResult | typeof nothing {
    const h = this.host;
    const p = h._pendingProduct;
    if (!p) return nothing;

    const isComponent = !!p.components?.length;

    // Lazily initialize mutable component copy
    if (isComponent && !this._pendingComponents) {
      this._pendingComponents = p.components!.map((c) => ({ ...c }));
    }

    return html`
      <div class="dialog-header">
        <h2>${p.name}</h2>
        <button class="close-btn" @click=${() => { this._pendingComponents = null; h._closeDialog(); }}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        ${isComponent
          ? this._renderComponentWeightSection()
          : this._renderSimpleWeightSection(p)}

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

  private _renderSimpleWeightSection(p: Product): TemplateResult {
    const h = this.host;
    return html`
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
    `;
  }

  private _renderComponentWeightSection(): TemplateResult {
    const h = this.host;
    const components = this._pendingComponents || [];
    const totalGrams = components.reduce((sum, c) => sum + c.grams, 0);

    return html`
      <div class="component-list">
        <div class="preview-title">Onderdelen</div>
        ${components.map(
          (c, idx) => html`
            <div class="component-row">
              <span class="component-name">${c.name}</span>
              <input type="number" class="component-grams-input"
                .value=${String(c.grams)} min="0" step="1" inputmode="numeric"
                @change=${(e: Event) => {
                  const val = parseFloat((e.target as HTMLInputElement).value) || 0;
                  components[idx] = { ...components[idx], grams: val };
                  this._pendingComponents = [...components];
                  h.requestUpdate();
                }} />
              <span class="ingredient-unit">g</span>
            </div>
          `
        )}
        <div class="component-total">
          <span>Totaal</span>
          <span>${Math.round(totalGrams)}g</span>
        </div>
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

    const catSelect = h.shadowRoot?.getElementById("category-select") as HTMLSelectElement | null;
    const dateInput = h.shadowRoot?.getElementById("log-date-input") as HTMLInputElement | null;
    const category = (catSelect?.value as MealCategory) || defaultCategory();
    const logDate = dateInput?.value || h._selectedDate;

    // Component recipe: use component grams, compute totals
    if (this._pendingComponents?.length) {
      const components = this._pendingComponents;
      const totalGrams = components.reduce((sum, c) => sum + c.grams, 0);
      // Compute nutrients per 100g from components
      const nutrients: Record<string, number> = {};
      if (totalGrams > 0) {
        for (const n of KEY_NUTRIENTS_DISPLAY) {
          const totalValue = components.reduce(
            (sum, c) => sum + (c.nutrients?.[n.key] || 0) * c.grams / 100, 0
          );
          nutrients[n.key] = totalValue / totalGrams * 100;
        }
        // Also compute all nutrient keys from config
        for (const key of Object.keys(h._config?.nutrients || {})) {
          if (!(key in nutrients)) {
            const totalValue = components.reduce(
              (sum, c) => sum + (c.nutrients?.[key] || 0) * c.grams / 100, 0
            );
            nutrients[key] = totalValue / totalGrams * 100;
          }
        }
      }

      try {
        await h.hass.callWS({
          type: "voedingslog/log_product",
          person: h._selectedPerson,
          name: p.name,
          grams: totalGrams,
          nutrients,
          category,
          date: logDate,
          components,
        });
        this._pendingComponents = null;
        h._selectedDate = logDate;
        h._closeDialog();
        await h._loadLog();
      } catch (e) {
        console.error("Failed to log component recipe:", e);
        alert("Fout bij opslaan.");
      }
      return;
    }

    // Simple product / fixed recipe
    const gramsInput = h.shadowRoot?.getElementById("weight-input") as HTMLInputElement | null;
    const grams = parseFloat(gramsInput?.value || "") || 100;

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

    const hasComponents = !!item.components?.length;

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

        ${hasComponents
          ? this._renderComponentEditSection(item.components!)
          : html`
            <div class="form-field">
              <label>Gewicht (gram)</label>
              <input type="number" id="edit-weight-input"
                .value=${String(item.grams)} min="1" step="1"
                inputmode="numeric" @input=${() => h.requestUpdate()} />
            </div>
          `}

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

        ${!hasComponents ? html`
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
        ` : nothing}

        <button class="btn-primary btn-confirm" @click=${() => this.confirmEdit()}>
          <ha-icon icon="mdi:check"></ha-icon>
          Opslaan
        </button>
      </div>
    `;
  }

  private _renderComponentEditSection(components: MealIngredient[]): TemplateResult {
    return html`
      <div class="component-list">
        <div class="preview-title">Onderdelen</div>
        ${components.map(
          (c, idx) => html`
            <div class="component-row">
              <span class="component-name">${c.name}</span>
              <input type="number" class="component-grams-input"
                id="edit-component-${idx}"
                .value=${String(c.grams)} min="0" step="1" inputmode="numeric" />
              <span class="ingredient-unit">g</span>
            </div>
          `
        )}
      </div>
    `;
  }

  async confirmEdit(): Promise<void> {
    const h = this.host;
    const item = h._editingItem;
    if (!item) return;

    const nameInput = h.shadowRoot?.getElementById("edit-name-input") as HTMLInputElement | null;
    const catSelect = h.shadowRoot?.getElementById("edit-category-select") as HTMLSelectElement | null;
    const dateInput = h.shadowRoot?.getElementById("edit-date-input") as HTMLInputElement | null;

    const name = nameInput?.value || item.name;
    const category = (catSelect?.value as MealCategory) || item.category;
    const newDate = dateInput?.value || h._selectedDate;

    // Component edit: read updated grams from inputs
    if (item.components?.length) {
      const updatedComponents: MealIngredient[] = item.components.map((c, idx) => {
        const input = h.shadowRoot?.getElementById(`edit-component-${idx}`) as HTMLInputElement | null;
        const grams = parseFloat(input?.value || "") || c.grams;
        return { ...c, grams };
      });

      try {
        if (newDate !== h._selectedDate) {
          await h.hass.callWS({
            type: "voedingslog/delete_item",
            person: h._selectedPerson,
            index: item._index,
            date: h._selectedDate,
          });
          // Compute nutrients for new log entry
          const totalGrams = updatedComponents.reduce((sum, c) => sum + c.grams, 0);
          const nutrients: Record<string, number> = {};
          if (totalGrams > 0) {
            for (const key of Object.keys(h._config?.nutrients || {})) {
              const totalValue = updatedComponents.reduce(
                (sum, c) => sum + (c.nutrients?.[key] || 0) * c.grams / 100, 0
              );
              nutrients[key] = totalValue / totalGrams * 100;
            }
          }
          await h.hass.callWS({
            type: "voedingslog/log_product",
            person: h._selectedPerson,
            name, grams: totalGrams, nutrients, category,
            date: newDate,
            components: updatedComponents,
          });
        } else {
          await h.hass.callWS({
            type: "voedingslog/edit_item",
            person: h._selectedPerson,
            index: item._index,
            name, category,
            date: h._selectedDate,
            components: updatedComponents,
          });
        }
        h._closeDialog();
        await h._loadLog();
      } catch (e) {
        console.error("Failed to edit component item:", e);
        alert("Fout bij bewerken.");
      }
      return;
    }

    // Simple item edit
    const gramsInput = h.shadowRoot?.getElementById("edit-weight-input") as HTMLInputElement | null;
    const grams = parseFloat(gramsInput?.value || "") || item.grams;

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
