import { describe, it, expect } from "vitest";
import {
  groupByCategory,
  calcItemNutrients,
  itemKcal,
  sumNutrients,
  KEY_NUTRIENTS_DISPLAY,
  NUTRIENTS_META,
  EDITABLE_NUTRIENTS,
  formatDateLabel,
  toDateStr,
  shortDay,
} from "./helpers.js";
import type { LogItem, MealCategory } from "./types.js";

function makeItem(overrides: Partial<LogItem> = {}): LogItem {
  return {
    name: "Test",
    grams: 100,
    nutrients: {
      "energy-kcal_100g": 200, "proteins_100g": 10, "carbohydrates_100g": 30,
      "fat_100g": 8, "fiber_100g": 3, "saturated-fat_100g": 2, "sugars_100g": 5,
      "sodium_100g": 0.4, "vitamin-c_100g": 0.01, "calcium_100g": 0.05,
      "iron_100g": 0.002, "vitamin-d_100g": 0.000001,
    },
    time: "12:00",
    category: "lunch",
    ...overrides,
  };
}

describe("groupByCategory", () => {
  it("groups items by category", () => {
    const items: LogItem[] = [
      makeItem({ category: "breakfast", name: "A" }),
      makeItem({ category: "lunch", name: "B" }),
      makeItem({ category: "breakfast", name: "C" }),
    ];
    const groups = groupByCategory(items);
    expect(groups.breakfast).toHaveLength(2);
    expect(groups.lunch).toHaveLength(1);
    expect(groups.dinner).toHaveLength(0);
    expect(groups.snack).toHaveLength(0);
  });

  it("assigns _index from original array position", () => {
    const items: LogItem[] = [
      makeItem({ category: "lunch", name: "First" }),
      makeItem({ category: "lunch", name: "Second" }),
    ];
    const groups = groupByCategory(items);
    expect(groups.lunch[0]._index).toBe(0);
    expect(groups.lunch[1]._index).toBe(1);
  });

  it("defaults unknown category to snack", () => {
    const items: LogItem[] = [
      makeItem({ category: "unknown" as MealCategory }),
    ];
    const groups = groupByCategory(items);
    // Unknown categories are not in groups, so they get skipped
    const total = groups.breakfast.length + groups.lunch.length + groups.dinner.length + groups.snack.length;
    expect(total).toBe(0);
  });

  it("handles empty array", () => {
    const groups = groupByCategory([]);
    expect(groups.breakfast).toHaveLength(0);
    expect(groups.lunch).toHaveLength(0);
  });
});

describe("calcItemNutrients", () => {
  it("scales nutrients by grams/100", () => {
    const item = makeItem({ grams: 200 });
    const result = calcItemNutrients(item);
    expect(result["energy-kcal_100g"]).toBe(400);
    expect(result["proteins_100g"]).toBe(20);
  });

  it("returns zero for zero grams", () => {
    const item = makeItem({ grams: 0 });
    const result = calcItemNutrients(item);
    expect(result["energy-kcal_100g"]).toBe(0);
  });

  it("handles 100g as identity", () => {
    const item = makeItem({ grams: 100 });
    const result = calcItemNutrients(item);
    expect(result["energy-kcal_100g"]).toBe(200);
  });

  it("computes all nutrient keys, not just display ones", () => {
    const item = makeItem({ grams: 100 });
    const result = calcItemNutrients(item);
    expect(result["saturated-fat_100g"]).toBe(2);
    expect(result["sugars_100g"]).toBe(5);
    expect(result["sodium_100g"]).toBe(0.4);
  });

  it("handles missing nutrients gracefully", () => {
    const item = makeItem({ nutrients: {} });
    const result = calcItemNutrients(item);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("itemKcal", () => {
  it("calculates kcal for given grams", () => {
    const item = makeItem({ grams: 50 });
    expect(itemKcal(item)).toBe(100);
  });

  it("returns zero for zero grams", () => {
    const item = makeItem({ grams: 0 });
    expect(itemKcal(item)).toBe(0);
  });

  it("returns zero for missing nutrient", () => {
    const item = makeItem({ nutrients: {} });
    expect(itemKcal(item)).toBe(0);
  });
});

describe("sumNutrients", () => {
  it("sums multiple items", () => {
    const items = [
      makeItem({ grams: 100 }),
      makeItem({ grams: 100 }),
    ];
    const totals = sumNutrients(items);
    expect(totals["energy-kcal_100g"]).toBe(400);
    expect(totals["proteins_100g"]).toBe(20);
  });

  it("sums all nutrient keys, not just display ones", () => {
    const items = [makeItem({ grams: 100 }), makeItem({ grams: 100 })];
    const totals = sumNutrients(items);
    expect(totals["saturated-fat_100g"]).toBe(4);  // 2 + 2
    expect(totals["sodium_100g"]).toBeCloseTo(0.8);
  });

  it("returns empty object for empty list", () => {
    const totals = sumNutrients([]);
    expect(Object.keys(totals)).toHaveLength(0);
  });

  it("handles mixed grams", () => {
    const items = [
      makeItem({ grams: 200, nutrients: { "energy-kcal_100g": 100 } }),
      makeItem({ grams: 50, nutrients: { "energy-kcal_100g": 400 } }),
    ];
    const totals = sumNutrients(items);
    // 100*200/100 + 400*50/100 = 200 + 200 = 400
    expect(totals["energy-kcal_100g"]).toBe(400);
  });
});

describe("NUTRIENTS_META", () => {
  it("has conversion factor for sodium", () => {
    expect(NUTRIENTS_META["sodium_100g"]).toBe(1000);
  });

  it("has identity factor for kcal", () => {
    expect(NUTRIENTS_META["energy-kcal_100g"]).toBe(1);
  });

  it("has high factor for vitamin D", () => {
    expect(NUTRIENTS_META["vitamin-d_100g"]).toBe(1000000);
  });
});

describe("KEY_NUTRIENTS_DISPLAY", () => {
  it("has 5 display nutrients", () => {
    expect(KEY_NUTRIENTS_DISPLAY).toHaveLength(5);
  });

  it("includes kcal first", () => {
    expect(KEY_NUTRIENTS_DISPLAY[0].key).toBe("energy-kcal_100g");
  });
});

describe("EDITABLE_NUTRIENTS", () => {
  it("has 8 fields", () => {
    expect(EDITABLE_NUTRIENTS).toHaveLength(8);
  });

  it("includes sodium in mg", () => {
    const sodium = EDITABLE_NUTRIENTS.find((n) => n.key === "sodium_100g");
    expect(sodium?.label).toContain("mg");
  });
});

describe("formatDateLabel", () => {
  it("returns 'Vandaag' for today", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(formatDateLabel(today)).toBe("Vandaag");
  });

  it("returns 'Gisteren' for yesterday", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    expect(formatDateLabel(yesterday)).toBe("Gisteren");
  });

  it("returns formatted date for other days", () => {
    const label = formatDateLabel("2026-01-15");
    expect(label).toBeTruthy();
    expect(label).not.toBe("Vandaag");
  });
});

describe("toDateStr", () => {
  it("formats date to YYYY-MM-DD", () => {
    expect(toDateStr(new Date("2026-03-15T12:00:00Z"))).toBe("2026-03-15");
  });
});

describe("shortDay", () => {
  it("returns Dutch day abbreviation", () => {
    expect(shortDay("2026-03-23")).toBe("ma"); // Monday
    expect(shortDay("2026-03-28")).toBe("za"); // Saturday
  });
});
