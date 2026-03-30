/** Minimal typing for the Home Assistant frontend object. */
export interface HomeAssistant {
  callWS<T = unknown>(msg: Record<string, unknown>): Promise<T>;
  user: { id: string; name: string };
}

export type MealCategory = "breakfast" | "lunch" | "dinner" | "snack";

export interface NutrientMap {
  [key: string]: number;
}

export interface LogItem {
  name: string;
  grams: number;
  nutrients: NutrientMap;
  time: string;
  category: MealCategory;
  components?: MealIngredient[];
}

export interface IndexedLogItem extends LogItem {
  _index: number;
}

export interface Portion {
  label: string;
  grams: number;
}

export interface Product {
  id?: string;
  name: string;
  serving_grams: number;
  portions?: Portion[];
  nutrients: NutrientMap;
  favorite?: boolean;
  completeness?: number;
  /** Passed through when logging a component recipe. */
  components?: MealIngredient[];
}

export interface GetFavoritesResponse {
  products: Product[];
}

export interface MacroGoals {
  carbs: number;
  protein: number;
  fat: number;
  fiber: number;
}

export interface PersonGoals {
  calories_goal: number;
  macro_goals: MacroGoals;
}

export interface VoedingslogConfig {
  persons: string[];
  calories_goal: number;
  macro_goals: MacroGoals;
  person_goals?: Record<string, PersonGoals>;
  categories: MealCategory[];
  category_labels: Record<MealCategory, string>;
  nutrients: Record<string, { label: string; unit: string }>;
  ai_task_entity: string;
}

export interface GetLogResponse {
  items: LogItem[];
  totals: NutrientMap;
}

export interface LookupBarcodeResponse {
  product: Product | null;
}

export interface SearchProductsResponse {
  products: Product[];
}

export interface AnalyzePhotoResponse {
  product: Product | null;
}

export interface AiGuessNutrientsResponse {
  product: Product | null;
}

export interface MealIngredient {
  product_id?: string;
  name: string;
  grams: number;
  nutrients: NutrientMap;
}

// ── Unified product types ────────────────────────────────────────

export interface BaseProduct {
  id: string;
  type: "base";
  name: string;
  serving_grams: number;
  portions?: Portion[];
  nutrients: NutrientMap;
  barcode?: string;
  aliases?: string[];
  completeness?: number;
  last_used?: string;
  favorite?: boolean;
}

export interface Recipe {
  id: string;
  type: "recipe";
  recipe_type: "fixed" | "component";
  name: string;
  ingredients: MealIngredient[];
  total_grams: number;
  nutrients: NutrientMap;
  preferred_portion?: number;
  aliases?: string[];
  favorite?: boolean;
}

export type UnifiedProduct = BaseProduct | Recipe;

export interface GetProductsResponse {
  products: UnifiedProduct[];
}

export interface SaveProductResponse {
  product: UnifiedProduct;
}

export interface PeriodDay {
  date: string;
  totals: NutrientMap;
  item_count: number;
}

export interface GetPeriodResponse {
  days: PeriodDay[];
}

export interface NutrientDisplayConfig {
  key: string;
  label: string;
  unit: string;
  decimals: number;
}

export interface ParsedProduct extends Product {
  ai_name?: string;
  matched?: boolean;
  suggested_product?: string;
  suggested_product_id?: string;
}

export interface ParseFoodResponse {
  products: ParsedProduct[];
}

type DialogMode = "search" | "barcode" | "photo" | "weight" | "edit" | "products-add" | "product-edit" | "manual" | "day-detail" | "batch-add" | "ai-validate" | null;
export type { DialogMode };
