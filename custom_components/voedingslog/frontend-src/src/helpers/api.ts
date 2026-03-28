/**
 * Shared API helpers to avoid duplicated WS call patterns across controllers.
 */
import type { Product, AiGuessNutrientsResponse } from "../types.js";

/**
 * Ask AI to estimate nutrients for a food name.
 * Returns the product or null on failure (shows alert on error).
 */
export async function aiGuessNutrients(
  hass: { callWS<T = unknown>(msg: Record<string, unknown>): Promise<T> },
  foodName: string,
): Promise<Product | null> {
  try {
    const res = await hass.callWS<AiGuessNutrientsResponse>({
      type: "voedingslog/ai_guess_nutrients",
      food_name: foodName,
    });
    if (res.product) return res.product;
    alert("AI kon geen voedingswaarden schatten.");
    return null;
  } catch (err) {
    alert("Fout bij AI schatting: " + ((err as Error).message || err));
    return null;
  }
}
