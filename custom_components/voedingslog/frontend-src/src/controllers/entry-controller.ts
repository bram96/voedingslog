/**
 * Entry controller — weight/portion selection and item edit dialogs.
 */
import { nothing, type TemplateResult } from "lit";
import type {
  HomeAssistant,
  MealCategory,
  MealIngredient,
  Product,
  IndexedLogItem,
  VoedingslogConfig,
} from "../types.js";
import { KEY_NUTRIENTS_DISPLAY, defaultCategory, NUTRIENTS_META } from "../helpers.js";
import { renderWeightView } from "../views/weight-view.js";
import { renderEditView } from "../views/edit-view.js";

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
  _navigateBack(): void;
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
    if (isComponent && !this._pendingComponents) {
      this._pendingComponents = p.components!.map((c) => ({ ...c }));
    }

    return renderWeightView({
      product: p,
      components: this._pendingComponents,
      config: h._config,
      selectedDate: h._selectedDate,
      shadow: h.shadowRoot,
      onClose: () => { this._pendingComponents = null; h._navigateBack(); },
      onConfirm: () => this.confirmLog(),
      onComponentChange: (idx, grams) => {
        if (!this._pendingComponents) return;
        this._pendingComponents[idx] = { ...this._pendingComponents[idx], grams };
        this._pendingComponents = [...this._pendingComponents];
      },
      requestUpdate: () => h.requestUpdate(),
    });
  }

  async confirmLog(): Promise<void> {
    const h = this.host;
    const p = h._pendingProduct;
    if (!p) return;

    const catSelect = h.shadowRoot?.getElementById("category-select") as HTMLSelectElement | null;
    const dateInput = h.shadowRoot?.getElementById("log-date-input") as HTMLInputElement | null;
    const nameInput = h.shadowRoot?.getElementById("product-name-override") as HTMLInputElement | null;
    const category = (catSelect?.value as MealCategory) || defaultCategory();
    const logDate = dateInput?.value || h._selectedDate;
    const logName = nameInput?.value?.trim() || p.name;

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
          name: logName,
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
        name: logName,
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
    return renderEditView({
      item,
      config: h._config,
      selectedDate: h._selectedDate,
      onClose: () => h._closeDialog(),
      onConfirm: () => this.confirmEdit(),
    });
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
      if (input) {
        const displayVal = parseFloat(input.value) || 0;
        const factor = NUTRIENTS_META[key] || 1;
        nutrients[key] = displayVal / factor;
      }
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
