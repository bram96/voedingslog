"""Voedingslog — Home Assistant custom component."""
from __future__ import annotations

import hashlib
import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.components import panel_custom
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    DOMAIN,
    SERVICE_LOG_PRODUCT,
    SERVICE_LOG_BARCODE,
    SERVICE_DELETE_LAST,
)
from .coordinator import VoedingslogCoordinator
from .websocket import async_register_commands

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the panel, static files, and WebSocket commands."""
    hass.data.setdefault(DOMAIN, {})

    # Serve the frontend files
    frontend_path = Path(__file__).parent / "frontend"
    should_cache = True

    # Use the modern static path registration if available (HA 2024.5+)
    try:
        from homeassistant.components.http import StaticPathConfig
        await hass.http.async_register_static_paths(
            [StaticPathConfig(
                url_path=f"/{DOMAIN}_frontend",
                path=str(frontend_path),
                cache_headers=should_cache,
            )]
        )
    except ImportError:
        hass.http.register_static_path(
            f"/{DOMAIN}_frontend", str(frontend_path), cache_headers=should_cache
        )

    # Register the sidebar panel with content hash for cache busting
    js_path = frontend_path / "voedingslog-panel.js"
    file_hash = hashlib.md5(js_path.read_bytes()).hexdigest()[:8]
    await panel_custom.async_register_panel(
        hass=hass,
        frontend_url_path=DOMAIN,
        webcomponent_name="voedingslog-panel",
        module_url=f"/{DOMAIN}_frontend/voedingslog-panel.js?v={file_hash}",
        sidebar_title="Voedingslog",
        sidebar_icon="mdi:food-apple",
        embed_iframe=False,
        require_admin=False,
    )

    # Register WebSocket commands
    async_register_commands(hass)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up a config entry."""
    opts = {**entry.data, **entry.options}
    persons = opts.get("personen", [])
    coordinator = VoedingslogCoordinator(hass, persons, entry.entry_id)
    await coordinator.async_load_from_store()
    await coordinator.async_config_entry_first_refresh()
    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _register_services(hass, coordinator)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    coordinator: VoedingslogCoordinator = hass.data[DOMAIN].pop(entry.entry_id)
    await coordinator.async_shutdown()
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


def _resolve_entry(hass: HomeAssistant, call: ServiceCall) -> tuple[VoedingslogCoordinator, str] | tuple[None, None]:
    """Resolve coordinator and person from a service call's config_entry_id."""
    entry_id = call.data.get("config_entry_id")
    if not entry_id:
        _LOGGER.error("config_entry_id is required")
        return None, None
    coord = hass.data.get(DOMAIN, {}).get(entry_id)
    if not coord:
        _LOGGER.error("Config entry %s not found", entry_id)
        return None, None
    return coord, coord.persons[0] if coord.persons else ""


def _register_services(hass: HomeAssistant, coordinator: VoedingslogCoordinator):
    """Register all HA services (once, routing to correct config entry)."""

    async def handle_log_barcode(call: ServiceCall):
        coord, person = _resolve_entry(hass, call)
        if not coord or not person:
            return
        barcode = call.data["barcode"]
        grams = call.data.get("gram")
        category = call.data.get("category")
        ok = await coord.log_barcode(person, barcode, grams, category)
        if not ok:
            _LOGGER.info("Barcode %s not found for %s", barcode, person)
            await _send_notification(
                hass, person,
                f"⚠️ Barcode {barcode} niet gevonden in Open Food Facts",
                "Voedingslog",
            )

    if not hass.services.has_service(DOMAIN, SERVICE_LOG_BARCODE):
        hass.services.async_register(
            DOMAIN,
            SERVICE_LOG_BARCODE,
            handle_log_barcode,
            schema=vol.Schema(
                {
                    vol.Required("config_entry_id"): cv.string,
                    vol.Required("barcode"): cv.string,
                    vol.Optional("gram"): vol.Coerce(float),
                    vol.Optional("category"): cv.string,
                }
            ),
        )

    async def handle_log_product(call: ServiceCall):
        coord, person = _resolve_entry(hass, call)
        if not coord or not person:
            return
        name = call.data["naam"]
        grams = call.data.get("gram", 100)
        category = call.data.get("category")
        ok = await coord.log_product_by_name(person, name, grams, category)
        if ok:
            log = coord.get_log_today(person)
            last = log[-1] if log else None
            if last:
                kcal = round(
                    last["nutrients"].get("energy-kcal_100g", 0) * grams / 100, 0
                )
                await _send_notification(
                    hass, person,
                    f"✅ {last['name']} ({grams}g) – {int(kcal)} kcal gelogd",
                    "Voedingslog",
                )

    if not hass.services.has_service(DOMAIN, SERVICE_LOG_PRODUCT):
        hass.services.async_register(
            DOMAIN,
            SERVICE_LOG_PRODUCT,
            handle_log_product,
            schema=vol.Schema(
                {
                    vol.Required("config_entry_id"): cv.string,
                    vol.Required("naam"): cv.string,
                    vol.Optional("gram", default=100): vol.Coerce(float),
                    vol.Optional("category"): cv.string,
                }
            ),
        )

    async def handle_delete_last(call: ServiceCall):
        coord, person = _resolve_entry(hass, call)
        if not coord or not person:
            return
        await coord.delete_last(person)

    if not hass.services.has_service(DOMAIN, SERVICE_DELETE_LAST):
        hass.services.async_register(
            DOMAIN,
            SERVICE_DELETE_LAST,
            handle_delete_last,
            schema=vol.Schema(
                {
                    vol.Required("config_entry_id"): cv.string,
                }
            ),
        )


async def _send_notification(hass: HomeAssistant, person: str, message: str, title: str):
    """Send a notification via the HA companion app."""
    try:
        await hass.services.async_call(
            "notify",
            "mobile_app",
            {"title": title, "message": message},
            blocking=False,
        )
    except Exception as e:
        _LOGGER.debug("Notification could not be sent: %s", e)
