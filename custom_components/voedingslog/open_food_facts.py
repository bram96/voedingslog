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
        "fields": "product_name,brands,nutriments,product_name_nl,serving_size,quantity",
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


# Backwards compat aliases
zoek_op_barcode = lookup_by_barcode
zoek_op_naam = search_by_name


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

    return {
        "name": f"{name} ({brand})" if brand else name,
        "serving_grams": serving_grams or 100,
        "nutrients": {
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
        },
    }


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
