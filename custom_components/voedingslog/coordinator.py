"""Data coordinator for Voedingslog — manages daily logs per person."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, date

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import DOMAIN, NUTRIENTS, MEAL_CATEGORIES
from .open_food_facts import lookup_by_barcode, search_by_name

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = f"{DOMAIN}.logs"
STORAGE_KEY_MEALS = f"{DOMAIN}.meals"
STORAGE_KEY_PRODUCTS = f"{DOMAIN}.products"
STORAGE_VERSION = 1


def _default_category() -> str:
    """Return a meal category based on the current time of day."""
    hour = datetime.now().hour
    if hour < 10:
        return "breakfast"
    if hour < 14:
        return "lunch"
    if hour < 17:
        return "snack"
    return "dinner"


class VoedingslogCoordinator(DataUpdateCoordinator):
    """Keeps daily nutrition logs for all persons, persisted to disk."""

    def __init__(self, hass: HomeAssistant, persons: list[str]):
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
        )
        self.persons = persons
        # { "Jan": { "2024-01-15": [ {name, grams, nutrients, time, category}, ... ] } }
        self._logs: dict[str, dict[str, list]] = {p: {} for p in persons}
        self._session: aiohttp.ClientSession | None = None
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._meals_store = Store(hass, STORAGE_VERSION, STORAGE_KEY_MEALS)
        self._products_store = Store(hass, STORAGE_VERSION, STORAGE_KEY_PRODUCTS)
        self._meals: list[dict] = []
        # Product cache: list of {name, serving_grams, nutrients, portions?}
        self._product_cache: list[dict] = []

    async def async_load_from_store(self) -> None:
        """Load persisted logs and meals from disk."""
        data = await self._store.async_load()
        if data and isinstance(data, dict):
            for person in self.persons:
                if person in data:
                    self._logs[person] = data[person]
            _LOGGER.info("Loaded persisted logs for %d persons", len(self.persons))

        meals_data = await self._meals_store.async_load()
        if meals_data and isinstance(meals_data, list):
            self._meals = meals_data
            _LOGGER.info("Loaded %d custom meals", len(self._meals))

        products_data = await self._products_store.async_load()
        if products_data and isinstance(products_data, list):
            self._product_cache = products_data
            _LOGGER.info("Loaded %d cached products", len(self._product_cache))

    async def _async_save(self) -> None:
        """Persist current logs to disk."""
        await self._store.async_save(self._logs)

    async def _async_update_data(self) -> dict:
        """Calculate totals for today for all persons."""
        today = str(date.today())
        result = {}
        for person in self.persons:
            items = self._logs[person].get(today, [])
            totals = {k: 0.0 for k in NUTRIENTS}
            for item in items:
                gram_factor = item["grams"] / 100.0
                for nutrient in NUTRIENTS:
                    value = item["nutrients"].get(nutrient, 0.0)
                    totals[nutrient] += value * gram_factor
            result[person] = {
                "totals": totals,
                "log": items,
                "date": today,
            }
        return result

    # ------------------------------------------------------------------
    # Public methods (called from services and websocket handlers)
    # ------------------------------------------------------------------

    async def log_barcode(
        self, person: str, barcode: str, grams: float | None = None, category: str | None = None
    ) -> bool:
        """Look up a product by barcode and log it."""
        session = await self._get_session()
        product = await lookup_by_barcode(session, barcode)
        if not product:
            _LOGGER.debug("Barcode %s not found", barcode)
            return False
        await self._add_item(person, product, grams or product["serving_grams"], category)
        return True

    async def log_product_by_name(
        self, person: str, name: str, grams: float = 100, category: str | None = None
    ) -> bool:
        """Search a product by name and log the first result."""
        session = await self._get_session()
        results = await search_by_name(session, name)
        if not results:
            _LOGGER.warning("Product '%s' not found", name)
            return False
        await self._add_item(person, results[0], grams, category)
        return True

    async def log_manual(
        self,
        person: str,
        name: str,
        grams: float,
        nutrients: dict[str, float],
        category: str | None = None,
        day: str | None = None,
    ):
        """Log a product with manually provided values."""
        product = {"name": name, "serving_grams": grams, "nutrients": nutrients}
        await self._add_item(person, product, grams, category, day)

    async def edit_item(
        self,
        person: str,
        index: int,
        grams: float | None = None,
        category: str | None = None,
        nutrients: dict | None = None,
        name: str | None = None,
        day: str | None = None,
    ) -> bool:
        """Edit an existing log item (grams, category, nutrients, name)."""
        day = day or str(date.today())
        log = self._logs[person].get(day, [])
        if not (0 <= index < len(log)):
            return False
        item = log[index]
        if grams is not None:
            item["grams"] = grams
        if category and category in MEAL_CATEGORIES:
            item["category"] = category
        if nutrients is not None:
            item["nutrients"] = nutrients
        if name is not None:
            item["name"] = name
        _LOGGER.info("Edited: %s for %s (%.0fg, %s)", item["name"], person, item["grams"], item["category"])
        await self.async_refresh()
        await self._async_save()
        return True

    async def lookup_barcode(self, barcode: str) -> dict | None:
        """Look up a product by barcode without logging it."""
        session = await self._get_session()
        return await lookup_by_barcode(session, barcode)

    def search_products_local(self, query: str) -> list[dict]:
        """Search the local product cache."""
        q = query.lower()
        return [p for p in self._product_cache if q in p.get("name", "").lower()][:10]

    async def search_products_online(self, query: str) -> list[dict]:
        """Search products via Open Food Facts API."""
        session = await self._get_session()
        return await search_by_name(session, query)

    def get_favorites(self) -> list[dict]:
        """Return favorite products."""
        return [p for p in self._product_cache if p.get("favorite")]

    def get_cached_products(self) -> list[dict]:
        """Return all cached (logged) products."""
        return self._product_cache

    async def toggle_favorite(self, product_name: str) -> bool:
        """Toggle favorite status for a cached product. Returns new state."""
        for p in self._product_cache:
            if p.get("name") == product_name:
                p["favorite"] = not p.get("favorite", False)
                await self._async_save_products()
                return p["favorite"]
        return False

    def _cache_product(self, product: dict) -> None:
        """Add a product to the local cache when it's actually logged."""
        name = product.get("name", "")
        if not name:
            return
        if any(p.get("name") == name for p in self._product_cache):
            return
        self._product_cache.append({
            "name": product["name"],
            "serving_grams": product.get("serving_grams", 100),
            "nutrients": product.get("nutrients", {}),
            "portions": product.get("portions", []),
            "favorite": False,
        })

    async def _async_save_products(self) -> None:
        """Persist product cache to disk."""
        await self._products_store.async_save(self._product_cache)

    async def delete_item(self, person: str, index: int, day: str | None = None):
        """Delete an item by index from a person's log."""
        day = day or str(date.today())
        log = self._logs[person].get(day, [])
        if 0 <= index < len(log):
            removed = log.pop(index)
            _LOGGER.info("Deleted: %s for %s", removed["name"], person)
            await self.async_refresh()
            await self._async_save()

    async def delete_last(self, person: str):
        """Delete the last item from today's log."""
        today = str(date.today())
        log = self._logs[person].get(today, [])
        if log:
            removed = log.pop()
            _LOGGER.info("Deleted: %s for %s", removed["name"], person)
            await self.async_refresh()
            await self._async_save()

    async def reset_day(self, person: str, day: str | None = None):
        """Clear the log for a day (default: today)."""
        day = day or str(date.today())
        self._logs[person][day] = []
        await self.async_refresh()
        await self._async_save()

    def get_log_for_date(self, person: str, day: str | None = None) -> list[dict]:
        """Return the log for a specific date."""
        day = day or str(date.today())
        return self._logs[person].get(day, [])

    def get_log_today(self, person: str) -> list[dict]:
        """Return today's log for a person."""
        return self._logs[person].get(str(date.today()), [])

    # ------------------------------------------------------------------
    # Custom meals (recipes)
    # ------------------------------------------------------------------

    def get_meals(self) -> list[dict]:
        """Return all custom meals."""
        return self._meals

    async def save_meal(self, meal: dict) -> dict:
        """Create or update a custom meal. Computes nutrients_per_100g from ingredients."""
        ingredients = meal.get("ingredients", [])
        total_grams = sum(i.get("grams", 0) for i in ingredients)

        # Calculate combined nutrients per 100g
        nutrients_per_100g: dict[str, float] = {}
        if total_grams > 0:
            for key in NUTRIENTS:
                total_value = sum(
                    i.get("nutrients", {}).get(key, 0) * i.get("grams", 0) / 100
                    for i in ingredients
                )
                nutrients_per_100g[key] = total_value / total_grams * 100
        else:
            nutrients_per_100g = {k: 0.0 for k in NUTRIENTS}

        meal_id = meal.get("id") or str(uuid.uuid4())[:8]
        preferred_portion = meal.get("preferred_portion")
        saved = {
            "id": meal_id,
            "name": meal.get("name", "Naamloze maaltijd"),
            "ingredients": ingredients,
            "total_grams": total_grams,
            "nutrients_per_100g": nutrients_per_100g,
            "preferred_portion": preferred_portion,
            "favorite": meal.get("favorite", False),
        }

        # Update existing or append
        idx = next((i for i, m in enumerate(self._meals) if m["id"] == meal_id), None)
        if idx is not None:
            self._meals[idx] = saved
        else:
            self._meals.append(saved)

        await self._meals_store.async_save(self._meals)
        _LOGGER.info("Saved meal: %s (%d ingredients, %.0fg total)", saved["name"], len(ingredients), total_grams)
        return saved

    async def delete_meal(self, meal_id: str) -> bool:
        """Delete a custom meal by ID."""
        idx = next((i for i, m in enumerate(self._meals) if m["id"] == meal_id), None)
        if idx is not None:
            removed = self._meals.pop(idx)
            await self._meals_store.async_save(self._meals)
            _LOGGER.info("Deleted meal: %s", removed["name"])
            return True
        return False

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _add_item(
        self, person: str, product: dict, grams: float, category: str | None = None, day: str | None = None
    ):
        if person not in self._logs:
            _LOGGER.error("Unknown person: %s", person)
            return
        target_day = day or str(date.today())
        if target_day not in self._logs[person]:
            self._logs[person][target_day] = []

        cat = category if category in MEAL_CATEGORIES else _default_category()

        self._logs[person][target_day].append(
            {
                "name": product["name"],
                "grams": grams,
                "nutrients": product["nutrients"],
                "time": datetime.now().strftime("%H:%M"),
                "category": cat,
            }
        )
        _LOGGER.info("Logged: %s (%.0fg) for %s [%s] on %s", product["name"], grams, person, cat, target_day)
        self._cache_product(product)
        await self.async_refresh()
        await self._async_save()
        await self._async_save_products()

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                headers={"User-Agent": "HomeAssistant-Voedingslog/2.0"}
            )
        return self._session

    async def async_shutdown(self):
        await self._async_save()
        if self._session and not self._session.closed:
            await self._session.close()
