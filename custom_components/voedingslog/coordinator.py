"""Data coordinator for Voedingslog — manages daily logs per person."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, date, timedelta

import aiohttp
from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import DOMAIN, NUTRIENTS, MEAL_CATEGORIES
from .open_food_facts import lookup_by_barcode, search_by_name

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = f"{DOMAIN}.logs"
STORAGE_KEY_PRODUCTS_V2 = f"{DOMAIN}.products_v2"
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


def _sanitize_nutrients(nutrients: dict) -> dict[str, float]:
    """Ensure all nutrient values are valid floats."""
    result: dict[str, float] = {}
    for key in NUTRIENTS:
        val = nutrients.get(key, 0)
        try:
            result[key] = float(val) if val else 0.0
        except (TypeError, ValueError):
            result[key] = 0.0
    return result


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
        # Recent searches (in-memory, per person, not persisted)
        self._recent_searches: dict[str, list[str]] = {}

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

        # Load unified products
        products_data = await self._products_store.async_load()
        if products_data and isinstance(products_data, list):
            self._products = products_data
            _LOGGER.info("Loaded %d products", len(self._products))

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
        """Search the unified product list by name, aliases, and barcode. Supports fuzzy multi-word matching."""
        q = query.strip().lower()
        if not q:
            return []

        # Exact barcode match
        for p in self._products:
            if p.get("barcode") == query.strip():
                return [p]

        # Score each product by how well it matches
        words = q.split()
        scored: list[tuple[int, dict]] = []
        for p in self._products:
            name_lower = p.get("name", "").lower()
            alias_text = " ".join(p.get("aliases", [])).lower()
            searchable = name_lower + " " + alias_text

            # Exact substring match gets highest score
            if q in name_lower:
                scored.append((100, p))
            elif q in alias_text:
                scored.append((90, p))
            else:
                # Fuzzy: count how many query words appear in the searchable text
                matches = sum(1 for w in words if w in searchable)
                if matches > 0:
                    scored.append((matches * 10, p))

        scored.sort(key=lambda x: -x[0])
        return [p for _, p in scored[:10]]

    def add_recent_search(self, person: str, query: str) -> None:
        """Track a search query for the recently searched list."""
        q = query.strip()
        if not q or len(q) < 2:
            return
        recent = self._recent_searches.setdefault(person, [])
        if q in recent:
            recent.remove(q)
        recent.insert(0, q)
        self._recent_searches[person] = recent[:10]

    def get_recent_searches(self, person: str) -> list[str]:
        """Return recent search queries for a person."""
        return self._recent_searches.get(person, [])

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

    async def refresh_product_from_off(self, product_id: str) -> dict | None:
        """Re-fetch a product's nutrients from OFF by name. Returns updated product or None."""
        product = self._get_product_by_id(product_id)
        if not product or product.get("type") != "base":
            return None
        session = await self._get_session()
        results = await search_by_name(session, product["name"])
        if not results:
            return None
        off_product = results[0]
        product["nutrients"] = off_product["nutrients"]
        product["portions"] = off_product.get("portions", product.get("portions", []))
        if off_product.get("serving_grams"):
            product["serving_grams"] = off_product["serving_grams"]
        self._refresh_recipes_for_product(product_id)
        await self._async_save_products()
        _LOGGER.info("Refreshed product from OFF: %s", product["name"])
        return product

    async def merge_products(self, keep_id: str, remove_id: str) -> dict | None:
        """Merge two products: keep one, absorb the other's aliases, then delete it."""
        keep = self._get_product_by_id(keep_id)
        remove = self._get_product_by_id(remove_id)
        if not keep or not remove:
            return None
        # Merge aliases
        keep_aliases = keep.get("aliases", [])
        remove_name = remove.get("name", "")
        if remove_name and remove_name.lower() not in [a.lower() for a in keep_aliases] and remove_name.lower() != keep.get("name", "").lower():
            keep_aliases.append(remove_name)
        for alias in remove.get("aliases", []):
            if alias.lower() not in [a.lower() for a in keep_aliases]:
                keep_aliases.append(alias)
        keep["aliases"] = keep_aliases
        # Merge barcode
        if not keep.get("barcode") and remove.get("barcode"):
            keep["barcode"] = remove["barcode"]
        # Update recipe references from remove_id to keep_id
        for p in self._products:
            if p.get("type") != "recipe":
                continue
            for ing in p.get("ingredients", []):
                if ing.get("product_id") == remove_id:
                    ing["product_id"] = keep_id
        # Delete the merged product
        self._products = [p for p in self._products if p.get("id") != remove_id]
        await self._async_save_products()
        _LOGGER.info("Merged product '%s' into '%s'", remove_name, keep.get("name"))
        return keep

    def get_nutrient_suggestions(self, person: str, days: int = 7) -> list[dict]:
        """Find products that could fill nutrient gaps based on recent intake.
        Returns [{nutrient_key, nutrient_label, deficit, suggestions: [{name, value_per_100g}]}]."""
        end = date.today()
        start = end - timedelta(days=days - 1)
        period = self.get_period_totals(person, str(start), str(end))
        if not period:
            return []

        # Get config goals from hass
        goals: dict[str, float] = {}
        for e in self.hass.config_entries.async_entries(DOMAIN):
            merged = {**e.data, **e.options}
            for p in merged.get("personen", []):
                if p == person:
                    goals["energy-kcal_100g"] = merged.get("doel_calorieen", 0)
                    goals["proteins_100g"] = merged.get("protein_goal", 0)
                    goals["carbohydrates_100g"] = merged.get("carbs_goal", 0)
                    goals["fat_100g"] = merged.get("fat_goal", 0)
                    goals["fiber_100g"] = merged.get("fiber_goal", 0)
                    break

        # Only count completed days (skip empty days and today which is still in progress)
        today_str = str(date.today())
        logged_days = [d for d in period if d["item_count"] > 0 and d["date"] != today_str]
        if not logged_days:
            return []

        results = []
        for key, goal in goals.items():
            if goal <= 0:
                continue
            avg = sum(d["totals"].get(key, 0) for d in logged_days) / len(logged_days)
            if avg >= goal * 0.8:
                continue  # Not a gap

            deficit = goal - avg
            label = NUTRIENTS.get(key, {}).get("label", key)

            # Find top products rich in this nutrient
            candidates = []
            for p in self._products:
                if p.get("type") != "base":
                    continue
                value = p.get("nutrients", {}).get(key, 0)
                if value > 0:
                    candidates.append({"name": p["name"], "value_per_100g": round(value, 1)})
            candidates.sort(key=lambda x: -x["value_per_100g"])

            results.append({
                "nutrient_key": key,
                "nutrient_label": label,
                "goal": round(goal, 1),
                "average": round(avg, 1),
                "deficit": round(deficit, 1),
                "suggestions": candidates[:5],
            })

        return results

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
        name_lower = name.lower()
        for p in self._products:
            if p.get("name", "").lower() == name_lower:
                # Update barcode on existing product if provided
                barcode = product.get("barcode")
                if barcode:
                    self._store_barcode(name, barcode)
                return
            # Also check aliases to avoid near-duplicates
            if name_lower in [a.lower() for a in p.get("aliases", [])]:
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
            "completeness": product.get("completeness"),
            "favorite": False,
            "last_used": str(date.today()),
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

    def get_recent_items(self, person: str, limit: int = 10) -> list[dict]:
        """Return recently logged unique products (last 7 days, deduped by name)."""
        person_logs = self._logs.get(person, {})
        seen: set[str] = set()
        recent: list[dict] = []
        current = date.today()
        for _ in range(7):
            day_str = str(current)
            for item in reversed(person_logs.get(day_str, [])):
                name = item.get("name", "")
                if name and name not in seen:
                    seen.add(name)
                    recent.append({
                        "name": name,
                        "serving_grams": item.get("grams", 100),
                        "nutrients": item.get("nutrients", {}),
                    })
                    if len(recent) >= limit:
                        return recent
            current -= timedelta(days=1)
        return recent

    def get_streak(self, person: str) -> int:
        """Return the number of consecutive days with logged items, ending today or yesterday."""
        person_logs = self._logs.get(person, {})
        current = date.today()
        # Allow starting from yesterday if today has no logs yet
        if not person_logs.get(str(current)):
            current -= timedelta(days=1)
        streak = 0
        while person_logs.get(str(current)):
            streak += 1
            current -= timedelta(days=1)
        return streak

    def get_period_totals(self, person: str, start_date: str, end_date: str) -> list[dict]:
        """Return daily totals for a date range [{date, totals, item_count}, ...]."""
        person_logs = self._logs.get(person, {})
        current = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
        days: list[dict] = []
        while current <= end:
            day_str = str(current)
            items = person_logs.get(day_str, [])
            totals = {k: 0.0 for k in NUTRIENTS}
            for item in items:
                factor = item["grams"] / 100.0
                for nutrient in NUTRIENTS:
                    totals[nutrient] += item["nutrients"].get(nutrient, 0.0) * factor
            days.append({"date": day_str, "totals": totals, "item_count": len(items)})
            current += timedelta(days=1)
        return days

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
            "nutrients": _sanitize_nutrients(product.get("nutrients", {})),
            "time": datetime.now().strftime("%H:%M"),
            "category": cat,
        }
        if components:
            item["components"] = components

        self._logs[person][target_day].append(item)
        _LOGGER.info("Logged: %s (%.0fg) for %s [%s] on %s", product["name"], grams, person, cat, target_day)
        self._cache_product(product)
        # Update last_used on the cached product
        name_lower = product.get("name", "").lower()
        for p in self._products:
            if p.get("name", "").lower() == name_lower:
                p["last_used"] = str(date.today())
                break
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
