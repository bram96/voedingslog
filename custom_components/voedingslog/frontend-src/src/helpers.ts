import type {
  MealCategory,
  LogItem,
  IndexedLogItem,
  NutrientMap,
  NutrientDisplayConfig,
} from "./types.js";

export const CATEGORY_ICONS: Record<MealCategory, string> = {
  breakfast: "mdi:coffee",
  lunch: "mdi:food",
  dinner: "mdi:silverware-fork-knife",
  snack: "mdi:cookie",
};

export const DEFAULT_CATEGORY_LABELS: Record<MealCategory, string> = {
  breakfast: "Ontbijt",
  lunch: "Lunch",
  dinner: "Avondeten",
  snack: "Tussendoor",
};

export const KEY_NUTRIENTS_DISPLAY: NutrientDisplayConfig[] = [
  { key: "energy-kcal_100g", label: "Kcal", unit: "kcal", decimals: 0 },
  { key: "proteins_100g", label: "Eiwit", unit: "g", decimals: 1 },
  { key: "carbohydrates_100g", label: "Koolh.", unit: "g", decimals: 1 },
  { key: "fat_100g", label: "Vet", unit: "g", decimals: 1 },
];

export function defaultCategory(): MealCategory {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h < 17) return "snack";
  return "dinner";
}

export function groupByCategory(
  items: LogItem[]
): Record<MealCategory, IndexedLogItem[]> {
  const groups: Record<MealCategory, IndexedLogItem[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  items.forEach((item, index) => {
    const cat: MealCategory = item.category || "snack";
    if (groups[cat]) {
      groups[cat].push({ ...item, _index: index });
    }
  });
  return groups;
}

export function calcItemNutrients(item: LogItem): NutrientMap {
  const factor = (item.grams || 0) / 100;
  const result: NutrientMap = {};
  for (const n of KEY_NUTRIENTS_DISPLAY) {
    result[n.key] = (item.nutrients?.[n.key] || 0) * factor;
  }
  return result;
}

export function sumNutrients(items: LogItem[]): NutrientMap {
  const totals: NutrientMap = {};
  for (const n of KEY_NUTRIENTS_DISPLAY) totals[n.key] = 0;
  for (const item of items) {
    const vals = calcItemNutrients(item);
    for (const k in vals) totals[k] += vals[k];
  }
  return totals;
}
