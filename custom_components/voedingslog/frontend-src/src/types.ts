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

export interface Product {
  name: string;
  serving_grams: number;
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

export interface NutrientDisplayConfig {
  key: string;
  label: string;
  unit: string;
  decimals: number;
}

type DialogMode = "barcode" | "search" | "photo" | "weight" | null;
export type { DialogMode };
