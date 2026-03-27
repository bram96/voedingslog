"""Constants for the Voedingslog integration."""

DOMAIN = "voedingslog"

DEFAULT_CALORIES_GOAL = 2000

OFF_API = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
OFF_SEARCH = "https://world.openfoodfacts.net/cgi/search.pl"

# All nutrients tracked from Open Food Facts (keys match OFF API field names)
NUTRIENTS = {
    "energy-kcal_100g":     {"label": "Calorieën",        "unit": "kcal", "icon": "mdi:fire"},
    "fat_100g":             {"label": "Vetten",            "unit": "g",    "icon": "mdi:oil"},
    "saturated-fat_100g":   {"label": "Verzadigd vet",     "unit": "g",    "icon": "mdi:oil"},
    "carbohydrates_100g":   {"label": "Koolhydraten",      "unit": "g",    "icon": "mdi:barley"},
    "sugars_100g":          {"label": "Waarvan suikers",   "unit": "g",    "icon": "mdi:cube-outline"},
    "fiber_100g":           {"label": "Vezels",            "unit": "g",    "icon": "mdi:leaf"},
    "proteins_100g":        {"label": "Eiwitten",          "unit": "g",    "icon": "mdi:food-steak"},
    "sodium_100g":          {"label": "Natrium (zout)",    "unit": "mg",   "icon": "mdi:shaker-outline", "factor": 1000},
    "vitamin-c_100g":       {"label": "Vitamine C",        "unit": "mg",   "icon": "mdi:pill",           "factor": 1000},
    "calcium_100g":         {"label": "Calcium",           "unit": "mg",   "icon": "mdi:bone",           "factor": 1000},
    "iron_100g":            {"label": "IJzer",             "unit": "mg",   "icon": "mdi:pill",           "factor": 1000},
    "vitamin-d_100g":       {"label": "Vitamine D",        "unit": "µg",   "icon": "mdi:white-balance-sunny", "factor": 1000000},
}

# Meal categories
MEAL_CATEGORIES = ["breakfast", "lunch", "dinner", "snack"]
MEAL_CATEGORY_LABELS = {
    "breakfast": "Ontbijt",
    "lunch": "Lunch",
    "dinner": "Avondeten",
    "snack": "Tussendoor",
}

# Service names
SERVICE_LOG_PRODUCT = "log_product"
SERVICE_LOG_BARCODE = "log_barcode"
SERVICE_DELETE_LAST = "delete_last"

# WebSocket command types
WS_GET_CONFIG = f"{DOMAIN}/get_config"
WS_GET_LOG = f"{DOMAIN}/get_log"
WS_LOOKUP_BARCODE = f"{DOMAIN}/lookup_barcode"
WS_SEARCH_PRODUCTS = f"{DOMAIN}/search_products"
WS_LOG_PRODUCT = f"{DOMAIN}/log_product"
WS_DELETE_ITEM = f"{DOMAIN}/delete_item"
WS_RESET_DAY = f"{DOMAIN}/reset_day"
WS_EDIT_ITEM = f"{DOMAIN}/edit_item"
WS_ANALYZE_PHOTO = f"{DOMAIN}/analyze_photo"
WS_GET_PRODUCTS = f"{DOMAIN}/get_products"
WS_SAVE_PRODUCT = f"{DOMAIN}/save_product"
WS_DELETE_PRODUCT = f"{DOMAIN}/delete_product"
WS_GET_PERIOD = f"{DOMAIN}/get_period"
WS_CLEANUP_PRODUCTS = f"{DOMAIN}/cleanup_products"
WS_ADD_ALIAS = f"{DOMAIN}/add_alias"
WS_GET_FAVORITES = f"{DOMAIN}/get_favorites"
WS_TOGGLE_FAVORITE = f"{DOMAIN}/toggle_favorite"
WS_PARSE_TEXT = f"{DOMAIN}/parse_text"
WS_PARSE_HANDWRITING = f"{DOMAIN}/parse_handwriting"
