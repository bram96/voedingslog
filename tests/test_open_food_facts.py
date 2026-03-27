"""Tests for the Open Food Facts helper functions."""
from custom_components.voedingslog.open_food_facts import (
    _process_product,
    _parse_serving,
    _to_float,
    _build_portions,
)


class TestToFloat:
    def test_int(self):
        assert _to_float(42) == 42.0

    def test_float(self):
        assert _to_float(3.14) == 3.14

    def test_string(self):
        assert _to_float("12.5") == 12.5

    def test_none(self):
        assert _to_float(None) == 0.0

    def test_empty_string(self):
        assert _to_float("") == 0.0

    def test_invalid_string(self):
        assert _to_float("abc") == 0.0

    def test_zero(self):
        assert _to_float(0) == 0.0


class TestParseServing:
    def test_simple_grams(self):
        assert _parse_serving("125 g") == 125.0

    def test_no_space(self):
        assert _parse_serving("30g") == 30.0

    def test_decimal_comma(self):
        assert _parse_serving("12,5 g") == 12.5

    def test_decimal_dot(self):
        assert _parse_serving("12.5g") == 12.5

    def test_with_label(self):
        assert _parse_serving("1 serving (23 g)") == 23.0

    def test_empty(self):
        assert _parse_serving("") is None

    def test_none(self):
        assert _parse_serving(None) is None

    def test_no_grams(self):
        assert _parse_serving("200ml") is None

    def test_uppercase_g(self):
        assert _parse_serving("50 G") == 50.0


class TestBuildPortions:
    def test_with_serving_quantity(self):
        product = {"serving_size": "1 biscuit (12g)", "serving_quantity": 12}
        portions = _build_portions(product)
        assert portions[0]["grams"] == 12.0
        assert portions[0]["label"] == "1 biscuit (12g)"
        assert any(p["grams"] == 100.0 for p in portions)

    def test_with_product_quantity(self):
        product = {"product_quantity": "400", "product_quantity_unit": "g"}
        portions = _build_portions(product)
        assert any(p["grams"] == 400.0 for p in portions)
        assert any(p["grams"] == 100.0 for p in portions)

    def test_empty_product(self):
        portions = _build_portions({})
        assert len(portions) == 1
        assert portions[0]["grams"] == 100.0

    def test_no_duplicates(self):
        product = {"serving_quantity": 100}
        portions = _build_portions(product)
        grams_list = [p["grams"] for p in portions]
        assert grams_list.count(100.0) == 1


class TestProcessProduct:
    def test_basic_product(self):
        raw = {
            "product_name": "Test Product",
            "brands": "TestBrand",
            "nutriments": {
                "energy-kcal_100g": 250,
                "fat_100g": 10,
                "proteins_100g": 8,
                "carbohydrates_100g": 30,
            },
        }
        result = _process_product(raw)
        assert result["name"] == "Test Product (TestBrand)"
        assert result["nutrients"]["energy-kcal_100g"] == 250.0
        assert result["nutrients"]["fat_100g"] == 10.0
        assert result["nutrients"]["proteins_100g"] == 8.0
        assert result["serving_grams"] == 100

    def test_dutch_name_preferred(self):
        raw = {
            "product_name": "English Name",
            "product_name_nl": "Nederlandse Naam",
            "nutriments": {},
        }
        result = _process_product(raw)
        assert result["name"] == "Nederlandse Naam"

    def test_no_brand(self):
        raw = {"product_name": "Plain Product", "nutriments": {}}
        result = _process_product(raw)
        assert result["name"] == "Plain Product"
        assert "(" not in result["name"]

    def test_fallback_name(self):
        raw = {"nutriments": {}}
        result = _process_product(raw)
        assert result["name"] == "Onbekend product"

    def test_serving_size_parsed(self):
        raw = {
            "product_name": "Bread",
            "serving_size": "1 slice (35 g)",
            "nutriments": {},
        }
        result = _process_product(raw)
        assert result["serving_grams"] == 35.0

    def test_missing_nutrients_default_zero(self):
        raw = {"product_name": "Empty", "nutriments": {}}
        result = _process_product(raw)
        for key, val in result["nutrients"].items():
            assert val == 0.0, f"{key} should be 0.0"
