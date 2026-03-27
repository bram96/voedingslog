/**
 * Shared test helpers for Lit component testing with mocked HA.
 */
import type { HomeAssistant, VoedingslogConfig, LogItem, Product, UnifiedProduct, GetLogResponse, GetProductsResponse, GetPeriodResponse } from "./types.js";

/** Default test config matching a typical HA setup. */
export function mockConfig(overrides: Partial<VoedingslogConfig> = {}): VoedingslogConfig {
  return {
    persons: ["Test"],
    calories_goal: 2000,
    macro_goals: { carbs: 250, protein: 80, fat: 65, fiber: 30 },
    person_goals: {
      Test: { calories_goal: 2000, macro_goals: { carbs: 250, protein: 80, fat: 65, fiber: 30 } },
    },
    categories: ["breakfast", "lunch", "dinner", "snack"],
    category_labels: { breakfast: "Ontbijt", lunch: "Lunch", dinner: "Avondeten", snack: "Tussendoor" },
    nutrients: {
      "energy-kcal_100g": { label: "Calorieën", unit: "kcal" },
      "fat_100g": { label: "Vetten", unit: "g" },
      "proteins_100g": { label: "Eiwitten", unit: "g" },
      "carbohydrates_100g": { label: "Koolhydraten", unit: "g" },
      "fiber_100g": { label: "Vezels", unit: "g" },
    },
    ai_task_entity: "",
    ...overrides,
  };
}

/** Create a mock LogItem. */
export function mockItem(overrides: Partial<LogItem> = {}): LogItem {
  return {
    name: "Volkoren brood",
    grams: 70,
    nutrients: { "energy-kcal_100g": 247, "proteins_100g": 8, "carbohydrates_100g": 41, "fat_100g": 3, "fiber_100g": 7 },
    time: "08:30",
    category: "breakfast",
    ...overrides,
  };
}

/** Create a mock Product. */
export function mockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod1",
    name: "Volkoren brood",
    serving_grams: 35,
    nutrients: { "energy-kcal_100g": 247, "proteins_100g": 8, "carbohydrates_100g": 41, "fat_100g": 3, "fiber_100g": 7 },
    ...overrides,
  };
}

/** Create a mock UnifiedProduct (base type). */
export function mockBaseProduct(overrides: Partial<UnifiedProduct> = {}): UnifiedProduct {
  return {
    id: "prod1",
    type: "base",
    name: "Volkoren brood",
    serving_grams: 35,
    nutrients: { "energy-kcal_100g": 247, "proteins_100g": 8, "carbohydrates_100g": 41, "fat_100g": 3, "fiber_100g": 7 },
    ...overrides,
  } as UnifiedProduct;
}

type WSHandler = (msg: Record<string, unknown>) => unknown;

/**
 * Create a mock HomeAssistant object that intercepts callWS.
 * Pass handlers as a map of WS type → response function.
 */
export function mockHass(handlers: Record<string, WSHandler> = {}): HomeAssistant {
  const defaultHandlers: Record<string, WSHandler> = {
    "voedingslog/get_config": () => mockConfig(),
    "voedingslog/get_log": () => ({ items: [mockItem()], totals: { "energy-kcal_100g": 172.9 } } satisfies GetLogResponse),
    "voedingslog/get_products": () => ({ products: [mockBaseProduct()] } satisfies GetProductsResponse),
    "voedingslog/get_favorites": () => ({ products: [] }),
    "voedingslog/get_recent": () => ({ items: [] }),
    "voedingslog/get_streak": () => ({ streak: 3 }),
    "voedingslog/search_products": () => ({ products: [], source: "local", recent_searches: [] }),
    "voedingslog/get_period": () => ({ days: [] } satisfies GetPeriodResponse),
    ...handlers,
  };

  return {
    callWS: async <T = unknown>(msg: Record<string, unknown>): Promise<T> => {
      const type = msg.type as string;
      const handler = defaultHandlers[type];
      if (handler) return handler(msg) as T;
      throw new Error(`Unhandled WS type: ${type}`);
    },
    user: { id: "test-user", name: "Test" },
  };
}

/** Wait for Lit to finish rendering. */
export async function nextFrame(): Promise<void> {
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
}
