/**
 * Barrel re-export for backwards compatibility.
 * Import from helpers/nutrients, helpers/categories, or helpers/dates directly for new code.
 */
export {
  KEY_NUTRIENTS_DISPLAY,
  NUTRIENTS_META,
  EDITABLE_NUTRIENTS,
  calcItemNutrients,
  itemKcal,
  sumNutrients,
} from "./helpers/nutrients.js";
export type { EditableNutrientField } from "./helpers/nutrients.js";

export {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_LABELS,
  defaultCategory,
  groupByCategory,
} from "./helpers/categories.js";

export { formatDateLabel, toDateStr, shortDay } from "./helpers/dates.js";
