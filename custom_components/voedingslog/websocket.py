"""WebSocket API handlers for the Voedingslog panel."""
from __future__ import annotations

import json
import logging

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
)

_LOGGER = logging.getLogger(__name__)


def _get_coordinator(hass: HomeAssistant):
    """Get the first available coordinator."""
    entries = hass.data.get(DOMAIN, {})
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

    connection.send_result(msg["id"], {
        "persons": entry.data.get("personen", []),
        "calories_goal": entry.data.get("doel_calorieen", 2000),
        "sodium_goal_mg": entry.data.get("doel_natrium_mg", 2000),
        "categories": MEAL_CATEGORIES,
        "category_labels": MEAL_CATEGORY_LABELS,
        "nutrients": {k: {"label": v["label"], "unit": v["unit"]} for k, v in NUTRIENTS.items()},
        "ai_task_entity": entry.options.get("ai_task_entity", ""),
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
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    person = msg["person"]
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
    }
)
@websocket_api.async_response
async def ws_search_products(hass, connection, msg):
    """Search products by name."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    products = await coordinator.search_products(msg["query"])
    connection.send_result(msg["id"], {"products": products})


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
    coordinator = _get_coordinator(hass)
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
    coordinator = _get_coordinator(hass)
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
        vol.Optional("date"): str,
    }
)
@websocket_api.async_response
async def ws_edit_item(hass, connection, msg):
    """Edit the grams and/or category of an existing item."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    ok = await coordinator.edit_item(
        person=msg["person"],
        index=msg["index"],
        grams=msg.get("grams"),
        category=msg.get("category"),
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
    coordinator = _get_coordinator(hass)
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
    entry = _get_config_entry(hass)
    ai_entity = entry.options.get("ai_task_entity", "") if entry else ""

    if not ai_entity:
        connection.send_error(
            msg["id"], "no_ai_entity",
            "Geen AI Task entity geconfigureerd. Ga naar instellingen om er een te kiezen."
        )
        return

    instructions = (
        "Analyze this nutrition label photo. Extract the nutritional values PER 100 GRAMS. "
        "Return ONLY valid JSON in this exact format, no other text:\n"
        '{"name": "product name", "nutrients": {'
        '"energy-kcal_100g": 0, "fat_100g": 0, "saturated-fat_100g": 0, '
        '"carbohydrates_100g": 0, "sugars_100g": 0, "fiber_100g": 0, '
        '"proteins_100g": 0, "sodium_100g": 0}}\n'
        "All values must be numbers (per 100g). "
        "For sodium: convert from salt if needed (salt / 2.5 = sodium in grams). "
        "If a value is not visible, use 0."
    )

    try:
        result = await hass.services.async_call(
            "ai_task",
            "generate_data",
            {
                "task_type": "data_extraction",
                "entity_id": ai_entity,
                "instructions": instructions,
                "attachments": [
                    {
                        "type": "image",
                        "data": msg["photo_b64"],
                        "media_type": "image/jpeg",
                    }
                ],
            },
            blocking=True,
            return_response=True,
        )

        # Parse the AI response
        response_text = result.get("data", {}).get("text", "") if result else ""

        # Try to extract JSON from the response
        json_start = response_text.find("{")
        json_end = response_text.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            parsed = json.loads(response_text[json_start:json_end])
            connection.send_result(msg["id"], {
                "product": {
                    "name": parsed.get("name", "Onbekend product"),
                    "serving_grams": 100,
                    "nutrients": parsed.get("nutrients", {}),
                }
            })
        else:
            connection.send_error(msg["id"], "parse_error", "Could not parse AI response")

    except Exception as e:
        _LOGGER.error("AI photo analysis failed: %s", e)
        connection.send_error(msg["id"], "ai_error", str(e))


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
