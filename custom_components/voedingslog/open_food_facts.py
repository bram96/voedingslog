"""Open Food Facts API wrapper voor Voedingslog."""
from __future__ import annotations

import logging
import aiohttp

from .const import OFF_API, OFF_SEARCH

_LOGGER = logging.getLogger(__name__)


async def zoek_op_barcode(session: aiohttp.ClientSession, barcode: str) -> dict | None:
    """Haal productinfo op via barcode."""
    url = OFF_API.format(barcode=barcode)
    try:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                _LOGGER.warning("OFF barcode %s: HTTP %s", barcode, resp.status)
                return None
            data = await resp.json()
            if data.get("status") != 1:
                _LOGGER.info("Barcode %s niet gevonden in Open Food Facts", barcode)
                return None
            return _verwerk_product(data["product"])
    except Exception as e:
        _LOGGER.error("Fout bij ophalen barcode %s: %s", barcode, e)
        return None


async def zoek_op_naam(session: aiohttp.ClientSession, naam: str) -> list[dict]:
    """Zoek producten op naam, geeft lijst van max 10 resultaten."""
    params = {
        "search_terms": naam,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": 10,
        "fields": "product_name,brands,nutriments,product_name_nl,serving_size,quantity",
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                OFF_SEARCH, params=params, timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()
                producten = data.get("products", [])
                return [_verwerk_product(p) for p in producten if p.get("nutriments")]
    except Exception as e:
        _LOGGER.error("Fout bij zoeken '%s': %s", naam, e)
        return []


def _verwerk_product(product: dict) -> dict:
    """Zet ruwe OFF data om naar ons formaat."""
    nm = product.get("nutriments", {})
    naam = (
        product.get("product_name_nl")
        or product.get("product_name")
        or "Onbekend product"
    )
    merk = product.get("brands", "")
    portie_g = _parse_portie(product.get("serving_size", ""))

    return {
        "naam": f"{naam} ({merk})" if merk else naam,
        "portie_g": portie_g or 100,
        "nutrienten": {
            "energy-kcal_100g":   _getal(nm.get("energy-kcal_100g") or nm.get("energy_100g", 0) / 4.184),
            "fat_100g":           _getal(nm.get("fat_100g", 0)),
            "saturated-fat_100g": _getal(nm.get("saturated-fat_100g", 0)),
            "carbohydrates_100g": _getal(nm.get("carbohydrates_100g", 0)),
            "sugars_100g":        _getal(nm.get("sugars_100g", 0)),
            "fiber_100g":         _getal(nm.get("fiber_100g", 0)),
            "proteins_100g":      _getal(nm.get("proteins_100g", 0)),
            "sodium_100g":        _getal(nm.get("sodium_100g", 0)),
            "vitamin-c_100g":     _getal(nm.get("vitamin-c_100g", 0)),
            "calcium_100g":       _getal(nm.get("calcium_100g", 0)),
            "iron_100g":          _getal(nm.get("iron_100g", 0)),
            "vitamin-d_100g":     _getal(nm.get("vitamin-d_100g", 0)),
        },
    }


def _getal(waarde) -> float:
    try:
        return float(waarde or 0)
    except (TypeError, ValueError):
        return 0.0


def _parse_portie(serving: str) -> float | None:
    """Haal grammen uit portiegrootte string, bijv. '125 g' → 125.0"""
    import re
    if not serving:
        return None
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*g", serving, re.IGNORECASE)
    if match:
        return float(match.group(1).replace(",", "."))
    return None
