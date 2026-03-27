# CLAUDE.md

## Project Overview

Voedingslog is a Home Assistant custom component for tracking daily nutrition per person. It provides a sidebar panel (LitElement), HA sensors, and services. Data comes from Open Food Facts and can be supplemented with manual entry, AI photo analysis, and AI text/handwriting parsing.

## Architecture

### Backend (Python)

| File | Purpose |
|------|---------|
| `__init__.py` | Panel registration (`async_setup`), config entry setup, HA service registration |
| `coordinator.py` | `DataUpdateCoordinator` — manages logs, unified product store. Persists to `.storage/` |
| `websocket.py` | Core WebSocket command handlers (panel <> backend communication) |
| `ai_handlers.py` | AI-related WS handlers — photo analysis, text parsing, handwriting OCR |
| `sensor.py` | HA sensor entities — one nutrient sensor + log overview per person |
| `config_flow.py` | Setup wizard + options flow (persons, goals, AI entity) |
| `open_food_facts.py` | OFF API wrapper — barcode lookup and product search |
| `const.py` | Constants — domain, nutrients, categories, service/WS names |
| `strings.json` | UI strings for config flow |

### Frontend (TypeScript/LitElement)

Source in `frontend-src/src/`, built output in `frontend/voedingslog-panel.js`.

**Main component:**

| File | Purpose |
|------|---------|
| `voedingslog-panel.ts` | Main panel — layout, routing, lifecycle, barcode scanner |
| `types.ts` | TypeScript interfaces for all data structures |
| `helpers.ts` | Pure functions — nutrient calculation, grouping, constants |
| `styles.ts` | All CSS as a `css` tagged template export |

**Controllers (composition pattern — each owns its dialogs + logic):**

| File | Purpose |
|------|---------|
| `controllers/ai-controller.ts` | Batch add — AI text parsing, handwriting OCR, product validation flow |
| `controllers/search-controller.ts` | Product search, barcode lookup, photo label analysis, manual entry |
| `controllers/entry-controller.ts` | Weight/portion selection, edit existing item, component recipe editing |
| `controllers/export-controller.ts` | Day detail dialog, pie chart, PNG export, download/share |
| `controllers/products-controller.ts` | Unified product management — base products + recipes (fixed & component) |

**Shared utilities:**

| File | Purpose |
|------|---------|
| `barcode-capture.ts` | `Html5Camera` class — reusable html5-qrcode wrapper for scanning and photo capture |
| `photo-capture.ts` | `renderPhotoPicker()` — shared camera/file picker UI, `readFileAsBase64()` |
| `product-search.ts` | `ProductSearch` class — shared search bar UI with local + online OFF search |

### Build

```bash
cd custom_components/voedingslog/frontend-src
pnpm install
pnpm build          # esbuild → ../frontend/voedingslog-panel.js (minified)
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest
```

