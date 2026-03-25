"""Sensor platform voor Voedingslog — één sensor per nutrient per persoon."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, NUTRIENTEN
from .coordinator import VoedingslogCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: VoedingslogCoordinator = hass.data[DOMAIN][entry.entry_id]
    personen = entry.data["personen"]
    doelen = {
        "energy-kcal_100g": entry.data.get("doel_calorieen", 2000),
        "sodium_100g": entry.data.get("doel_natrium_mg", 2000) / 1000,
    }

    sensoren = []
    for persoon in personen:
        for nutrient_key, meta in NUTRIENTEN.items():
            sensoren.append(
                VoedingsSensor(coordinator, persoon, nutrient_key, meta, doelen)
            )
        # Extra: log-overzicht sensor
        sensoren.append(LogOverzichtSensor(coordinator, persoon))

    async_add_entities(sensoren, True)


class VoedingsSensor(CoordinatorEntity, SensorEntity):
    """Eén nutriëntsensor voor één persoon."""

    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_has_entity_name = True

    def __init__(self, coordinator, persoon, nutrient_key, meta, doelen):
        super().__init__(coordinator)
        self._persoon = persoon
        self._nutrient_key = nutrient_key
        self._meta = meta
        self._doelen = doelen
        persoon_slug = persoon.lower().replace(" ", "_")
        nutrient_slug = nutrient_key.replace("-", "_").replace("_100g", "")
        self._attr_unique_id = f"voedingslog_{persoon_slug}_{nutrient_slug}"
        self._attr_icon = meta["icon"]

    @property
    def name(self):
        return f"{self._persoon} – {self._meta['naam']}"

    @property
    def native_unit_of_measurement(self):
        return self._meta["eenheid"]

    @property
    def native_value(self):
        if not self.coordinator.data:
            return 0
        totalen = self.coordinator.data.get(self._persoon, {}).get("totalen", {})
        waarde = totalen.get(self._nutrient_key, 0.0)
        factor = self._meta.get("factor", 1)
        return round(waarde * factor, 1)

    @property
    def extra_state_attributes(self):
        attrs = {}
        if self._nutrient_key in self._doelen:
            doel = self._doelen[self._nutrient_key]
            factor = self._meta.get("factor", 1)
            huidig = (self.coordinator.data or {}).get(self._persoon, {}).get(
                "totalen", {}
            ).get(self._nutrient_key, 0.0)
            huidig_display = round(huidig * factor, 1)
            doel_display = round(doel * factor, 1)
            attrs["doel"] = doel_display
            attrs["resterend"] = round(max(0, doel_display - huidig_display), 1)
            attrs["percentage"] = round(min(100, huidig_display / doel_display * 100), 1) if doel_display else 0
        return attrs

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._persoon)},
            "name": f"Voedingslog – {self._persoon}",
            "manufacturer": "Open Food Facts",
            "model": "Voedingslog Custom Component",
        }


class LogOverzichtSensor(CoordinatorEntity, SensorEntity):
    """Toont het aantal gelogde items vandaag + details als attributen."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:clipboard-list"

    def __init__(self, coordinator, persoon):
        super().__init__(coordinator)
        self._persoon = persoon
        persoon_slug = persoon.lower().replace(" ", "_")
        self._attr_unique_id = f"voedingslog_{persoon_slug}_log_overzicht"

    @property
    def name(self):
        return f"{self._persoon} – Log vandaag"

    @property
    def native_unit_of_measurement(self):
        return "items"

    @property
    def native_value(self):
        log = self.coordinator.get_log_vandaag(self._persoon)
        return len(log)

    @property
    def extra_state_attributes(self):
        log = self.coordinator.get_log_vandaag(self._persoon)
        return {
            "items": [
                {
                    "naam": item["naam"],
                    "gram": item["gram"],
                    "tijdstip": item["tijdstip"],
                    "kcal": round(item["nutrienten"].get("energy-kcal_100g", 0) * item["gram"] / 100, 1),
                }
                for item in log
            ]
        }

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._persoon)},
            "name": f"Voedingslog – {self._persoon}",
            "manufacturer": "Open Food Facts",
            "model": "Voedingslog Custom Component",
        }
