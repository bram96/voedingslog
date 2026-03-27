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
