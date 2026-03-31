import type { LogItem, NutrientMap, NutrientDisplayConfig } from "../types.js";

export const KEY_NUTRIENTS_DISPLAY: NutrientDisplayConfig[] = [
  { key: "energy-kcal_100g", label: "Kcal", unit: "kcal", decimals: 0 },
  { key: "proteins_100g", label: "Eiwit", unit: "g", decimals: 1 },
  { key: "carbohydrates_100g", label: "Koolh.", unit: "g", decimals: 1 },
  { key: "fat_100g", label: "Vet", unit: "g", decimals: 1 },
  { key: "fiber_100g", label: "Vezels", unit: "g", decimals: 1 },
];

/** Nutrient pages for the day totals card — swipe/tap to cycle through them. */
export const NUTRIENT_PAGES: { label: string; nutrients: NutrientDisplayConfig[] }[] = [
  {
    label: "Macro's",
    nutrients: [
      { key: "proteins_100g", label: "Eiwit", unit: "g", decimals: 1 },
      { key: "carbohydrates_100g", label: "Koolh.", unit: "g", decimals: 1 },
      { key: "fat_100g", label: "Vet", unit: "g", decimals: 1 },
      { key: "fiber_100g", label: "Vezels", unit: "g", decimals: 1 },
    ],
  },
  {
    label: "Detail",
    nutrients: [
      { key: "saturated-fat_100g", label: "Verz. vet", unit: "g", decimals: 1 },
      { key: "sugars_100g", label: "Suikers", unit: "g", decimals: 1 },
      { key: "sodium_100g", label: "Natrium", unit: "mg", decimals: 0 },
    ],
  },
  {
    label: "Vitaminen",
    nutrients: [
      { key: "vitamin-c_100g", label: "Vit. C", unit: "mg", decimals: 1 },
      { key: "calcium_100g", label: "Calcium", unit: "mg", decimals: 0 },
      { key: "iron_100g", label: "IJzer", unit: "mg", decimals: 1 },
      { key: "vitamin-d_100g", label: "Vit. D", unit: "µg", decimals: 1 },
    ],
  },
];

/** Factor to convert raw nutrient values to display units (e.g. sodium g → mg) */
export const NUTRIENTS_META: Record<string, number> = {
  "energy-kcal_100g": 1,
  "fat_100g": 1,
  "saturated-fat_100g": 1,
  "carbohydrates_100g": 1,
  "sugars_100g": 1,
  "fiber_100g": 1,
  "proteins_100g": 1,
  "sodium_100g": 1000,
  "vitamin-c_100g": 1000,
  "calcium_100g": 1000,
  "iron_100g": 1000,
  "vitamin-d_100g": 1000000,
};

export interface EditableNutrientField {
  key: string;
  label: string;
}

export const EDITABLE_NUTRIENTS: EditableNutrientField[] = [
  { key: "energy-kcal_100g", label: "Calorieën (kcal)" },
  { key: "fat_100g", label: "Vetten (g)" },
  { key: "saturated-fat_100g", label: "Verzadigd vet (g)" },
  { key: "carbohydrates_100g", label: "Koolhydraten (g)" },
  { key: "sugars_100g", label: "Waarvan suikers (g)" },
  { key: "fiber_100g", label: "Vezels (g)" },
  { key: "proteins_100g", label: "Eiwitten (g)" },
  { key: "sodium_100g", label: "Natrium (mg)" },
];

export function calcItemNutrients(item: LogItem): NutrientMap {
  const factor = (item.grams || 0) / 100;
  const result: NutrientMap = {};
  for (const key of Object.keys(item.nutrients || {})) {
    result[key] = (item.nutrients[key] || 0) * factor;
  }
  return result;
}

export function itemKcal(item: LogItem): number {
  return (item.nutrients?.["energy-kcal_100g"] || 0) * (item.grams || 0) / 100;
}

export function sumNutrients(items: LogItem[]): NutrientMap {
  const totals: NutrientMap = {};
  for (const item of items) {
    const vals = calcItemNutrients(item);
    for (const k in vals) {
      totals[k] = (totals[k] || 0) + vals[k];
    }
  }
  return totals;
}
