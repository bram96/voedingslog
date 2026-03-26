"""WebSocket API handlers for the Voedingslog panel."""
from __future__ import annotations

import base64
import json
import logging
import uuid
from pathlib import Path

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    NUTRIENTS,
    MEAL_CATEGORIES,
    MEAL_CATEGORY_LABELS,
    WS_GET_CONFIG,
    WS_GET_LOG,
    WS_LOOKUP_BARCODE,
    WS_SEARCH_PRODUCTS,
    WS_LOG_PRODUCT,
    WS_DELETE_ITEM,
    WS_EDIT_ITEM,
    WS_RESET_DAY,
    WS_ANALYZE_PHOTO,
    WS_GET_MEALS,
    WS_SAVE_MEAL,
    WS_DELETE_MEAL,
    WS_GET_FAVORITES,
    WS_TOGGLE_FAVORITE,
    WS_PARSE_TEXT,
    WS_PARSE_HANDWRITING,
)

_LOGGER = logging.getLogger(__name__)


def _get_coordinator(hass: HomeAssistant, person: str | None = None):
    """Get the coordinator for a person, or the first available one."""
    entries = hass.data.get(DOMAIN, {})
    if person:
        for coord in entries.values():
            if person in coord.persons:
                return coord
    if entries:
        return next(iter(entries.values()))
    return None


def _get_config_entry(hass: HomeAssistant):
    """Get the first config entry for the domain."""
    entries = hass.config_entries.async_entries(DOMAIN)
    return entries[0] if entries else None


def async_register_commands(hass: HomeAssistant) -> None:
    """Register all WebSocket commands."""
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_get_log)
    websocket_api.async_register_command(hass, ws_lookup_barcode)
    websocket_api.async_register_command(hass, ws_search_products)
    websocket_api.async_register_command(hass, ws_log_product)
    websocket_api.async_register_command(hass, ws_delete_item)
    websocket_api.async_register_command(hass, ws_edit_item)
    websocket_api.async_register_command(hass, ws_reset_day)
    websocket_api.async_register_command(hass, ws_analyze_photo)
    websocket_api.async_register_command(hass, ws_get_meals)
    websocket_api.async_register_command(hass, ws_save_meal)
    websocket_api.async_register_command(hass, ws_delete_meal)
    websocket_api.async_register_command(hass, ws_get_favorites)
    websocket_api.async_register_command(hass, ws_toggle_favorite)
    websocket_api.async_register_command(hass, ws_parse_text)
    websocket_api.async_register_command(hass, ws_parse_handwriting)


