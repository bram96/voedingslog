"""Sensor platform for Voedingslog — one sensor per nutrient per person."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN, NUTRIENTS
from .coordinator import VoedingslogCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: VoedingslogCoordinator = hass.data[DOMAIN][entry.entry_id]
    persons = entry.data["personen"]
    goals = {
        "energy-kcal_100g": entry.data.get("doel_calorieen", 2000),
    }

    entities = []
    for person in persons:
        for nutrient_key, meta in NUTRIENTS.items():
            entities.append(
                NutrientSensor(coordinator, person, nutrient_key, meta, goals)
            )
        entities.append(LogOverviewSensor(coordinator, person))

    async_add_entities(entities, True)


class NutrientSensor(CoordinatorEntity, SensorEntity):
    """A single nutrient sensor for one person."""

    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_has_entity_name = True

    def __init__(self, coordinator, person, nutrient_key, meta, goals):
        super().__init__(coordinator)
        self._person = person
        self._nutrient_key = nutrient_key
        self._meta = meta
        self._goals = goals
        person_slug = person.lower().replace(" ", "_")
        nutrient_slug = nutrient_key.replace("-", "_").replace("_100g", "")
        self._attr_unique_id = f"voedingslog_{person_slug}_{nutrient_slug}"
        self._attr_icon = meta["icon"]

    @property
    def name(self):
        return f"{self._person} – {self._meta['label']}"

    @property
    def native_unit_of_measurement(self):
        return self._meta["unit"]

    @property
    def native_value(self):
        if not self.coordinator.data:
            return 0
        totals = self.coordinator.data.get(self._person, {}).get("totals", {})
        value = totals.get(self._nutrient_key, 0.0)
        factor = self._meta.get("factor", 1)
        return round(value * factor, 1)

    @property
    def extra_state_attributes(self):
        attrs = {}
        if self._nutrient_key in self._goals:
            goal = self._goals[self._nutrient_key]
            factor = self._meta.get("factor", 1)
            current = (self.coordinator.data or {}).get(self._person, {}).get(
                "totals", {}
            ).get(self._nutrient_key, 0.0)
            current_display = round(current * factor, 1)
            goal_display = round(goal * factor, 1)
            attrs["doel"] = goal_display
            attrs["resterend"] = round(max(0, goal_display - current_display), 1)
            attrs["percentage"] = round(min(100, current_display / goal_display * 100), 1) if goal_display else 0
        return attrs

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._person)},
            "name": f"Voedingslog – {self._person}",
            "manufacturer": "Open Food Facts",
            "model": "Voedingslog Custom Component",
        }


class LogOverviewSensor(CoordinatorEntity, SensorEntity):
    """Shows the number of logged items today + details as attributes."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:clipboard-list"

    def __init__(self, coordinator, person):
        super().__init__(coordinator)
        self._person = person
        person_slug = person.lower().replace(" ", "_")
        self._attr_unique_id = f"voedingslog_{person_slug}_log_overzicht"

    @property
    def name(self):
        return f"{self._person} – Log vandaag"

    @property
    def native_unit_of_measurement(self):
        return "items"

    @property
    def native_value(self):
        log = self.coordinator.get_log_today(self._person)
        return len(log)

    @property
    def extra_state_attributes(self):
        log = self.coordinator.get_log_today(self._person)
        return {
            "items": [
                {
                    "naam": item["name"],
                    "gram": item["grams"],
                    "tijdstip": item["time"],
                    "categorie": item.get("category", "snack"),
                    "kcal": round(item["nutrients"].get("energy-kcal_100g", 0) * item["grams"] / 100, 1),
                }
                for item in log
            ]
        }

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self._person)},
            "name": f"Voedingslog – {self._person}",
            "manufacturer": "Open Food Facts",
            "model": "Voedingslog Custom Component",
        }
