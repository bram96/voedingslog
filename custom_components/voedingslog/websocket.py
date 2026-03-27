"""WebSocket API handlers for the Voedingslog panel."""
from __future__ import annotations

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
    WS_GET_RECENT,
    WS_GET_PERIOD,
    WS_GET_PRODUCTS,
    WS_SAVE_PRODUCT,
    WS_DELETE_PRODUCT,
    WS_REFRESH_PRODUCT,
    WS_CLEANUP_PRODUCTS,
    WS_ADD_ALIAS,
    WS_GET_FAVORITES,
    WS_TOGGLE_FAVORITE,
)
from .ai_handlers import register_ai_commands

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
    register_ai_commands(hass, _get_coordinator)
    websocket_api.async_register_command(hass, ws_get_recent)
    websocket_api.async_register_command(hass, ws_get_period)
    websocket_api.async_register_command(hass, ws_get_products)
    websocket_api.async_register_command(hass, ws_save_product)
    websocket_api.async_register_command(hass, ws_delete_product)
    websocket_api.async_register_command(hass, ws_refresh_product)
    websocket_api.async_register_command(hass, ws_cleanup_products)
    websocket_api.async_register_command(hass, ws_add_alias)
    websocket_api.async_register_command(hass, ws_get_favorites)
    websocket_api.async_register_command(hass, ws_toggle_favorite)


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
        vol.Optional("components"): list,
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
        components=msg.get("components"),
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
        vol.Optional("components"): list,
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
        components=msg.get("components"),
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


# ── Recent items ─────────────────────────────────────────────────

@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_GET_RECENT,
        vol.Required("person"): str,
    }
)
@websocket_api.async_response
async def ws_get_recent(hass, connection, msg):
    """Return recently logged unique products."""
    coordinator = _get_coordinator(hass, msg["person"])
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    items = coordinator.get_recent_items(msg["person"])
    connection.send_result(msg["id"], {"items": items})


# ── Period data ──────────────────────────────────────────────────

@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_GET_PERIOD,
        vol.Required("person"): str,
        vol.Required("start_date"): str,
        vol.Required("end_date"): str,
    }
)
@websocket_api.async_response
async def ws_get_period(hass, connection, msg):
    """Return daily totals for a date range."""
    coordinator = _get_coordinator(hass, msg["person"])
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    days = coordinator.get_period_totals(msg["person"], msg["start_date"], msg["end_date"])
    connection.send_result(msg["id"], {"days": days})


# ── Unified products (base + recipes) ────────────────────────────

@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_GET_PRODUCTS,
        vol.Optional("product_type"): str,
    }
)
@websocket_api.async_response
async def ws_get_products(hass, connection, msg):
    """Return all products, optionally filtered by type."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    products = coordinator.get_products(msg.get("product_type"))
    connection.send_result(msg["id"], {"products": products})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_SAVE_PRODUCT,
        vol.Required("product"): dict,
    }
)
@websocket_api.async_response
async def ws_save_product(hass, connection, msg):
    """Create or update a product (base or recipe)."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    saved = await coordinator.save_product(msg["product"])
    connection.send_result(msg["id"], {"product": saved})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_DELETE_PRODUCT,
        vol.Required("product_id"): str,
    }
)
@websocket_api.async_response
async def ws_delete_product(hass, connection, msg):
    """Delete a product by ID."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    ok = await coordinator.delete_product(msg["product_id"])
    if ok:
        connection.send_result(msg["id"], {"success": True})
    else:
        connection.send_error(msg["id"], "not_found", "Product not found")


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_REFRESH_PRODUCT,
        vol.Required("product_id"): str,
    }
)
@websocket_api.async_response
async def ws_refresh_product(hass, connection, msg):
    """Re-fetch a product's nutrients from Open Food Facts."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    product = await coordinator.refresh_product_from_off(msg["product_id"])
    if product:
        connection.send_result(msg["id"], {"product": product})
    else:
        connection.send_error(msg["id"], "not_found", "Product not found or OFF search failed")


@websocket_api.websocket_command(
    {vol.Required("type"): WS_CLEANUP_PRODUCTS}
)
@websocket_api.async_response
async def ws_cleanup_products(hass, connection, msg):
    """Remove base products not referenced in any log."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    removed = await coordinator.cleanup_unused_products()
    connection.send_result(msg["id"], {"removed": removed})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_ADD_ALIAS,
        vol.Required("product_id"): str,
        vol.Required("alias"): str,
    }
)
@websocket_api.async_response
async def ws_add_alias(hass, connection, msg):
    """Add an alias to a product."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    added = await coordinator.add_alias(msg["product_id"], msg["alias"])
    connection.send_result(msg["id"], {"added": added})


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
        vol.Required("product_id"): str,
    }
)
@websocket_api.async_response
async def ws_toggle_favorite(hass, connection, msg):
    """Toggle favorite status for a product."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    is_fav = await coordinator.toggle_favorite(msg["product_id"])
    connection.send_result(msg["id"], {"favorite": is_fav})
