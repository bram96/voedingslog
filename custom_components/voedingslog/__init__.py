"""Voedingslog — Home Assistant custom component."""
from __future__ import annotations

import logging
import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import (
    DOMAIN,
    SERVICE_LOG_PRODUCT,
    SERVICE_LOG_BARCODE,
    SERVICE_RESET_DAG,
    SERVICE_VERWIJDER_LOG,
)
from .coordinator import VoedingslogCoordinator

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})

    personen = entry.data["personen"]
    coordinator = VoedingslogCoordinator(hass, personen)
    await coordinator.async_config_entry_first_refresh()
    hass.data[DOMAIN][entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    _registreer_services(hass, coordinator)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator: VoedingslogCoordinator = hass.data[DOMAIN].pop(entry.entry_id)
    await coordinator.async_shutdown()
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


def _registreer_services(hass: HomeAssistant, coordinator: VoedingslogCoordinator):
    """Registreer alle HA services."""

    # --- log_barcode ---
    # Aanroepen vanuit automation of companion app barcode scanner
    async def handle_log_barcode(call: ServiceCall):
        persoon = call.data["persoon"]
        barcode = call.data["barcode"]
        gram = call.data.get("gram")
        ok = await coordinator.log_barcode(persoon, barcode, gram)
        if not ok:
            _LOGGER.warning("Barcode %s niet gevonden voor %s", barcode, persoon)
            # Stuur notificatie naar companion app
            await _stuur_notificatie(
                hass,
                persoon,
                f"⚠️ Barcode {barcode} niet gevonden in Open Food Facts",
                "Voedingslog",
            )

    hass.services.async_register(
        DOMAIN,
        SERVICE_LOG_BARCODE,
        handle_log_barcode,
        schema=vol.Schema(
            {
                vol.Required("persoon"): cv.string,
                vol.Required("barcode"): cv.string,
                vol.Optional("gram"): vol.Coerce(float),
            }
        ),
    )

    # --- log_product (op naam) ---
    async def handle_log_product(call: ServiceCall):
        persoon = call.data["persoon"]
        naam = call.data["naam"]
        gram = call.data.get("gram", 100)
        ok = await coordinator.log_product_naam(persoon, naam, gram)
        if ok:
            log = coordinator.get_log_vandaag(persoon)
            laatste = log[-1] if log else None
            if laatste:
                kcal = round(
                    laatste["nutrienten"].get("energy-kcal_100g", 0) * gram / 100, 0
                )
                await _stuur_notificatie(
                    hass,
                    persoon,
                    f"✅ {laatste['naam']} ({gram}g) – {int(kcal)} kcal gelogd",
                    "Voedingslog",
                )

    hass.services.async_register(
        DOMAIN,
        SERVICE_LOG_PRODUCT,
        handle_log_product,
        schema=vol.Schema(
            {
                vol.Required("persoon"): cv.string,
                vol.Required("naam"): cv.string,
                vol.Optional("gram", default=100): vol.Coerce(float),
            }
        ),
    )

    # --- reset_dag ---
    async def handle_reset_dag(call: ServiceCall):
        persoon = call.data["persoon"]
        dag = call.data.get("dag")
        await coordinator.reset_dag(persoon, dag)
        _LOGGER.info("Log gereset voor %s (dag: %s)", persoon, dag or "vandaag")

    hass.services.async_register(
        DOMAIN,
        SERVICE_RESET_DAG,
        handle_reset_dag,
        schema=vol.Schema(
            {
                vol.Required("persoon"): cv.string,
                vol.Optional("dag"): cv.string,
            }
        ),
    )

    # --- verwijder_laatste ---
    async def handle_verwijder_laatste(call: ServiceCall):
        persoon = call.data["persoon"]
        await coordinator.verwijder_laatste(persoon)

    hass.services.async_register(
        DOMAIN,
        SERVICE_VERWIJDER_LOG,
        handle_verwijder_laatste,
        schema=vol.Schema({vol.Required("persoon"): cv.string}),
    )


async def _stuur_notificatie(hass: HomeAssistant, persoon: str, bericht: str, titel: str):
    """Stuur een notificatie via de HA companion app."""
    try:
        await hass.services.async_call(
            "notify",
            "mobile_app",  # pas aan naar jouw apparaatnaam, bijv. mobile_app_iphone_jan
            {"title": titel, "message": bericht},
            blocking=False,
        )
    except Exception as e:
        _LOGGER.debug("Notificatie kon niet worden gestuurd: %s", e)
