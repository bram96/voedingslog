"""AI-related WebSocket handlers for Voedingslog (photo, text, handwriting)."""
from __future__ import annotations

import base64
import json
import logging
import re
import uuid
from pathlib import Path

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    NUTRIENTS,
    WS_ANALYZE_PHOTO,
    WS_PARSE_TEXT,
    WS_PARSE_HANDWRITING,
)

_LOGGER = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────────

def get_ai_entity(hass: HomeAssistant) -> str:
    """Get the AI task entity from any config entry."""
    for e in hass.config_entries.async_entries(DOMAIN):
        merged = {**e.data, **e.options}
        entity = merged.get("ai_task_entity", "")
        if entity:
            return entity
    return ""


async def save_temp_image(hass: HomeAssistant, photo_b64: str) -> tuple[dict, Path]:
    """Save base64 image to media dir, return (attachment dict, file path)."""
    # Try standard media directories: /media, then config/media
    media_dir = Path("/media")
    if not media_dir.is_dir():
        media_dir = Path(hass.config.path("media"))
    media_dir.mkdir(exist_ok=True)
    filename = f"voedingslog_temp_{uuid.uuid4().hex[:8]}.jpg"
    file_path = media_dir / filename
    file_path.write_bytes(base64.b64decode(photo_b64))
    attachment = {
        "media_content_id": f"media-source://media_source/local/{filename}",
        "media_content_type": "image/jpeg",
    }
    return attachment, file_path


def cleanup_temp_image(file_path: Path | None) -> None:
    """Delete temp image file after use."""
    try:
        if file_path and file_path.exists():
            file_path.unlink()
    except Exception:
        pass


def _extract_json_array(raw: str) -> list:
    """Extract a JSON array from a string that may contain extra text."""
    if not isinstance(raw, str):
        return raw if isinstance(raw, list) else []
    # Strip markdown code fences
    raw = re.sub(r"```json\s*", "", raw)
    raw = re.sub(r"```\s*", "", raw)
    raw = raw.strip()
    # Find the JSON array
    start = raw.find("[")
    end = raw.rfind("]")
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start:end + 1])
        except json.JSONDecodeError:
            pass
    # Try parsing the whole thing
    try:
        result = json.loads(raw)
        return result if isinstance(result, list) else []
    except json.JSONDecodeError:
        _LOGGER.warning("Could not parse AI items_json: %s", raw[:200])
        return []


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


async def lookup_parsed_items(hass: HomeAssistant, get_coordinator, items: list[dict]) -> list[dict]:
    """Look up parsed food items in product cache and OFF."""
    coordinator = get_coordinator(hass)
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


# ── Photo analysis ───────────────────────────────────────────────

@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_ANALYZE_PHOTO,
        vol.Required("photo_b64"): str,
    }
)
@websocket_api.async_response
async def ws_analyze_photo(hass, connection, msg):
    """Analyze a photo of a nutrition label using HA AI Task."""
    ai_entity = get_ai_entity(hass)
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

    attachment, temp_path = await save_temp_image(hass, msg["photo_b64"])
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
        cleanup_temp_image(temp_path)


# ── Text & handwriting parsing ───────────────────────────────────

def _create_parse_handler(get_coordinator):
    """Create parse handlers with coordinator access."""

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_PARSE_TEXT,
            vol.Required("text"): str,
        }
    )
    @websocket_api.async_response
    async def ws_parse_text(hass, connection, msg):
        """Parse a text description of food into individual products."""
        ai_entity = get_ai_entity(hass)
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
            items = _extract_json_array(raw)
            products = await lookup_parsed_items(hass, get_coordinator, items)
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
        ai_entity = get_ai_entity(hass)
        if not ai_entity:
            connection.send_error(
                msg["id"], "no_ai_entity",
                "Geen AI Task entity geconfigureerd."
            )
            return

        attachment, temp_path = await save_temp_image(hass, msg["photo_b64"])
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
            items = _extract_json_array(raw)
            products = await lookup_parsed_items(hass, get_coordinator, items)
            connection.send_result(msg["id"], {"products": products})

        except Exception as e:
            _LOGGER.error("AI handwriting parsing failed: %s", e)
            connection.send_error(msg["id"], "ai_error", str(e))
        finally:
            cleanup_temp_image(temp_path)

    return ws_parse_text, ws_parse_handwriting


def register_ai_commands(hass: HomeAssistant, get_coordinator) -> None:
    """Register all AI-related WebSocket commands."""
    websocket_api.async_register_command(hass, ws_analyze_photo)
    ws_text, ws_hw = _create_parse_handler(get_coordinator)
    websocket_api.async_register_command(hass, ws_text)
    websocket_api.async_register_command(hass, ws_hw)