@websocket_api.websocket_command(
    {vol.Required("type"): WS_GET_CONFIG}
)
@websocket_api.async_response
async def ws_get_config(hass, connection, msg):
    """Return integration configuration for the panel."""
    entry = _get_config_entry(hass)
    if not entry:
        connection.send_error(msg["id"], "not_configured", "Voedingslog is not configured")
        return

    # Gather persons and per-person goals from all config entries
    all_persons = []
    person_goals = {}
    ai_entity = ""
    for e in hass.config_entries.async_entries(DOMAIN):
        merged = {**e.data, **e.options}
        for p in merged.get("personen", []):
            if p not in all_persons:
                all_persons.append(p)
                person_goals[p] = {
                    "calories_goal": merged.get("doel_calorieen", 2000),
                    "macro_goals": {
                        "carbs": merged.get("carbs_goal", 0),
                        "protein": merged.get("protein_goal", 0),
                        "fat": merged.get("fat_goal", 0),
                        "fiber": merged.get("fiber_goal", 0),
                    },
                }
        if not ai_entity:
            ai_entity = merged.get("ai_task_entity", "")

    # Use first person's goals as default
    opts = {**entry.data, **entry.options}
    connection.send_result(msg["id"], {
        "persons": all_persons,
        "person_goals": person_goals,
        "calories_goal": opts.get("doel_calorieen", 2000),
        "macro_goals": {
            "carbs": opts.get("carbs_goal", 0),
            "protein": opts.get("protein_goal", 0),
            "fat": opts.get("fat_goal", 0),
            "fiber": opts.get("fiber_goal", 0),
        },
        "categories": MEAL_CATEGORIES,
        "category_labels": MEAL_CATEGORY_LABELS,
        "nutrients": {k: {"label": v["label"], "unit": v["unit"]} for k, v in NUTRIENTS.items()},
        "ai_task_entity": ai_entity,
    })


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_GET_LOG,
        vol.Required("person"): str,
        vol.Optional("date"): str,
    }
)
@websocket_api.async_response
async def ws_get_log(hass, connection, msg):
    """Return the log for a person on a given date."""
    person = msg["person"]
    coordinator = _get_coordinator(hass, person)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    day = msg.get("date")
    items = coordinator.get_log_for_date(person, day)

    # Calculate totals
    totals = {k: 0.0 for k in NUTRIENTS}
    for item in items:
        factor = item["grams"] / 100.0
        for nutrient in NUTRIENTS:
            totals[nutrient] += item["nutrients"].get(nutrient, 0.0) * factor

    connection.send_result(msg["id"], {
        "items": items,
        "totals": totals,
    })


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_LOOKUP_BARCODE,
        vol.Required("barcode"): str,
    }
)
@websocket_api.async_response
async def ws_lookup_barcode(hass, connection, msg):
    """Look up a product by barcode without logging."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    product = await coordinator.lookup_barcode(msg["barcode"])
    connection.send_result(msg["id"], {"product": product})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_SEARCH_PRODUCTS,
        vol.Required("query"): str,
        vol.Optional("online", default=False): bool,
    }
)
@websocket_api.async_response
async def ws_search_products(hass, connection, msg):
    """Search products: local cache first, optionally online."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    if msg.get("online"):
        products = await coordinator.search_products_online(msg["query"])
        connection.send_result(msg["id"], {"products": products, "source": "online"})
    else:
        local = coordinator.search_products_local(msg["query"])
        connection.send_result(msg["id"], {"products": local, "source": "local"})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_LOG_PRODUCT,
        vol.Required("person"): str,
        vol.Required("name"): str,
        vol.Required("grams"): vol.Coerce(float),
        vol.Required("nutrients"): dict,
        vol.Required("category"): vol.In(MEAL_CATEGORIES),
        vol.Optional("date"): str,
    }
)
@websocket_api.async_response
async def ws_log_product(hass, connection, msg):
    """Log a product with full nutrient data."""
    coordinator = _get_coordinator(hass, msg["person"])
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    await coordinator.log_manual(
        person=msg["person"],
        name=msg["name"],
        grams=msg["grams"],
        nutrients=msg["nutrients"],
        category=msg["category"],
        day=msg.get("date"),
    )
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_DELETE_ITEM,
        vol.Required("person"): str,
        vol.Required("index"): int,
        vol.Optional("date"): str,
    }
)
@websocket_api.async_response
async def ws_delete_item(hass, connection, msg):
    """Delete a specific item by index."""
    coordinator = _get_coordinator(hass, msg["person"])
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    await coordinator.delete_item(msg["person"], msg["index"], msg.get("date"))
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_EDIT_ITEM,
        vol.Required("person"): str,
        vol.Required("index"): int,
        vol.Optional("grams"): vol.Coerce(float),
        vol.Optional("category"): vol.In(MEAL_CATEGORIES),
        vol.Optional("nutrients"): dict,
        vol.Optional("name"): str,
        vol.Optional("date"): str,
    }
)
@websocket_api.async_response
async def ws_edit_item(hass, connection, msg):
    """Edit the grams and/or category of an existing item."""
    coordinator = _get_coordinator(hass, msg["person"])
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    ok = await coordinator.edit_item(
        person=msg["person"],
        index=msg["index"],
        grams=msg.get("grams"),
        category=msg.get("category"),
        nutrients=msg.get("nutrients"),
        name=msg.get("name"),
        day=msg.get("date"),
    )
    if ok:
        connection.send_result(msg["id"], {"success": True})
    else:
        connection.send_error(msg["id"], "not_found", "Item not found")


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_RESET_DAY,
        vol.Required("person"): str,
        vol.Optional("date"): str,
    }
)
@websocket_api.async_response
async def ws_reset_day(hass, connection, msg):
    """Clear the log for a day."""
    coordinator = _get_coordinator(hass, msg["person"])
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    await coordinator.reset_day(msg["person"], msg.get("date"))
    connection.send_result(msg["id"], {"success": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_ANALYZE_PHOTO,
        vol.Required("photo_b64"): str,
    }
)
@websocket_api.async_response
async def ws_analyze_photo(hass, connection, msg):
    """Analyze a photo of a nutrition label using HA AI Task."""
    ai_entity = _get_ai_entity(hass)
    if not ai_entity:
        connection.send_error(
            msg["id"], "no_ai_entity",
            "Geen AI Task entity geconfigureerd. Ga naar instellingen om er een te kiezen."
        )
        return

    instructions = (
        "Analyze this nutrition label photo. Extract the product name and "
        "nutritional values PER 100 GRAMS. "
        "For sodium: convert from salt if needed (salt / 2.5 = sodium in grams). "
        "If a value is not visible, use 0."
    )

    structure = {
        "name": {
            "description": "Product name as shown on the label",
            "required": True,
            "selector": {"text": {}},
        },
        "energy_kcal": {
            "description": "Energy in kcal per 100g",
            "required": True,
            "selector": {"number": {"min": 0, "step": 0.1}},
        },
        "fat": {
            "description": "Fat in grams per 100g",
            "required": True,
            "selector": {"number": {"min": 0, "step": 0.1}},
        },
        "saturated_fat": {
            "description": "Saturated fat in grams per 100g",
            "required": True,
            "selector": {"number": {"min": 0, "step": 0.1}},
        },
        "carbohydrates": {
            "description": "Carbohydrates in grams per 100g",
            "required": True,
            "selector": {"number": {"min": 0, "step": 0.1}},
        },
        "sugars": {
            "description": "Sugars in grams per 100g",
            "required": True,
            "selector": {"number": {"min": 0, "step": 0.1}},
        },
        "fiber": {
            "description": "Fiber in grams per 100g",
            "required": True,
            "selector": {"number": {"min": 0, "step": 0.1}},
        },
        "proteins": {
            "description": "Proteins in grams per 100g",
            "required": True,
            "selector": {"number": {"min": 0, "step": 0.1}},
        },
        "sodium": {
            "description": "Sodium in grams per 100g (convert from salt: salt / 2.5)",
            "required": True,
            "selector": {"number": {"min": 0, "step": 0.001}},
        },
    }

    attachment = await _save_temp_image(hass, msg["photo_b64"])
    try:
        result = await hass.services.async_call(
            "ai_task",
            "generate_data",
            {
                "task_name": "nutrition_label_extraction",
                "entity_id": ai_entity,
                "instructions": instructions,
                "structure": structure,
                "attachments": [attachment],
            },
            blocking=True,
            return_response=True,
        )

        data = result.get("data", {}) if result else {}
        connection.send_result(msg["id"], {
            "product": {
                "name": data.get("name", "Onbekend product"),
                "serving_grams": 100,
                "nutrients": {
                    "energy-kcal_100g": float(data.get("energy_kcal", 0)),
                    "fat_100g": float(data.get("fat", 0)),
                    "saturated-fat_100g": float(data.get("saturated_fat", 0)),
                    "carbohydrates_100g": float(data.get("carbohydrates", 0)),
                    "sugars_100g": float(data.get("sugars", 0)),
                    "fiber_100g": float(data.get("fiber", 0)),
                    "proteins_100g": float(data.get("proteins", 0)),
                    "sodium_100g": float(data.get("sodium", 0)),
                },
            }
        })

    except Exception as e:
        _LOGGER.error("AI photo analysis failed: %s", e)
        connection.send_error(msg["id"], "ai_error", str(e))
    finally:
        _cleanup_temp_image(attachment)


