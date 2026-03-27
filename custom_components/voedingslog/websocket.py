"""WebSocket API handlers for the Voedingslog panel."""
from __future__ import annotations

import logging
from datetime import date, timedelta

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
    WS_GET_SUGGESTIONS,
    WS_DAILY_REVIEW,
    WS_GET_RECENT,
    WS_GET_STREAK,
    WS_GET_PERIOD,
    WS_GET_PRODUCTS,
    WS_SAVE_PRODUCT,
    WS_DELETE_PRODUCT,
    WS_MERGE_PRODUCTS,
    WS_REFRESH_PRODUCT,
    WS_CLEANUP_PRODUCTS,
    WS_ADD_ALIAS,
    WS_GET_FAVORITES,
    WS_TOGGLE_FAVORITE,
)
from .ai_handlers import register_ai_commands
from .coordinator import _calculate_totals

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
    websocket_api.async_register_command(hass, ws_get_suggestions)
    websocket_api.async_register_command(hass, ws_daily_review)
    websocket_api.async_register_command(hass, ws_get_recent)
    websocket_api.async_register_command(hass, ws_get_streak)
    websocket_api.async_register_command(hass, ws_get_period)
    websocket_api.async_register_command(hass, ws_get_products)
    websocket_api.async_register_command(hass, ws_save_product)
    websocket_api.async_register_command(hass, ws_delete_product)
    websocket_api.async_register_command(hass, ws_merge_products)
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

    totals = _calculate_totals(items)

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
        vol.Optional("person"): str,
    }
)
@websocket_api.async_response
async def ws_search_products(hass, connection, msg):
    """Search products: local cache first (fuzzy + barcode), optionally online."""
    coordinator = _get_coordinator(hass, msg.get("person"))
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    # Track recent searches
    person = msg.get("person")
    if person:
        coordinator.add_recent_search(person, msg["query"])

    if msg.get("online"):
        products = await coordinator.search_products_online(msg["query"])
        connection.send_result(msg["id"], {"products": products, "source": "online"})
    else:
        local = coordinator.search_products_local(msg["query"])
        connection.send_result(msg["id"], {
            "products": local,
            "source": "local",
            "recent_searches": coordinator.get_recent_searches(person) if person else [],
        })


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


# ── Nutrient suggestions ─────────────────────────────────────────

