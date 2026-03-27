"""Tests for coordinator logic — nutrient computation, product CRUD, migration."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from custom_components.voedingslog.coordinator import (
    _compute_nutrients_from_components,
    _default_category,
    VoedingslogCoordinator,
)


class TestComputeNutrientsFromComponents:
    def test_single_component(self):
        components = [
            {"name": "Rice", "grams": 200, "nutrients": {"energy-kcal_100g": 130, "proteins_100g": 2.5}},
        ]
        result = _compute_nutrients_from_components(components)
        assert result["energy-kcal_100g"] == 130.0
        assert result["proteins_100g"] == 2.5

    def test_two_components(self):
        components = [
            {"name": "Rice", "grams": 100, "nutrients": {"energy-kcal_100g": 130}},
            {"name": "Chicken", "grams": 100, "nutrients": {"energy-kcal_100g": 200}},
        ]
        result = _compute_nutrients_from_components(components)
        # Total = (130*100/100 + 200*100/100) / 200 * 100 = 165
        assert result["energy-kcal_100g"] == 165.0

    def test_unequal_grams(self):
        components = [
            {"name": "A", "grams": 300, "nutrients": {"energy-kcal_100g": 100}},
            {"name": "B", "grams": 100, "nutrients": {"energy-kcal_100g": 200}},
        ]
        result = _compute_nutrients_from_components(components)
        # Total kcal = (100*300/100 + 200*100/100) = 300 + 200 = 500
        # Per 100g of 400g total = 500/400*100 = 125
        assert result["energy-kcal_100g"] == 125.0

    def test_empty_components(self):
        result = _compute_nutrients_from_components([])
        assert result["energy-kcal_100g"] == 0.0

    def test_zero_grams(self):
        components = [{"name": "A", "grams": 0, "nutrients": {"energy-kcal_100g": 100}}]
        result = _compute_nutrients_from_components(components)
        assert result["energy-kcal_100g"] == 0.0

    def test_missing_nutrient_key(self):
        components = [
            {"name": "A", "grams": 100, "nutrients": {}},
        ]
        result = _compute_nutrients_from_components(components)
        assert result["energy-kcal_100g"] == 0.0


class TestDefaultCategory:
    @patch("custom_components.voedingslog.coordinator.datetime")
    def test_breakfast(self, mock_dt):
        mock_dt.now.return_value.hour = 8
        assert _default_category() == "breakfast"

    @patch("custom_components.voedingslog.coordinator.datetime")
    def test_lunch(self, mock_dt):
        mock_dt.now.return_value.hour = 12
        assert _default_category() == "lunch"

    @patch("custom_components.voedingslog.coordinator.datetime")
    def test_snack(self, mock_dt):
        mock_dt.now.return_value.hour = 15
        assert _default_category() == "snack"

    @patch("custom_components.voedingslog.coordinator.datetime")
    def test_dinner(self, mock_dt):
        mock_dt.now.return_value.hour = 19
        assert _default_category() == "dinner"


# ── Coordinator unit tests (with mocked HA) ─────────────────────


def _make_coordinator(persons=None, entry_id="test"):
    """Create a coordinator with mocked HA dependencies."""
    hass = MagicMock()
    hass.data = {}
    persons = persons or ["Jan"]
    with patch("custom_components.voedingslog.coordinator.Store"), \
         patch("homeassistant.helpers.update_coordinator.DataUpdateCoordinator.__init__"):
        coord = VoedingslogCoordinator(hass, persons, entry_id)
    # Set attributes that DataUpdateCoordinator.__init__ would set
    coord.hass = hass
    coord._store = AsyncMock()
    coord._products_store = AsyncMock()
    coord._products = []
    return coord


class TestProductCRUD:
    @pytest.mark.asyncio
    async def test_save_base_product(self):
        coord = _make_coordinator()
        result = await coord.save_product({
            "type": "base",
            "name": "Brood",
            "serving_grams": 35,
            "nutrients": {"energy-kcal_100g": 247},
        })
        assert result["id"]
        assert result["type"] == "base"
        assert result["name"] == "Brood"
        assert result["serving_grams"] == 35
        assert len(coord._products) == 1

    @pytest.mark.asyncio
    async def test_save_recipe_computes_nutrients(self):
        coord = _make_coordinator()
        result = await coord.save_product({
            "type": "recipe",
            "recipe_type": "fixed",
            "name": "Pasta",
            "ingredients": [
                {"name": "Spaghetti", "grams": 100, "nutrients": {"energy-kcal_100g": 350}},
                {"name": "Sauce", "grams": 100, "nutrients": {"energy-kcal_100g": 50}},
            ],
        })
        assert result["type"] == "recipe"
        assert result["total_grams"] == 200
        assert result["nutrients"]["energy-kcal_100g"] == 200.0  # (350+50)/2

    @pytest.mark.asyncio
    async def test_update_existing_product(self):
        coord = _make_coordinator()
        first = await coord.save_product({"type": "base", "name": "V1", "nutrients": {}})
        updated = await coord.save_product({"id": first["id"], "type": "base", "name": "V2", "nutrients": {}})
        assert updated["id"] == first["id"]
        assert updated["name"] == "V2"
        assert len(coord._products) == 1

    @pytest.mark.asyncio
    async def test_delete_product(self):
        coord = _make_coordinator()
        prod = await coord.save_product({"type": "base", "name": "ToDelete", "nutrients": {}})
        assert len(coord._products) == 1
        ok = await coord.delete_product(prod["id"])
        assert ok is True
        assert len(coord._products) == 0

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self):
        coord = _make_coordinator()
        ok = await coord.delete_product("nonexistent")
        assert ok is False

    @pytest.mark.asyncio
    async def test_toggle_favorite(self):
        coord = _make_coordinator()
        prod = await coord.save_product({"type": "base", "name": "Fav", "nutrients": {}})
        assert prod["favorite"] is False
        new_state = await coord.toggle_favorite(prod["id"])
        assert new_state is True
        new_state = await coord.toggle_favorite(prod["id"])
        assert new_state is False


class TestProductSearch:
    def test_search_local(self):
        coord = _make_coordinator()
        coord._products = [
            {"id": "1", "type": "base", "name": "Volkoren brood", "nutrients": {}},
            {"id": "2", "type": "recipe", "name": "Pasta bolognese", "nutrients": {}},
            {"id": "3", "type": "base", "name": "Witte brood", "nutrients": {}},
        ]
        results = coord.search_products_local("brood")
        assert len(results) == 2
        names = [r["name"] for r in results]
        assert "Volkoren brood" in names
        assert "Witte brood" in names

    def test_search_case_insensitive(self):
        coord = _make_coordinator()
        coord._products = [{"id": "1", "type": "base", "name": "Melk", "nutrients": {}}]
        assert len(coord.search_products_local("melk")) == 1
        assert len(coord.search_products_local("MELK")) == 1

    def test_get_products_filtered(self):
        coord = _make_coordinator()
        coord._products = [
            {"id": "1", "type": "base", "name": "A"},
            {"id": "2", "type": "recipe", "name": "B"},
        ]
        assert len(coord.get_products()) == 2
        assert len(coord.get_products("base")) == 1
        assert len(coord.get_products("recipe")) == 1

    def test_get_favorites(self):
        coord = _make_coordinator()
        coord._products = [
            {"id": "1", "type": "base", "name": "Fav", "favorite": True},
            {"id": "2", "type": "base", "name": "Not", "favorite": False},
        ]
        favs = coord.get_favorites()
        assert len(favs) == 1
        assert favs[0]["name"] == "Fav"


class TestAliasSearch:
    def test_search_finds_by_alias(self):
        coord = _make_coordinator()
        coord._products = [
            {"id": "1", "type": "base", "name": "Volkoren brood", "aliases": ["brown bread", "tarwebrood"], "nutrients": {}},
        ]
        assert len(coord.search_products_local("tarwe")) == 1
        assert len(coord.search_products_local("brown")) == 1
        assert len(coord.search_products_local("volkoren")) == 1

    def test_search_alias_case_insensitive(self):
        coord = _make_coordinator()
        coord._products = [
            {"id": "1", "type": "base", "name": "Melk", "aliases": ["Whole Milk"], "nutrients": {}},
        ]
        assert len(coord.search_products_local("whole milk")) == 1
        assert len(coord.search_products_local("WHOLE")) == 1

    def test_no_duplicate_results(self):
        coord = _make_coordinator()
        coord._products = [
            {"id": "1", "type": "base", "name": "Brood", "aliases": ["brood alias"], "nutrients": {}},
        ]
        # "brood" matches both name and alias — should only appear once
        results = coord.search_products_local("brood")
        assert len(results) == 1


class TestAddAlias:
    @pytest.mark.asyncio
    async def test_add_alias(self):
        coord = _make_coordinator()
        coord._products = [{"id": "1", "type": "base", "name": "Melk", "aliases": [], "nutrients": {}}]
        added = await coord.add_alias("1", "whole milk")
        assert added is True
        assert "whole milk" in coord._products[0]["aliases"]

    @pytest.mark.asyncio
    async def test_skip_duplicate_alias(self):
        coord = _make_coordinator()
        coord._products = [{"id": "1", "type": "base", "name": "Melk", "aliases": ["whole milk"], "nutrients": {}}]
        added = await coord.add_alias("1", "whole milk")
        assert added is False

    @pytest.mark.asyncio
    async def test_skip_alias_matching_name(self):
        coord = _make_coordinator()
        coord._products = [{"id": "1", "type": "base", "name": "Melk", "aliases": [], "nutrients": {}}]
        added = await coord.add_alias("1", "melk")
        assert added is False

    @pytest.mark.asyncio
    async def test_skip_empty_alias(self):
        coord = _make_coordinator()
        coord._products = [{"id": "1", "type": "base", "name": "Melk", "aliases": [], "nutrients": {}}]
        added = await coord.add_alias("1", "  ")
        assert added is False

    @pytest.mark.asyncio
    async def test_nonexistent_product(self):
        coord = _make_coordinator()
        added = await coord.add_alias("nope", "test")
        assert added is False


class TestRecipeProductRef:
    @pytest.mark.asyncio
    async def test_recipe_resolves_product_id_nutrients(self):
        """When saving a recipe with product_id ingredients, nutrients come from the referenced product."""
        coord = _make_coordinator()
        base = await coord.save_product({
            "type": "base", "name": "Rice", "nutrients": {"energy-kcal_100g": 130},
        })
        recipe = await coord.save_product({
            "type": "recipe", "recipe_type": "fixed", "name": "Rice bowl",
            "ingredients": [{"product_id": base["id"], "name": "Rice", "grams": 200, "nutrients": {}}],
        })
        # Nutrients should be resolved from the base product, not the empty inline nutrients
        assert recipe["ingredients"][0]["nutrients"]["energy-kcal_100g"] == 130
        assert recipe["nutrients"]["energy-kcal_100g"] == 130.0

    @pytest.mark.asyncio
    async def test_base_product_update_refreshes_recipes(self):
        """Updating a base product refreshes all recipes that reference it."""
        coord = _make_coordinator()
        base = await coord.save_product({
            "type": "base", "name": "Chicken", "nutrients": {"energy-kcal_100g": 200},
        })
        await coord.save_product({
            "type": "recipe", "recipe_type": "fixed", "name": "Chicken dish",
            "ingredients": [{"product_id": base["id"], "name": "Chicken", "grams": 100, "nutrients": {"energy-kcal_100g": 200}}],
        })
        # Update the base product's calories
        await coord.save_product({
            "id": base["id"], "type": "base", "name": "Chicken", "nutrients": {"energy-kcal_100g": 250},
        })
        # Recipe should now reflect the updated nutrients
        recipe = next(p for p in coord._products if p["type"] == "recipe")
        assert recipe["ingredients"][0]["nutrients"]["energy-kcal_100g"] == 250
        assert recipe["nutrients"]["energy-kcal_100g"] == 250.0

    @pytest.mark.asyncio
    async def test_cleanup_keeps_recipe_referenced_products(self):
        """Cleanup should not remove products referenced by recipe ingredients."""
        coord = _make_coordinator(["Jan"])
        coord._logs = {"Jan": {}}  # no logs at all
        coord.hass.data["voedingslog"] = {"entry1": coord}
        base = await coord.save_product({
            "type": "base", "name": "Unreferenced", "nutrients": {},
        })
        referenced = await coord.save_product({
            "type": "base", "name": "Used in recipe", "nutrients": {},
        })
        await coord.save_product({
            "type": "recipe", "name": "My recipe",
            "ingredients": [{"product_id": referenced["id"], "name": "Used in recipe", "grams": 100, "nutrients": {}}],
        })
        removed = await coord.cleanup_unused_products()
        assert removed == 1  # only "Unreferenced" removed
        names = [p["name"] for p in coord._products]
        assert "Used in recipe" in names
        assert "My recipe" in names
        assert "Unreferenced" not in names


class TestBarcodeLocalLookup:
    def test_lookup_finds_local(self):
        coord = _make_coordinator()
        coord._products = [
            {"id": "1", "type": "base", "name": "Chocomel", "barcode": "8712800100010", "nutrients": {"energy-kcal_100g": 80}},
        ]
        import asyncio
        result = asyncio.get_event_loop().run_until_complete(coord.lookup_barcode("8712800100010"))
        assert result is not None
        assert result["name"] == "Chocomel"

    def test_store_barcode_on_existing(self):
        coord = _make_coordinator()
        coord._products = [{"id": "1", "type": "base", "name": "Test", "nutrients": {}}]
        coord._store_barcode("Test", "12345")
        assert coord._products[0]["barcode"] == "12345"


class TestCacheProduct:
    def test_caches_new_product(self):
        coord = _make_coordinator()
        coord._cache_product({"name": "New", "serving_grams": 50, "nutrients": {"energy-kcal_100g": 100}})
        assert len(coord._products) == 1
        assert coord._products[0]["type"] == "base"
        assert coord._products[0]["id"]  # has an ID

    def test_skips_duplicate(self):
        coord = _make_coordinator()
        coord._products = [{"id": "x", "type": "base", "name": "Existing", "nutrients": {}}]
        coord._cache_product({"name": "Existing", "nutrients": {}})
        assert len(coord._products) == 1

    def test_skips_empty_name(self):
        coord = _make_coordinator()
        coord._cache_product({"name": "", "nutrients": {}})
        assert len(coord._products) == 0


class TestCleanupUnusedProducts:
    @pytest.mark.asyncio
    async def test_removes_unused_base_products(self):
        coord = _make_coordinator(["Jan"])
        coord._logs = {"Jan": {"2024-01-01": [
            {"name": "Used Product", "grams": 100, "nutrients": {}, "time": "12:00", "category": "lunch"},
        ]}}
        # Register this coordinator in hass.data so cleanup can find logs
        coord.hass.data["voedingslog"] = {"entry1": coord}
        coord._products = [
            {"id": "1", "type": "base", "name": "Used Product", "favorite": False},
            {"id": "2", "type": "base", "name": "Unused Product", "favorite": False},
            {"id": "3", "type": "base", "name": "Fav Unused", "favorite": True},
            {"id": "4", "type": "recipe", "name": "Recipe Always Kept", "favorite": False},
        ]
        removed = await coord.cleanup_unused_products()
        assert removed == 1  # only "Unused Product" removed
        names = [p["name"] for p in coord._products]
        assert "Used Product" in names
        assert "Fav Unused" in names  # favorites kept
        assert "Recipe Always Kept" in names  # recipes kept
        assert "Unused Product" not in names

    @pytest.mark.asyncio
    async def test_no_removal_when_all_used(self):
        coord = _make_coordinator(["Jan"])
        coord._logs = {"Jan": {"2024-01-01": [
            {"name": "A", "grams": 100, "nutrients": {}, "time": "12:00", "category": "lunch"},
        ]}}
        coord.hass.data["voedingslog"] = {"entry1": coord}
        coord._products = [
            {"id": "1", "type": "base", "name": "A", "favorite": False},
        ]
        removed = await coord.cleanup_unused_products()
        assert removed == 0
        assert len(coord._products) == 1


class TestEditItemWithComponents:
    @pytest.mark.asyncio
    async def test_edit_components_recalculates(self):
        coord = _make_coordinator(["Jan"])
        coord._logs = {"Jan": {"2024-01-01": [
            {
                "name": "Ontbijt", "grams": 200,
                "nutrients": {"energy-kcal_100g": 100},
                "time": "08:00", "category": "breakfast",
                "components": [
                    {"name": "Yoghurt", "grams": 150, "nutrients": {"energy-kcal_100g": 60}},
                    {"name": "Noten", "grams": 50, "nutrients": {"energy-kcal_100g": 600}},
                ],
            }
        ]}}

        # Patch async_refresh to avoid HA dependency
        coord.async_refresh = AsyncMock()

        new_components = [
            {"name": "Yoghurt", "grams": 200, "nutrients": {"energy-kcal_100g": 60}},
            {"name": "Noten", "grams": 30, "nutrients": {"energy-kcal_100g": 600}},
        ]
        ok = await coord.edit_item("Jan", 0, day="2024-01-01", components=new_components)
        assert ok is True
        item = coord._logs["Jan"]["2024-01-01"][0]
        assert item["grams"] == 230
        assert item["components"] == new_components
        # Nutrients recalculated: (60*200/100 + 600*30/100) / 230 * 100
        expected = (120 + 180) / 230 * 100
        assert abs(item["nutrients"]["energy-kcal_100g"] - expected) < 0.01
