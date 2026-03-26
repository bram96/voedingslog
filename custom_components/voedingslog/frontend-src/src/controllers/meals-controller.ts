/**
 * Meals controller — custom meal/recipe management.
 */
import { html, nothing, type TemplateResult } from "lit";
import type {
  MealIngredient,
  Product,
  Portion,
  CustomMeal,
  VoedingslogConfig,
  GetMealsResponse,
  SaveMealResponse,
  DialogMode,
} from "../types.js";
export interface MealsControllerHost {
  hass: { callWS<T = unknown>(msg: Record<string, unknown>): Promise<T> };
  shadowRoot: ShadowRoot | null;
  _config: VoedingslogConfig | null;
  _dialogMode: DialogMode;
  requestUpdate(): void;
  _closeDialog(): void;
  _setDialogMode(mode: string): void;
  _selectProduct(product: Product): void;
  _openSearchDialog(callback: (p: Product) => void, returnMode?: DialogMode): Promise<void>;
  _openBatchAdd(mode: "log" | "meal"): void;
}

export class MealsController {
  host: MealsControllerHost;
  meals: CustomMeal[] = [];
  editingMeal: CustomMeal | null = null;
  editingIngredientIndex: number | null = null;
  searchQuery = "";
  showFavoritesOnly = false;

  constructor(host: MealsControllerHost) {
    this.host = host;
  }

  reset(): void {
    this.editingMeal = null;
    this.editingIngredientIndex = null;
    this.searchQuery = "";
  }

