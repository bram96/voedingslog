import type { MealCategory, LogItem, IndexedLogItem } from "../types.js";

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
