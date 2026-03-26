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
}

export interface IndexedLogItem extends LogItem {
  _index: number;
}

export interface Portion {
  label: string;
  grams: number;
}

export interface Product {
  name: string;
  serving_grams: number;
  portions?: Portion[];
  nutrients: NutrientMap;
}

export interface VoedingslogConfig {
  persons: string[];
  calories_goal: number;
  sodium_goal_mg: number;
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

export interface MealIngredient {
  name: string;
  grams: number;
  nutrients: NutrientMap;
}

export interface CustomMeal {
  id: string;
  name: string;
  ingredients: MealIngredient[];
  total_grams: number;
  nutrients_per_100g: NutrientMap;
  preferred_portion?: number;
}

export interface GetMealsResponse {
  meals: CustomMeal[];
}

export interface SaveMealResponse {
  meal: CustomMeal;
}

export interface NutrientDisplayConfig {
  key: string;
  label: string;
  unit: string;
  decimals: number;
}

type DialogMode = "add-chooser" | "barcode" | "search" | "photo" | "weight" | "edit" | "meals" | "meal-edit" | "manual" | "day-detail" | null;
export type { DialogMode };
