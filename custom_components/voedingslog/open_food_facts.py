"""Open Food Facts API wrapper for Voedingslog."""
from __future__ import annotations

import logging
import re

import aiohttp

from .const import OFF_API, OFF_SEARCH

_LOGGER = logging.getLogger(__name__)


async def lookup_by_barcode(session: aiohttp.ClientSession, barcode: str) -> dict | None:
    """Fetch product info by barcode."""
    url = OFF_API.format(barcode=barcode)
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                _LOGGER.warning("OFF barcode %s: HTTP %s", barcode, resp.status)
                return None
            data = await resp.json()
            if data.get("status") != 1:
                _LOGGER.info("Barcode %s not found in Open Food Facts", barcode)
                return None
            return _process_product(data["product"])
    except Exception as e:
        _LOGGER.error("Error fetching barcode %s: %s", barcode, e)
        return None


async def search_by_name(session: aiohttp.ClientSession, name: str) -> list[dict]:
    """Search products by name, returns up to 10 results."""
    params = {
        "search_terms": name,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": 10,
        "fields": "product_name,brands,nutriments,product_name_nl,serving_size,serving_quantity,product_quantity,product_quantity_unit,quantity,completeness",
    }
    try:
        async with session.get(
            OFF_SEARCH, params=params, timeout=aiohttp.ClientTimeout(total=10)
        ) as resp:
            if resp.status != 200:
                _LOGGER.warning("OFF search HTTP %s for '%s'", resp.status, name)
                return []
            data = await resp.json()
            products = data.get("products", [])
            return [_process_product(p) for p in products if p.get("nutriments")]
    except Exception as e:
        _LOGGER.error("Error searching '%s': %s", name, e)
        return []



def _process_product(product: dict) -> dict:
    """Convert raw OFF data to our internal format."""
    nm = product.get("nutriments", {})
    name = (
        product.get("product_name_nl")
        or product.get("product_name")
        or "Onbekend product"
    )
    brand = product.get("brands", "")
    serving_grams = _parse_serving(product.get("serving_size", ""))
    portions = _build_portions(product)

    nutrients = {
        "energy-kcal_100g":   _to_float(nm.get("energy-kcal_100g") or nm.get("energy_100g", 0) / 4.184),
        "fat_100g":           _to_float(nm.get("fat_100g", 0)),
        "saturated-fat_100g": _to_float(nm.get("saturated-fat_100g", 0)),
        "carbohydrates_100g": _to_float(nm.get("carbohydrates_100g", 0)),
        "sugars_100g":        _to_float(nm.get("sugars_100g", 0)),
        "fiber_100g":         _to_float(nm.get("fiber_100g", 0)),
        "proteins_100g":      _to_float(nm.get("proteins_100g", 0)),
        "sodium_100g":        _to_float(nm.get("sodium_100g", 0)),
        "vitamin-c_100g":     _to_float(nm.get("vitamin-c_100g", 0)),
        "calcium_100g":       _to_float(nm.get("calcium_100g", 0)),
        "iron_100g":          _to_float(nm.get("iron_100g", 0)),
        "vitamin-d_100g":     _to_float(nm.get("vitamin-d_100g", 0)),
    }

    # Nutrient completeness: count how many of the 5 key nutrients have values > 0
    key_nutrients = ["energy-kcal_100g", "fat_100g", "carbohydrates_100g", "proteins_100g", "fiber_100g"]
    filled = sum(1 for k in key_nutrients if nutrients.get(k, 0) > 0)
    completeness = round(filled / len(key_nutrients) * 100)

    # OFF completeness score (0-100 scale)
    off_completeness = round(_to_float(product.get("completeness", 0)) * 100)

    return {
        "name": f"{name} ({brand})" if brand else name,
        "serving_grams": serving_grams or 100,
        "portions": portions,
        "nutrients": nutrients,
        "completeness": max(completeness, off_completeness),
    }


def _build_portions(product: dict) -> list[dict]:
    """Build a list of portion presets from OFF product data."""
    portions: list[dict] = []
    seen: set[float] = set()

    # Serving size (e.g. "1 serving (23 g)" or "200ml")
    serving_size = product.get("serving_size", "") or ""
    serving_qty = product.get("serving_quantity")
    if serving_qty:
        grams = _to_float(serving_qty)
        if grams > 0 and grams not in seen:
            label = serving_size if serving_size else f"Portie ({grams:.0f}g)"
            portions.append({"label": label, "grams": grams})
            seen.add(grams)

    # Product quantity (total package weight)
    product_qty = product.get("product_quantity")
    product_unit = (product.get("product_quantity_unit") or "").lower()
    if product_qty and product_unit in ("g", "gr", "gram", ""):
        grams = _to_float(product_qty)
        if grams > 0 and grams not in seen:
            portions.append({"label": f"Heel product ({grams:.0f}g)", "grams": grams})
            seen.add(grams)

    # Always include 100g as a preset
    if 100.0 not in seen:
        portions.append({"label": "100g", "grams": 100.0})

    return portions


def _to_float(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _parse_serving(serving: str) -> float | None:
    """Extract grams from serving size string, e.g. '125 g' → 125.0"""
    if not serving:
        return None
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*g", serving, re.IGNORECASE)
    if match:
        return float(match.group(1).replace(",", "."))
    return None
