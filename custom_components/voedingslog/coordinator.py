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
STORAGE_KEY_PRODUCTS_V2 = f"{DOMAIN}.products_v2"
# Old keys (used only for migration)
_OLD_STORAGE_KEY_MEALS = f"{DOMAIN}.meals"
_OLD_STORAGE_KEY_PRODUCTS = f"{DOMAIN}.products"
STORAGE_VERSION = 1

_MIGRATION_FLAG = f"{DOMAIN}_products_migrated"


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


def _compute_nutrients_from_components(components: list[dict]) -> dict[str, float]:
    """Compute nutrients per 100g from a list of components with grams + nutrients."""
    total_grams = sum(c.get("grams", 0) for c in components)
    if total_grams <= 0:
        return {k: 0.0 for k in NUTRIENTS}
    nutrients: dict[str, float] = {}
    for key in NUTRIENTS:
        total_value = sum(
            c.get("nutrients", {}).get(key, 0) * c.get("grams", 0) / 100
            for c in components
        )
        nutrients[key] = total_value / total_grams * 100
    return nutrients


class VoedingslogCoordinator(DataUpdateCoordinator):
    """Keeps daily nutrition logs for all persons, persisted to disk."""

    def __init__(self, hass: HomeAssistant, persons: list[str], entry_id: str = ""):
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
        )
        self.persons = persons
        self._entry_id = entry_id
        # { "Jan": { "2024-01-15": [ {name, grams, nutrients, time, category}, ... ] } }
        self._logs: dict[str, dict[str, list]] = {p: {} for p in persons}
        self._session: aiohttp.ClientSession | None = None
        # Logs are per-entry so each person has their own storage
        log_key = f"{STORAGE_KEY}.{entry_id}" if entry_id else STORAGE_KEY
        self._store = Store(hass, STORAGE_VERSION, log_key)
        # Unified product store (shared across all entries)
        self._products_store = Store(hass, STORAGE_VERSION, STORAGE_KEY_PRODUCTS_V2)
        self._products: list[dict] = []

    async def async_load_from_store(self) -> None:
        """Load persisted logs and products from disk."""
        data = await self._store.async_load()
        if data and isinstance(data, dict):
            for person in self.persons:
                if person in data:
                    self._logs[person] = data[person]
            _LOGGER.info("Loaded persisted logs for %d persons", len(self.persons))
        elif self._entry_id:
            # Migration: try loading from the old shared storage key
            old_store = Store(self.hass, STORAGE_VERSION, STORAGE_KEY)
            old_data = await old_store.async_load()
            if old_data and isinstance(old_data, dict):
                for person in self.persons:
                    if person in old_data:
                        self._logs[person] = old_data[person]
                        _LOGGER.info("Migrated logs for %s from shared storage", person)
                if any(self._logs[p] for p in self.persons):
                    await self._async_save()

        # Load unified products (or migrate from old stores)
        await self._load_or_migrate_products()

    async def _load_or_migrate_products(self) -> None:
        """Load unified product store, or migrate from old meals + products stores."""
        products_data = await self._products_store.async_load()

        # Check if old stores still exist and should be re-migrated
        old_products_store = Store(self.hass, STORAGE_VERSION, _OLD_STORAGE_KEY_PRODUCTS)
        old_meals_store = Store(self.hass, STORAGE_VERSION, _OLD_STORAGE_KEY_MEALS)
        old_products = await old_products_store.async_load() or []
        old_meals = await old_meals_store.async_load() or []
        has_old_data = bool(old_products or old_meals)

        if products_data and isinstance(products_data, list) and not has_old_data:
            # New store exists and old stores are gone — normal load
            self._products = products_data
            _LOGGER.info("Loaded %d products", len(self._products))
            return

        if products_data and isinstance(products_data, list) and not has_old_data:
            self._products = products_data
            return

        # Check if another coordinator already migrated this run
        if self.hass.data.get(_MIGRATION_FLAG):
            products_data = await self._products_store.async_load()
            if products_data and isinstance(products_data, list):
                self._products = products_data
            return

        # Mark migration as in progress
        self.hass.data[_MIGRATION_FLAG] = True

        if not has_old_data:
            if products_data and isinstance(products_data, list):
                self._products = products_data
            _LOGGER.info("No old products or meals to migrate")
            return

        # Migrate ALL old products (no pruning — other entries may not be loaded yet)
        migrated: list[dict] = []
        if isinstance(old_products, list):
            for p in old_products:
                name = p.get("name", "")
                if not name:
                    continue
                migrated.append({
                    "id": str(uuid.uuid4())[:8],
                    "type": "base",
                    "name": name,
                    "serving_grams": p.get("serving_grams", 100),
                    "nutrients": p.get("nutrients", {}),
                    "portions": p.get("portions", []),
                    "favorite": p.get("favorite", False),
                })

        # Migrate ALL old meals as recipes
        if isinstance(old_meals, list):
            for m in old_meals:
                migrated.append({
                    "id": m.get("id") or str(uuid.uuid4())[:8],
                    "type": "recipe",
                    "recipe_type": "fixed",
                    "name": m.get("name", ""),
                    "ingredients": m.get("ingredients", []),
                    "total_grams": m.get("total_grams", 0),
                    "nutrients": m.get("nutrients_per_100g", {}),
                    "preferred_portion": m.get("preferred_portion"),
                    "favorite": m.get("favorite", False),
                })

        self._products = migrated
        await self._async_save_products()

        # Remove old store files now that migration is complete
        await old_products_store.async_remove()
        await old_meals_store.async_remove()

        _LOGGER.info(
            "Migrated products: %d base, %d recipes (old stores removed)",
            sum(1 for p in migrated if p["type"] == "base"),
            sum(1 for p in migrated if p["type"] == "recipe"),
        )

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
        components: list[dict] | None = None,
    ):
        """Log a product with manually provided values."""
        product = {"name": name, "serving_grams": grams, "nutrients": nutrients}
        await self._add_item(person, product, grams, category, day, components)

    async def edit_item(
        self,
        person: str,
        index: int,
        grams: float | None = None,
        category: str | None = None,
        nutrients: dict | None = None,
        name: str | None = None,
        day: str | None = None,
        components: list[dict] | None = None,
    ) -> bool:
        """Edit an existing log item (grams, category, nutrients, name, components)."""
        day = day or str(date.today())
        log = self._logs[person].get(day, [])
        if not (0 <= index < len(log)):
            return False
        item = log[index]
        if components is not None:
            # Recalculate from components
            item["components"] = components
            total_grams = sum(c.get("grams", 0) for c in components)
            item["grams"] = total_grams
            item["nutrients"] = _compute_nutrients_from_components(components)
        else:
            if grams is not None:
                item["grams"] = grams
            if nutrients is not None:
                item["nutrients"] = nutrients
        if category and category in MEAL_CATEGORIES:
            item["category"] = category
        if name is not None:
            item["name"] = name
        _LOGGER.info("Edited: %s for %s (%.0fg, %s)", item["name"], person, item["grams"], item["category"])
        await self.async_refresh()
        await self._async_save()
        return True

    async def lookup_barcode(self, barcode: str) -> dict | None:
        """Look up a product by barcode — checks local products first, then OFF."""
        # Check local products by barcode
        for p in self._products:
            if p.get("barcode") == barcode:
                return p

        # Fall back to OFF API
        session = await self._get_session()
        product = await lookup_by_barcode(session, barcode)
        if product:
            # Store barcode on existing product or cache as new
            product["barcode"] = barcode
            self._store_barcode(product["name"], barcode)
        return product

    def _store_barcode(self, product_name: str, barcode: str) -> None:
        """Store barcode on an existing product if found by name."""
        for p in self._products:
            if p.get("name") == product_name:
                if p.get("barcode") != barcode:
                    p["barcode"] = barcode

    def search_products_local(self, query: str) -> list[dict]:
        """Search the unified product list by name and aliases."""
        q = query.lower()
        results = []
        for p in self._products:
            if q in p.get("name", "").lower():
                results.append(p)
            elif any(q in a.lower() for a in p.get("aliases", [])):
                results.append(p)
            if len(results) >= 10:
                break
        return results

    async def search_products_online(self, query: str) -> list[dict]:
        """Search products via Open Food Facts API."""
        session = await self._get_session()
        return await search_by_name(session, query)

    def get_favorites(self) -> list[dict]:
        """Return favorite products."""
        return [p for p in self._products if p.get("favorite")]

    def get_products(self, product_type: str | None = None) -> list[dict]:
        """Return all products, optionally filtered by type."""
        if product_type:
            return [p for p in self._products if p.get("type") == product_type]
        return self._products

    def _get_product_by_id(self, product_id: str) -> dict | None:
        """Find a product by ID."""
        return next((p for p in self._products if p.get("id") == product_id), None)

    def _resolve_ingredient_nutrients(self, ingredients: list[dict]) -> list[dict]:
        """Resolve ingredient nutrients from product store via product_id."""
        resolved = []
        for ing in ingredients:
            pid = ing.get("product_id")
            if pid:
                source = self._get_product_by_id(pid)
                if source:
                    resolved.append({
                        "product_id": pid,
                        "name": source.get("name", ing.get("name", "")),
                        "grams": ing.get("grams", 0),
                        "nutrients": source.get("nutrients", {}),
                    })
                    continue
            # No product_id or product not found — keep inline data
            resolved.append(ing)
        return resolved

    def _refresh_recipes_for_product(self, product_id: str) -> bool:
        """Refresh nutrients of all recipes that reference a product. Returns True if any updated."""
        updated = False
        for p in self._products:
            if p.get("type") != "recipe":
                continue
            refs = [i for i in p.get("ingredients", []) if i.get("product_id") == product_id]
            if not refs:
                continue
            p["ingredients"] = self._resolve_ingredient_nutrients(p["ingredients"])
            p["nutrients"] = _compute_nutrients_from_components(p["ingredients"])
            p["total_grams"] = sum(i.get("grams", 0) for i in p["ingredients"])
            updated = True
        return updated

    async def save_product(self, data: dict) -> dict:
        """Create or update a product (base or recipe)."""
        product_id = data.get("id") or str(uuid.uuid4())[:8]
        product_type = data.get("type", "base")

        # Preserve existing aliases and barcode on update
        existing = next((p for p in self._products if p["id"] == product_id), None)
        aliases = data.get("aliases", existing.get("aliases", []) if existing else [])
        barcode = data.get("barcode", existing.get("barcode") if existing else None)

        if product_type == "recipe":
            ingredients = self._resolve_ingredient_nutrients(data.get("ingredients", []))
            total_grams = sum(i.get("grams", 0) for i in ingredients)
            nutrients = _compute_nutrients_from_components(ingredients)
            saved = {
                "id": product_id,
                "type": "recipe",
                "recipe_type": data.get("recipe_type", "fixed"),
                "name": data.get("name", "Naamloos recept"),
                "ingredients": ingredients,
                "total_grams": total_grams,
                "nutrients": nutrients,
                "preferred_portion": data.get("preferred_portion"),
                "aliases": aliases,
                "favorite": data.get("favorite", False),
            }
        else:
            saved = {
                "id": product_id,
                "type": "base",
                "name": data.get("name", "Naamloos product"),
                "serving_grams": data.get("serving_grams", 100),
                "nutrients": data.get("nutrients", {}),
                "portions": data.get("portions", []),
                "barcode": barcode,
                "aliases": aliases,
                "favorite": data.get("favorite", False),
            }

        # Update existing or append
        idx = next((i for i, p in enumerate(self._products) if p["id"] == product_id), None)
        if idx is not None:
            self._products[idx] = saved
        else:
            self._products.append(saved)

        # If a base product changed, refresh all recipes referencing it
        if product_type == "base":
            self._refresh_recipes_for_product(product_id)

        await self._async_save_products()
        _LOGGER.info("Saved product: %s (type=%s)", saved["name"], saved["type"])
        return saved

    async def delete_product(self, product_id: str) -> bool:
        """Delete a product by ID."""
        idx = next((i for i, p in enumerate(self._products) if p["id"] == product_id), None)
        if idx is not None:
            removed = self._products.pop(idx)
            await self._async_save_products()
            _LOGGER.info("Deleted product: %s", removed["name"])
            return True
        return False

    async def toggle_favorite(self, product_id: str) -> bool:
        """Toggle favorite status for a product by ID. Returns new state."""
        for p in self._products:
            if p.get("id") == product_id:
                p["favorite"] = not p.get("favorite", False)
                await self._async_save_products()
                return p["favorite"]
        return False

    async def cleanup_unused_products(self) -> int:
        """Remove base products not referenced in any log or recipe. Returns number removed."""
        # Collect all product names from logs across ALL coordinators
        logged_names: set[str] = set()
        entries = self.hass.data.get(DOMAIN, {})
        for coord in entries.values():
            if not isinstance(coord, VoedingslogCoordinator):
                continue
            for person_logs in coord._logs.values():
                for day_items in person_logs.values():
                    for item in day_items:
                        logged_names.add(item.get("name", ""))

        # Collect product IDs referenced by recipe ingredients
        recipe_refs: set[str] = set()
        for p in self._products:
            if p.get("type") == "recipe":
                for ing in p.get("ingredients", []):
                    pid = ing.get("product_id")
                    if pid:
                        recipe_refs.add(pid)

        # Keep: recipes, favorites, products in logs, products referenced by recipes
        before = len(self._products)
        self._products = [
            p for p in self._products
            if p.get("type") == "recipe"
            or p.get("favorite")
            or p.get("name", "") in logged_names
            or p.get("id") in recipe_refs
        ]
        removed = before - len(self._products)
        if removed > 0:
            await self._async_save_products()
            _LOGGER.info("Cleaned up %d unused products", removed)
        return removed

    async def add_alias(self, product_id: str, alias: str) -> bool:
        """Add an alias to a product. Returns True if added."""
        alias = alias.strip().lower()
        if not alias:
            return False
        for p in self._products:
            if p.get("id") == product_id:
                aliases = p.get("aliases", [])
                # Skip if alias matches the product name or already exists
                if alias == p.get("name", "").lower():
                    return False
                if alias not in [a.lower() for a in aliases]:
                    aliases.append(alias)
                    p["aliases"] = aliases
                    await self._async_save_products()
                    return True
                return False
        return False

    def _cache_product(self, product: dict) -> None:
        """Add a product to the unified store when it's actually logged."""
        name = product.get("name", "")
        if not name:
            return
        if any(p.get("name") == name for p in self._products):
            # Update barcode on existing product if provided
            barcode = product.get("barcode")
            if barcode:
                self._store_barcode(name, barcode)
            return
        self._products.append({
            "id": str(uuid.uuid4())[:8],
            "type": "base",
            "name": product["name"],
            "serving_grams": product.get("serving_grams", 100),
            "nutrients": product.get("nutrients", {}),
            "portions": product.get("portions", []),
            "barcode": product.get("barcode"),
            "aliases": [],
            "favorite": False,
        })

    async def _async_save_products(self) -> None:
        """Persist unified product store to disk."""
        await self._products_store.async_save(self._products)

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
    # Internal
    # ------------------------------------------------------------------

    async def _add_item(
        self, person: str, product: dict, grams: float,
        category: str | None = None, day: str | None = None,
        components: list[dict] | None = None,
    ):
        if person not in self._logs:
            _LOGGER.error("Unknown person: %s", person)
            return
        target_day = day or str(date.today())
        if target_day not in self._logs[person]:
            self._logs[person][target_day] = []

        cat = category if category in MEAL_CATEGORIES else _default_category()

        item: dict = {
            "name": product["name"],
            "grams": grams,
            "nutrients": product["nutrients"],
            "time": datetime.now().strftime("%H:%M"),
            "category": cat,
        }
        if components:
            item["components"] = components

        self._logs[person][target_day].append(item)
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
