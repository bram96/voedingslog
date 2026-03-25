"""Constanten voor Voedingslog."""

DOMAIN = "voedingslog"

DEFAULT_CALORIEEN = 2000
DEFAULT_NATRIUM_MG = 2000

OFF_API = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl"

# Alle nutriënten die we bijhouden vanuit Open Food Facts
NUTRIENTEN = {
    "energy-kcal_100g":     {"naam": "Calorieën",        "eenheid": "kcal", "icon": "mdi:fire"},
    "fat_100g":             {"naam": "Vetten",            "eenheid": "g",    "icon": "mdi:oil"},
    "saturated-fat_100g":   {"naam": "Verzadigd vet",     "eenheid": "g",    "icon": "mdi:oil"},
    "carbohydrates_100g":   {"naam": "Koolhydraten",      "eenheid": "g",    "icon": "mdi:barley"},
    "sugars_100g":          {"naam": "Waarvan suikers",   "eenheid": "g",    "icon": "mdi:cube-outline"},
    "fiber_100g":           {"naam": "Vezels",            "eenheid": "g",    "icon": "mdi:leaf"},
    "proteins_100g":        {"naam": "Eiwitten",          "eenheid": "g",    "icon": "mdi:food-steak"},
    "sodium_100g":          {"naam": "Natrium (zout)",    "eenheid": "mg",   "icon": "mdi:shaker-outline", "factor": 1000},
    "vitamin-c_100g":       {"naam": "Vitamine C",        "eenheid": "mg",   "icon": "mdi:pill",           "factor": 1000},
    "calcium_100g":         {"naam": "Calcium",           "eenheid": "mg",   "icon": "mdi:bone",           "factor": 1000},
    "iron_100g":            {"naam": "IJzer",             "eenheid": "mg",   "icon": "mdi:pill",           "factor": 1000},
    "vitamin-d_100g":       {"naam": "Vitamine D",        "eenheid": "µg",   "icon": "mdi:white-balance-sunny", "factor": 1000000},
}

SERVICE_LOG_PRODUCT   = "log_product"
SERVICE_LOG_BARCODE   = "log_barcode"
SERVICE_RESET_DAG     = "reset_dag"
SERVICE_VERWIJDER_LOG = "verwijder_laatste"