The built JS file is committed to the repo (HACS requirement — users don't run build tools).

## Testing

### Setup

```bash
make setup    # creates .venv, installs deps, activates pre-commit hook
```

Or manually:
```bash
python3 -m venv .venv
.venv/bin/pip install pytest pytest-asyncio aiohttp homeassistant
cd custom_components/voedingslog/frontend-src && pnpm install
git config core.hooksPath .githooks
```

### Running tests

```bash
make test       # run all tests (Python + TypeScript typecheck + vitest)
make test-py    # Python tests only
make test-ts    # TypeScript tests only
make typecheck  # TypeScript type check only
```

### Pre-commit hook

The `.githooks/pre-commit` hook runs all tests before every commit. Activated via `git config core.hooksPath .githooks` (done by `make setup`).

### Test files

| File | What it tests |
|------|---------------|
| `tests/test_coordinator.py` | Nutrient computation, product CRUD, search, favorites, component editing |
| `tests/test_open_food_facts.py` | OFF product processing, serving parsing, portion building |
| `frontend-src/src/helpers.test.ts` | Nutrient calculation, grouping, display constants |

### IMPORTANT: Test change policy

**When modifying any test, you MUST explain why the change is needed.** Tests are the safety net for the codebase. Every test change must include a clear justification — e.g., "test updated because the API signature changed" or "new test added to cover the component recipe edit flow". Do not silently change assertions or delete tests without explanation.

## Key Design Decisions

- **One config entry per person**: Each person is a separate HA integration instance. `ws_get_config` gathers persons from all entries. WS commands route to the correct coordinator by person name.
- **Unified product store**: Products and recipes live in one store (`voedingslog.products_v2`). Three product types: `base` (simple product), `recipe` with `recipe_type: "fixed"` (mixed, logged as portion), and `recipe` with `recipe_type: "component"` (individual items with editable grams per log).
- **Controller composition pattern**: Each dialog group lives in its own controller class with a typed host interface. Controllers render templates and handle actions via the host's state and methods. No mixins, no type casts.
- **`async_setup()` + `async_setup_entry()`**: Panel/WS/static files registered globally in `async_setup`. Coordinator/sensors/services registered per config entry in `async_setup_entry`.
- **WebSocket API over services**: Services are fire-and-forget. WS commands return data to the frontend (search results, config, etc).
- **Html5Camera for barcode/photo**: Reusable `Html5Camera` class wraps html5-qrcode for both barcode scanning and photo viewfinder. Light DOM container with `requestAnimationFrame` position tracking.
- **Content hash cache busting**: JS URL uses MD5 hash of file content (`?v=a3f1b2c4`) instead of version number.
- **Local-first search**: Products are cached on first use. `ProductSearch` class checks cache first, "Zoek online" button for OFF API.
- **Shared search dialog**: The search dialog supports callbacks — recipe ingredient search opens the same dialog and returns the selected product to the caller.
- **AI structured output**: AI uses `ai_task.generate_data` with the `structure` parameter for typed responses. Photo attachments use `media-source://` URIs via temp files in `/media`.
- **AI text/handwriting → product lookup**: AI only identifies product names + estimated grams. Real nutrients come from local cache / OFF search, not AI guessing.

## Data Model

### Product types (unified store)
```python
# Base product
{"id": str, "type": "base", "name": str, "serving_grams": float, "nutrients": dict, "portions": list, "favorite": bool}

# Fixed recipe (log a portion of the total)
{"id": str, "type": "recipe", "recipe_type": "fixed", "name": str, "ingredients": [...], "total_grams": float, "nutrients": dict, "preferred_portion": float|None, "favorite": bool}

# Component recipe (individual items with editable grams)
{"id": str, "type": "recipe", "recipe_type": "component", "name": str, "ingredients": [...], "total_grams": float, "nutrients": dict, "favorite": bool}
```

### Log item
```python
{"name": str, "grams": float, "nutrients": dict, "time": str, "category": str}
# Component recipe logs also have:
{"components": [{"name": str, "grams": float, "nutrients": dict}, ...]}
```
Categories: `breakfast`, `lunch`, `dinner`, `snack` (auto-assigned by time of day).

### Persistence
- `.storage/voedingslog.logs.<entry_id>` — daily logs per person (per config entry)
- `.storage/voedingslog.products_v2` — unified product store (shared across entries)

## WebSocket Commands

### Core (websocket.py)

| Command | Purpose |
|---------|---------|
| `voedingslog/get_config` | Panel initialization data (persons from all entries, per-person goals) |
| `voedingslog/get_log` | Day's log for a person |
| `voedingslog/lookup_barcode` | Barcode lookup (no logging) |
| `voedingslog/search_products` | Search local products or online (OFF) |
| `voedingslog/log_product` | Log a product with full nutrient data (optional `components`) |
| `voedingslog/edit_item` | Edit name, weight, category, nutrients, components of existing item |
| `voedingslog/delete_item` | Delete item by index |
| `voedingslog/reset_day` | Clear day's log |
| `voedingslog/get_products` | List all products (optional `product_type` filter) |
| `voedingslog/save_product` | Create/update product (base or recipe) |
| `voedingslog/delete_product` | Delete product by ID |
| `voedingslog/get_favorites` | List favorite products |
| `voedingslog/toggle_favorite` | Toggle favorite status (by `product_id`) |

### AI (ai_handlers.py)

| Command | Purpose |
|---------|---------|
| `voedingslog/analyze_photo` | AI analysis of nutrition label photo (structured output) |
| `voedingslog/parse_text` | AI text parsing → product lookup from cache/OFF |
| `voedingslog/parse_handwriting` | AI handwriting OCR → product lookup from cache/OFF |

## Code Conventions

- **All code in English** — variable names, functions, comments
- **UI strings in Dutch** — button labels, hints, messages (prepared for future i18n)
- **Controller composition** — each controller has a typed `Host` interface, no casts
- Use arrow functions for all Lit event handlers (`@click=${() => this._method()}`)
- TypeScript strict mode with `experimentalDecorators`