# ── AI helpers ────────────────────────────────────────────────────

def _get_ai_entity(hass: HomeAssistant) -> str:
    """Get the AI task entity from any config entry."""
    for e in hass.config_entries.async_entries(DOMAIN):
        merged = {**e.data, **e.options}
        entity = merged.get("ai_task_entity", "")
        if entity:
            return entity
    return ""


async def _save_temp_image(hass: HomeAssistant, photo_b64: str) -> dict:
    """Save base64 image to media dir, return attachment dict."""
    media_dir = Path(hass.config.path("media"))
    media_dir.mkdir(exist_ok=True)
    filename = f"voedingslog_temp_{uuid.uuid4().hex[:8]}.jpg"
    (media_dir / filename).write_bytes(base64.b64decode(photo_b64))
    return {
        "media_content_id": f"media-source://media_source/local/{filename}",
        "media_content_type": "image/jpeg",
    }


def _cleanup_temp_image(attachment: dict) -> None:
    """Delete temp image file after use."""
    try:
        content_id = attachment.get("media_content_id", "")
        filename = content_id.rsplit("/", 1)[-1] if "/" in content_id else ""
        if filename.startswith("voedingslog_temp_"):
            path = Path("/media") / filename
            if path.exists():
                path.unlink()
    except Exception:
        pass


_FOOD_PARSE_STRUCTURE = {
    "items_json": {
        "description": (
            "JSON array of food items. Each item: "
            '{\"name\": \"specific product name for food database search\", '
            '\"estimated_grams\": number}. '
            "Use specific product names (e.g. 'volkoren brood' not 'boterham', "
            "'Gouda kaas' not 'kaas'). estimated_grams is total grams consumed."
        ),
        "required": True,
        "selector": {"text": {"multiline": True}},
    }
}