  private _filteredMeals(): CustomMeal[] {
    let result = this.meals;
    if (this.showFavoritesOnly) {
      result = result.filter((m) => m.favorite);
    }
    const q = this.searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter((m) => m.name.toLowerCase().includes(q));
    }
    return result;
  }

  renderMealsDialog(): TemplateResult {
    const h = this.host;
    const filtered = this._filteredMeals();
    return html`
      <div class="dialog-header">
        <h2>Recepten</h2>
        <button class="close-btn" @click=${() => h._closeDialog()}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="input-row" style="margin-bottom:12px">
          <input type="text" placeholder="Zoek recept..."
            .value=${this.searchQuery}
            @input=${(e: Event) => { this.searchQuery = (e.target as HTMLInputElement).value; h.requestUpdate(); }} />
          <button class="btn-secondary ${this.showFavoritesOnly ? "active" : ""}" style="padding:8px 12px"
            @click=${() => { this.showFavoritesOnly = !this.showFavoritesOnly; h.requestUpdate(); }}>
            <ha-icon icon=${this.showFavoritesOnly ? "mdi:star" : "mdi:star-outline"}></ha-icon>
          </button>
        </div>
        ${filtered.length === 0
          ? html`<p class="empty-hint">${this.meals.length === 0
              ? "Nog geen recepten. Maak een recept aan om snel te kunnen loggen."
              : "Geen recepten gevonden."}</p>`
          : filtered.map(
              (meal) => html`
                <div class="meal-item">
                  <div class="meal-info" @click=${() => this.logMeal(meal)}>
                    <span class="meal-name">${meal.name}</span>
                    <span class="meal-meta">
                      ${meal.ingredients.length} ingrediënten · ${Math.round(meal.total_grams)}g totaal ·
                      ${Math.round((meal.nutrients_per_100g?.["energy-kcal_100g"] || 0) * meal.total_grams / 100)} kcal
                    </span>
                  </div>
                  <button class="fav-btn" @click=${(e: Event) => { e.stopPropagation(); this.toggleFavorite(meal); }}>
                    <ha-icon icon=${meal.favorite ? "mdi:star" : "mdi:star-outline"}></ha-icon>
                  </button>
                  <button class="item-edit" @click=${() => this.openEditor(meal)}>
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                  <button class="item-delete" @click=${() => this.deleteMeal(meal.id)}>
                    <ha-icon icon="mdi:close"></ha-icon>
                  </button>
                </div>
              `
            )}
        <button class="btn-primary btn-confirm" style="margin-top:12px" @click=${() => this.openEditor(null)}>
          <ha-icon icon="mdi:plus"></ha-icon>
          Nieuw recept
        </button>
      </div>
    `;
  }

  renderEditDialog(): TemplateResult {
    const h = this.host;
    const meal = this.editingMeal;
    const ingredients = meal?.ingredients || [];
    return html`
      <div class="dialog-header">
        <h2>${meal?.id ? "Recept bewerken" : "Nieuw recept"}</h2>
        <button class="close-btn" @click=${() => { h._setDialogMode("meals"); this.editingMeal = null; h.requestUpdate(); }}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
      <div class="dialog-body">
        <div class="form-field">
          <label>Naam</label>
          <input type="text" id="meal-name-input" .value=${meal?.name || ""} placeholder="Bijv. Macaroni" />
        </div>

        <div class="form-field">
          <label>Standaard portie (gram)</label>
          <input type="number" id="meal-portion-input" .value=${String(meal?.preferred_portion || "")}
            placeholder="Bijv. 400" min="1" step="1" inputmode="numeric" />
        </div>

        <div class="meal-ingredients-section">
          <label class="section-label">Ingrediënten</label>
          ${ingredients.map(
            (ing, idx) => html`
              <div class="ingredient-row">
                <span class="ingredient-name" @click=${() => this.toggleIngredientEdit(idx)}
                  style="cursor:pointer;flex:1">${ing.name}</span>
                <input type="number" class="ingredient-grams-input" .value=${String(ing.grams)}
                  min="1" step="1" inputmode="numeric"
                  @change=${(e: Event) => this.updateIngredientGrams(idx, parseFloat((e.target as HTMLInputElement).value))} />
                <span class="ingredient-unit">g</span>
                <button class="item-edit" @click=${() => this.toggleIngredientEdit(idx)}>
                  <ha-icon icon="mdi:pencil"></ha-icon>
                </button>
                <button class="item-delete" @click=${() => this.removeIngredient(idx)}>
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
              </div>
              ${this.editingIngredientIndex === idx ? html`
                <div class="ingredient-nutrients">
                  <div class="form-field form-field-inline">
                    <label>Naam</label>
                    <input type="text" .value=${ing.name}
                      @change=${(e: Event) => this.updateIngredientName(idx, (e.target as HTMLInputElement).value)} />
                  </div>
                  ${Object.entries(h._config?.nutrients || {}).map(
                    ([key, meta]) => html`
                      <div class="form-field form-field-inline">
                        <label>${meta.label} (${meta.unit}/100g)</label>
                        <input type="number" .value=${String((ing.nutrients?.[key] || 0).toFixed(2))}
                          min="0" step="0.01" inputmode="decimal"
                          @change=${(e: Event) => this.updateIngredientNutrient(idx, key, parseFloat((e.target as HTMLInputElement).value))} />
                      </div>
                    `
                  )}
                </div>
              ` : nothing}
            `
          )}

          <button class="btn-secondary" style="width:100%;margin-top:8px" @click=${() => this.openIngredientSearch()}>
            <ha-icon icon="mdi:plus"></ha-icon> Ingrediënt zoeken
          </button>
        </div>

        ${!!h._config?.ai_task_entity ? html`
          <button class="btn-secondary btn-confirm" @click=${() => this.openAiIngredients()}>
            <ha-icon icon="mdi:text-box-outline"></ha-icon>
            AI ingrediënten invoer
          </button>
        ` : nothing}

        <button class="btn-primary btn-confirm" @click=${() => this.save()}>
          <ha-icon icon="mdi:check"></ha-icon>
          Opslaan
        </button>
      </div>
    `;
  }

  // ── Actions ──────────────────────────────────────────────────

  async loadMeals(): Promise<void> {
    try {
      const res = await this.host.hass.callWS<GetMealsResponse>({ type: "voedingslog/get_meals" });
      this.meals = res.meals || [];
    } catch (e) {
      console.error("Failed to load meals:", e);
    }
    this.host._setDialogMode("meals");
  }

  openEditor(meal: CustomMeal | null): void {
    this.editingMeal = meal
      ? { ...meal, ingredients: [...meal.ingredients] }
      : { id: "", name: "", ingredients: [], total_grams: 0, nutrients_per_100g: {} };

    this.host._setDialogMode("meal-edit");
  }

  logMeal(meal: CustomMeal): void {
    const defaultGrams = meal.preferred_portion || meal.total_grams;
    const portions: Portion[] = [];
    if (meal.preferred_portion) {
      portions.push({ label: `Portie (${Math.round(meal.preferred_portion)}g)`, grams: meal.preferred_portion });
    }
    portions.push({ label: `Heel recept (${Math.round(meal.total_grams)}g)`, grams: meal.total_grams });
    if (defaultGrams !== 100 && meal.total_grams !== 100) {
      portions.push({ label: "100g", grams: 100 });
    }
    const product: Product = {
      name: meal.name,
      serving_grams: defaultGrams,
      portions,
      nutrients: meal.nutrients_per_100g,
    };
    this.host._selectProduct(product);
  }

  openAiIngredients(): void {
    this.host._openBatchAdd("meal");
  }

  openIngredientSearch(): void {
    this.host._openSearchDialog(
      (p) => this.addIngredient(p),
      "meal-edit",
    );
  }

  addIngredient(product: Product): void {
    if (!this.editingMeal) return;
    const grams = product.serving_grams || 100;
    const ingredient: MealIngredient = { name: product.name, grams, nutrients: product.nutrients };
    this.editingMeal = {
      ...this.editingMeal,
      ingredients: [...this.editingMeal.ingredients, ingredient],
    };

    this.host.requestUpdate();
  }

  addIngredientFromAi(ingredient: MealIngredient): void {
    if (!this.editingMeal) return;
    this.editingMeal = {
      ...this.editingMeal,
      ingredients: [...this.editingMeal.ingredients, ingredient],
    };
    this.host.requestUpdate();
  }

  toggleIngredientEdit(index: number): void {
    this.editingIngredientIndex = this.editingIngredientIndex === index ? null : index;
    this.host.requestUpdate();
  }

  updateIngredientName(index: number, name: string): void {
    if (!this.editingMeal || !name.trim()) return;
    const ingredients = [...this.editingMeal.ingredients];
    ingredients[index] = { ...ingredients[index], name: name.trim() };
    this.editingMeal = { ...this.editingMeal, ingredients };
    this.host.requestUpdate();
  }

  updateIngredientNutrient(index: number, key: string, value: number): void {
    if (!this.editingMeal) return;
    const ingredients = [...this.editingMeal.ingredients];
    const nutrients = { ...ingredients[index].nutrients, [key]: value || 0 };
    ingredients[index] = { ...ingredients[index], nutrients };
    this.editingMeal = { ...this.editingMeal, ingredients };
    this.host.requestUpdate();
  }

  updateIngredientGrams(index: number, grams: number): void {
    if (!this.editingMeal || !grams || grams <= 0) return;
    const ingredients = [...this.editingMeal.ingredients];
    ingredients[index] = { ...ingredients[index], grams };
    this.editingMeal = { ...this.editingMeal, ingredients };
    this.host.requestUpdate();
  }

  removeIngredient(index: number): void {
    if (!this.editingMeal) return;
    const ingredients = [...this.editingMeal.ingredients];
    ingredients.splice(index, 1);
    this.editingMeal = { ...this.editingMeal, ingredients };
    this.host.requestUpdate();
  }

  toggleFavorite(meal: CustomMeal): void {
    meal.favorite = !meal.favorite;
    // Persist favorite state by saving the meal
    this.host.hass.callWS<SaveMealResponse>({
      type: "voedingslog/save_meal",
      meal: { id: meal.id, name: meal.name, ingredients: meal.ingredients, preferred_portion: meal.preferred_portion, favorite: meal.favorite },
    }).catch((e) => console.error("Failed to save favorite:", e));
    this.host.requestUpdate();
  }

  async save(): Promise<void> {
    const h = this.host;
    if (!this.editingMeal) return;
    const nameInput = h.shadowRoot?.getElementById("meal-name-input") as HTMLInputElement | null;
    const name = nameInput?.value?.trim();
    if (!name) { alert("Vul een naam in."); return; }
    if (this.editingMeal.ingredients.length === 0) { alert("Voeg minimaal één ingrediënt toe."); return; }

    const portionInput = h.shadowRoot?.getElementById("meal-portion-input") as HTMLInputElement | null;
    const preferredPortion = parseFloat(portionInput?.value || "") || undefined;

    try {
      await h.hass.callWS<SaveMealResponse>({
        type: "voedingslog/save_meal",
        meal: {
          id: this.editingMeal.id || undefined,
          name,
          ingredients: this.editingMeal.ingredients,
          preferred_portion: preferredPortion,
        },
      });
      await this.loadMeals();
    } catch (e) {
      console.error("Failed to save meal:", e);
      alert("Fout bij opslaan.");
    }
  }

  async deleteMeal(mealId: string): Promise<void> {
    if (!confirm("Recept verwijderen?")) return;
    try {
      await this.host.hass.callWS({ type: "voedingslog/delete_meal", meal_id: mealId });
      this.meals = this.meals.filter((m) => m.id !== mealId);
      this.host.requestUpdate();
    } catch (e) {
      console.error("Failed to delete meal:", e);
    }
  }
}