@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_GET_SUGGESTIONS,
        vol.Required("person"): str,
    }
)
@websocket_api.async_response
async def ws_get_suggestions(hass, connection, msg):
    """Get nutrient gap suggestions with product recommendations and optional AI advice."""
    coordinator = _get_coordinator(hass, msg["person"])
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    gaps = coordinator.get_nutrient_suggestions(msg["person"])
    if not gaps:
        connection.send_result(msg["id"], {"gaps": [], "ai_advice": None})
        return

    # Try AI advice if configured
    ai_advice = None
    ai_entity = ""
    for e in hass.config_entries.async_entries(DOMAIN):
        merged = {**e.data, **e.options}
        ai_entity = merged.get("ai_task_entity", "")
        if ai_entity:
            break

    if ai_entity:
        # Build detailed context for the AI
        all_goals = {}
        for g in gaps:
            all_goals[g["nutrient_label"]] = {"goal": g["goal"], "average": g["average"], "deficit": g["deficit"]}

        # Also include nutrients that are on/over target as constraints
        period = coordinator.get_period_totals(msg["person"], str(date.today() - timedelta(days=6)), str(date.today()))
        for e_entry in hass.config_entries.async_entries(DOMAIN):
            m = {**e_entry.data, **e_entry.options}
            for p in m.get("personen", []):
                if p == msg["person"]:
                    nutrient_goals = {
                        "Calorieen": m.get("doel_calorieen", 0),
                        "Koolhydraten": m.get("carbs_goal", 0),
                        "Vet": m.get("fat_goal", 0),
                    }
                    for label, goal_val in nutrient_goals.items():
                        if goal_val > 0 and label not in all_goals:
                            key_map = {"Calorieen": "energy-kcal_100g", "Koolhydraten": "carbohydrates_100g", "Vet": "fat_100g"}
                            key = key_map.get(label, "")
                            today_str = str(date.today())
                            logged_p = [d for d in period if d["item_count"] > 0 and d["date"] != today_str]
                            avg = sum(d["totals"].get(key, 0) for d in logged_p) / max(len(logged_p), 1) if key else 0
                            all_goals[label] = {"goal": goal_val, "average": round(avg, 1), "status": "op limiet" if avg >= goal_val * 0.9 else "ok"}
                    break

        # Build product details with nutrients
        product_details = []
        for g in gaps:
            for s in g["suggestions"][:3]:
                product_details.append(f"  - {s['name']}: {s['value_per_100g']} {g['nutrient_label'].lower()}/100g")

        goals_text = "\n".join(
            f"  - {k}: doel {v['goal']}, huidig gemiddeld {v['average']}"
            + (f", tekort {v['deficit']}" if 'deficit' in v else f" ({v.get('status', 'ok')})")
            for k, v in all_goals.items()
        )

        products_text = "\n".join(product_details) if product_details else "  (geen geschikte producten in de lokale database)"

        try:
            result = await hass.services.async_call(
                "ai_task",
                "generate_data",
                {
                    "task_name": "nutrition_advice",
                    "entity_id": ai_entity,
                    "instructions": (
                        "Je bent een voedingsadviseur. Analyseer de voedingstekorten van de afgelopen week en geef advies.\n"
                        "De gemiddelden zijn berekend over AFGERONDE dagen (vandaag is uitgesloten omdat die nog bezig is).\n\n"
                        f"DOELEN EN GEMIDDELDE INTAKE (per dag, afgelopen afgeronde dagen):\n{goals_text}\n\n"
                        f"BESCHIKBARE PRODUCTEN UIT DE LOKALE DATABASE:\n{products_text}\n\n"
                        "BELANGRIJK:\n"
                        "- Dit is advies voor TOEKOMSTIGE dagen, gebaseerd op wat er de afgelopen week anders had gekund\n"
                        "- Suggesties mogen NIET leiden tot overschrijding van andere doelen (let op calorieen en koolhydraten!)\n"
                        "- Geef eerst suggesties uit de lokale database (als die goed genoeg zijn)\n"
                        "- Geef daarna een 'Anders' sectie met makkelijk te bereiden producten die niet in de database staan\n"
                        "- Antwoord in het Nederlands als bullet points\n"
                        "- Wees specifiek over hoeveelheden (gram)\n"
                        "- Houd het kort en praktisch (max 6 bullets totaal)"
                    ),
                    "structure": {
                        "from_database": {
                            "description": "Bullet points met suggesties uit de lokale productdatabase. Elke bullet begint met '- '. Leeg als er geen goede matches zijn.",
                            "required": True,
                            "selector": {"text": {"multiline": True}},
                        },
                        "other_suggestions": {
                            "description": "Bullet points met andere makkelijk te bereiden suggesties die niet in de database staan. Elke bullet begint met '- '.",
                            "required": True,
                            "selector": {"text": {"multiline": True}},
                        },
                    },
                },
                blocking=True,
                return_response=True,
            )
            data = (result or {}).get("data", {})
            from_db = data.get("from_database", "").strip()
            other = data.get("other_suggestions", "").strip()
            ai_advice = {"from_database": from_db, "other_suggestions": other}
        except Exception as e:
            _LOGGER.debug("AI nutrition advice failed: %s", e)

    connection.send_result(msg["id"], {"gaps": gaps, "ai_advice": ai_advice})


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_DAILY_REVIEW,
        vol.Required("person"): str,
    }
)
@websocket_api.async_response
async def ws_daily_review(hass, connection, msg):
    """Get an AI-powered daily nutrition review with trend analysis."""
    coordinator = _get_coordinator(hass, msg["person"])
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return

    ai_entity = ""
    for e in hass.config_entries.async_entries(DOMAIN):
        merged = {**e.data, **e.options}
        ai_entity = merged.get("ai_task_entity", "")
        if ai_entity:
            break

    if not ai_entity:
        connection.send_error(msg["id"], "no_ai_entity", "Geen AI Task entity geconfigureerd.")
        return

    ctx = coordinator.get_daily_review_context(msg["person"])

    # Build today's meals text
    cat_labels = {"breakfast": "Ontbijt", "lunch": "Lunch", "dinner": "Avondeten", "snack": "Tussendoor"}
    meals_text = ""
    for cat in ["breakfast", "lunch", "dinner", "snack"]:
        items = ctx["today_meals"].get(cat, [])
        if items:
            meals_text += f"  {cat_labels[cat]}: {', '.join(items)}\n"
    if not meals_text:
        meals_text = "  (nog niets gelogd)\n"

    # Today's totals vs goals
    totals_text = ""
    for key, goal in ctx["goals"].items():
        if goal <= 0:
            continue
        label = {"energy-kcal_100g": "Calorieen", "proteins_100g": "Eiwit", "carbohydrates_100g": "Koolhydraten", "fat_100g": "Vet", "fiber_100g": "Vezels"}.get(key, key)
        current = ctx["today_totals"].get(key, 0)
        week_avg = ctx["week_averages"].get(key, 0)
        totals_text += f"  {label}: vandaag {round(current)}, weekgemiddelde {round(week_avg)}, doel {round(goal)}\n"

    # Recurring patterns
    patterns_text = ""
    if ctx["recurring_items"]:
        for name, info in list(ctx["recurring_items"].items())[:5]:
            cats = ", ".join(cat_labels.get(c, c) for c in info["categories"])
            patterns_text += f"  - {name}: {info['count']}x in 7 dagen ({cats})\n"
    else:
        patterns_text = "  (geen duidelijke patronen)\n"

    try:
        result = await hass.services.async_call(
            "ai_task",
            "generate_data",
            {
                "task_name": "daily_nutrition_review",
                "entity_id": ai_entity,
                "instructions": (
                    "Je bent een persoonlijke voedingscoach. Geef een korte dagelijkse review in het Nederlands.\n\n"
                    f"VANDAAG GEGETEN:\n{meals_text}\n"
                    f"VOEDINGSWAARDEN (vandaag vs weekgemiddelde vs doel):\n{totals_text}\n"
                    f"TERUGKERENDE PATRONEN (afgelopen 7 dagen):\n{patterns_text}\n"
                    f"CONTEXT: {ctx['logged_days_count']} van de afgelopen 7 dagen gelogd.\n\n"
                    "INSTRUCTIES:\n"
                    "- Geef een review van vandaag (wat gaat goed, wat kan beter)\n"
                    "- Kijk of er trends zijn over de afgelopen week (consistent te laag/hoog ergens?)\n"
                    "- Als er terugkerende maaltijden zijn (bijv. elke dag brood als ontbijt), "
                    "overweeg of een kleine aanpassing daarvan een structureel tekort kan oplossen\n"
                    "- Wees positief en praktisch, max 4 bullet points\n"
                    "- Gebruik concrete suggesties met hoeveelheden waar mogelijk"
                ),
                "structure": {
                    "review": {
                        "description": "Dagelijkse voedingsreview als bullet points in het Nederlands. Elke bullet begint met '- '.",
                        "required": True,
                        "selector": {"text": {"multiline": True}},
                    }
                },
            },
            blocking=True,
            return_response=True,
        )
        review = (result or {}).get("data", {}).get("review", "")
        connection.send_result(msg["id"], {"review": review})
    except Exception as e:
        _LOGGER.error("AI daily review failed: %s", e)
        connection.send_error(msg["id"], "ai_error", str(e))


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


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_GET_STREAK,
        vol.Required("person"): str,
    }
)
@websocket_api.async_response
async def ws_get_streak(hass, connection, msg):
    """Return the current logging streak (consecutive days)."""
    coordinator = _get_coordinator(hass, msg["person"])
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    streak = coordinator.get_streak(msg["person"])
    connection.send_result(msg["id"], {"streak": streak})


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
        vol.Required("type"): WS_MERGE_PRODUCTS,
        vol.Required("keep_id"): str,
        vol.Required("remove_id"): str,
    }
)
@websocket_api.async_response
async def ws_merge_products(hass, connection, msg):
    """Merge two products into one."""
    coordinator = _get_coordinator(hass)
    if not coordinator:
        connection.send_error(msg["id"], "not_ready", "Coordinator not ready")
        return
    result = await coordinator.merge_products(msg["keep_id"], msg["remove_id"])
    if result:
        connection.send_result(msg["id"], {"product": result})
    else:
        connection.send_error(msg["id"], "not_found", "One or both products not found")


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