async def _lookup_parsed_items(hass: HomeAssistant, items: list[dict]) -> list[dict]:
    """Look up parsed food items in product cache and OFF."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        return []

    products = []
    for item in items:
        ai_name = item.get("name", "Onbekend")
        grams = float(item.get("estimated_grams", 100))

        # Search local cache first, then online
        results = coordinator.search_products_local(ai_name)
        if not results:
            results = await coordinator.search_products_online(ai_name)

        if results:
            product = results[0]
            products.append({
                **product,
                "serving_grams": grams,
                "ai_name": ai_name,
                "matched": True,
            })
        else:
            products.append({
                "name": ai_name,
                "serving_grams": grams,
                "nutrients": {k: 0.0 for k in NUTRIENTS},
                "ai_name": ai_name,
                "matched": False,
            })

    return products


# ── AI food parsing ──────────────────────────────────────────────

@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_PARSE_TEXT,
        vol.Required("text"): str,
    }
)
@websocket_api.async_response
async def ws_parse_text(hass, connection, msg):
    """Parse a text description of food into individual products."""
    ai_entity = _get_ai_entity(hass)
    if not ai_entity:
        connection.send_error(
            msg["id"], "no_ai_entity",
            "Geen AI Task entity geconfigureerd."
        )
        return

    try:
        result = await hass.services.async_call(
            "ai_task",
            "generate_data",
            {
                "task_name": "food_text_parsing",
                "entity_id": ai_entity,
                "instructions": (
                    "Parse this food description into individual food items with "
                    "estimated grams consumed. Use specific product names suitable "
                    "for searching a food database. Text: " + msg["text"]
                ),
                "structure": _FOOD_PARSE_STRUCTURE,
            },
            blocking=True,
            return_response=True,
        )

        data = result.get("data", {}) if result else {}
        raw = data.get("items_json", "[]")
        items = json.loads(raw) if isinstance(raw, str) else raw
        products = await _lookup_parsed_items(hass, items)
        connection.send_result(msg["id"], {"products": products})

    except Exception as e:
        _LOGGER.error("AI text parsing failed: %s", e)
        connection.send_error(msg["id"], "ai_error", str(e))


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_PARSE_HANDWRITING,
        vol.Required("photo_b64"): str,
    }
)
@websocket_api.async_response
async def ws_parse_handwriting(hass, connection, msg):
    """OCR a handwritten food list and parse into individual products."""
    ai_entity = _get_ai_entity(hass)
    if not ai_entity:
        connection.send_error(
            msg["id"], "no_ai_entity",
            "Geen AI Task entity geconfigureerd."
        )
        return

    attachment = await _save_temp_image(hass, msg["photo_b64"])
    try:
        result = await hass.services.async_call(
            "ai_task",
            "generate_data",
            {
                "task_name": "food_handwriting_ocr",
                "entity_id": ai_entity,
                "instructions": (
                    "OCR this handwritten food list. Parse each item into a food "
                    "product with estimated grams consumed. Use specific product "
                    "names suitable for searching a food database."
                ),
                "structure": _FOOD_PARSE_STRUCTURE,
                "attachments": [attachment],
            },
            blocking=True,
            return_response=True,
        )

        data = result.get("data", {}) if result else {}
        raw = data.get("items_json", "[]")
        items = json.loads(raw) if isinstance(raw, str) else raw
        products = await _lookup_parsed_items(hass, items)
        connection.send_result(msg["id"], {"products": products})

    except Exception as e:
        _LOGGER.error("AI handwriting parsing failed: %s", e)
        connection.send_error(msg["id"], "ai_error", str(e))
    finally:
        _cleanup_temp_image(attachment)


# ── Custom meals (recipes) ────────────────────────────────────────

@websocket_api.websocket_command(
    {vol.Required("type"): WS_GET_MEALS}
)
@websocket_api.async_response
async def ws_get_meals(hass, connection, msg):
    """Return all custom meals."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    connection.send_result(msg["id"], {"meals": coordinator.get_meals()})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_SAVE_MEAL,
        vol.Required("meal"): dict,
    }
)
@websocket_api.async_response
async def ws_save_meal(hass, connection, msg):
    """Create or update a custom meal."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    saved = await coordinator.save_meal(msg["meal"])
    connection.send_result(msg["id"], {"meal": saved})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_DELETE_MEAL,
        vol.Required("meal_id"): str,
    }
)
@websocket_api.async_response
async def ws_delete_meal(hass, connection, msg):
    """Delete a custom meal."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    ok = await coordinator.delete_meal(msg["meal_id"])
    if ok:
        connection.send_result(msg["id"], {"success": True})
    else:
        connection.send_error(msg["id"], "not_found", "Meal not found")


# ── Favorites ─────────────────────────────────────────────────────

@websocket_api.websocket_command(
    {vol.Required("type"): WS_GET_FAVORITES}
)
@websocket_api.async_response
async def ws_get_favorites(hass, connection, msg):
    """Return favorite products."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    connection.send_result(msg["id"], {"products": coordinator.get_favorites()})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TOGGLE_FAVORITE,
        vol.Required("product_name"): str,
    }
)
@websocket_api.async_response
async def ws_toggle_favorite(hass, connection, msg):
    """Toggle favorite status for a product."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    is_fav = await coordinator.toggle_favorite(msg["product_name"])
    connection.send_result(msg["id"], {"favorite": is_fav})

