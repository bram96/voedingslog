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
| `controllers/products-controller.ts` | Product list (add mode + manage mode), base product/recipe editor, alias editor, online OFF fallback |
| `controllers/search-controller.ts` | Search dialog (reusable with callbacks), barcode, photo label analysis, manual entry |
| `controllers/entry-controller.ts` | Weight/portion selection, edit existing item, component recipe editing |
| `controllers/ai-controller.ts` | Batch add — AI text parsing, handwriting OCR, product validation flow |
| `controllers/export-controller.ts` | Day detail dialog, pie chart, PNG export, download/share |

**Views (template renderers for each dialog/screen):**

| File | Purpose |
|------|---------|
| `views/search-view.ts` | Product search interface |
| `views/weight-view.ts` | Portion/weight selection |
| `views/edit-view.ts` | Edit item dialog |
| `views/day-view.ts` | Day detail with pie chart, macros, items by category |
| `views/period-view.ts` | Week/month charts with navigation |
| `views/products-list-view.ts` | Product management list |
| `views/base-product-editor-view.ts` | Base product creation/editing |
| `views/recipe-editor-view.ts` | Fixed and component recipe creation/editing |
| `views/manual-entry-view.ts` | Manual nutrient entry form |
| `views/photo-view.ts` | Camera/file picker |
| `views/barcode-view.ts` | Manual barcode entry |
| `views/batch-add-view.ts` | Multi-item AI parsing progress |
| `views/validate-view.ts` | AI-parsed item validation flow |

**UI components:**

| File | Purpose |
|------|---------|
| `ui/chart.ts` | Pie and bar chart rendering |
| `ui/dialog-header.ts` | Dialog header with back button |
| `ui/form-helpers.ts` | Form input helpers |
| `ui/nutrient-fields.ts` | Nutrient editor fields |

**Helper modules:**

| File | Purpose |
|------|---------|
| `helpers/api.ts` | WebSocket call wrappers |
| `helpers/categories.ts` | Meal category constants |
| `helpers/dates.ts` | Date formatting |
| `helpers/gestures.ts` | Swipe/pull-to-refresh gesture handler |
| `helpers/nutrients.ts` | Nutrient metadata and display constants |

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

### Test files (174 tests total)

| File | Tests | What it covers |
|------|-------|----------------|
| `tests/test_coordinator.py` | 73 | Nutrient computation, product CRUD, fuzzy search, favorites, aliases, barcode, streaks, merge, duplicate detection, component editing, recipe product refs, cleanup, period totals, recent items/searches, input sanitization, log/delete/reset operations |
| `tests/test_open_food_facts.py` | 26 | OFF product processing, serving parsing, portion building, micronutrient conversion, completeness |
| `frontend-src/src/helpers.test.ts` | 30 | Nutrient calculation (all keys), grouping, display constants, NUTRIENTS_META |
| `frontend-src/src/voedingslog-panel.test.ts` | 45 | E2E component tests — renders actual LitElement in jsdom, tests dialogs, navigation, products add/manage, weight dialog, day detail, period toggle, delete/undo, loading/empty states, narrow mode |

### Test coverage

| Layer | Coverage | Notes |
|-------|----------|-------|
| Python overall | 41% | Core coordinator logic 70%, const 100%. Low areas: WS handlers (23%), sensors (0%), config flow (0%) — need HA runtime mocking |
| TypeScript overall | 31% | Helpers 82%, panel 59%, styles 100%. Low areas: AI controller (9%), search controller (7%) — camera/AI/file APIs hard to mock |
| Realistic ceiling | ~60% / ~50% | Without a full HA test harness, WS handlers, sensors, AI calls, and camera APIs are hard to unit test |

### IMPORTANT: Test change policy

**When modifying any test, you MUST explain why the change is needed.** Tests are the safety net for the codebase. Every test change must include a clear justification — e.g., "test updated because the API signature changed" or "new test added to cover the component recipe edit flow". Do not silently change assertions or delete tests without explanation.

## Key Design Decisions

- **One config entry per person**: Each person is a separate HA integration instance. `ws_get_config` gathers persons from all entries. WS commands route to the correct coordinator by person name.
- **Unified product store**: Products and recipes live in one store (`voedingslog.products_v2`). Three product types: `base` (simple product), `recipe` with `recipe_type: "fixed"` (mixed, logged as portion), and `recipe` with `recipe_type: "component"` (individual items with editable grams per log).
- **Recipe ingredients reference products**: Ingredients can have a `product_id` pointing to a base product. When a base product's nutrients change, all recipes referencing it are automatically refreshed.
- **Product aliases**: Products have an `aliases` list for alternative search names. AI text parsing auto-stores recognized names as aliases. Search checks both name and aliases.
- **Local barcode cache**: Products can have a `barcode` field. Barcode lookup checks local products first before hitting OFF API.
- **Controller composition pattern**: Each dialog group lives in its own controller class with a typed host interface. Controllers render templates and handle actions via the host's state and methods. No mixins, no type casts.
- **Callback-based search**: The search dialog routes ALL results (search, barcode, manual entry, photo AI) through `_onSelected`. When opened with a callback (e.g. recipe ingredient search), results go to the callback. When opened without, results go to the weight dialog for logging. This ensures consistent behavior across all sub-flows.
- **Products controller dual mode**: The products controller supports `"add"` mode (click to log, with online OFF fallback and barcode/manual/batch buttons) and `"manage"` mode (click to edit, with create/delete/cleanup). Shared `_renderProductItem` reduces duplication.
- **`async_setup()` + `async_setup_entry()`**: Panel/WS/static files registered globally in `async_setup`. Coordinator/sensors/services registered per config entry in `async_setup_entry`.
- **WebSocket API over services**: Services are fire-and-forget. WS commands return data to the frontend (search results, config, etc).
- **Html5Camera for barcode/photo**: Reusable `Html5Camera` class wraps html5-qrcode for both barcode scanning and photo viewfinder. Light DOM container with `requestAnimationFrame` position tracking.
- **Content hash cache busting**: JS URL uses MD5 hash of file content (`?v=a3f1b2c4`) instead of version number.
- **Local-first search**: Products are cached on first use. Search checks local products (name + aliases) first, "Zoek online" button for OFF API.
- **AI structured output**: AI uses `ai_task.generate_data` with the `structure` parameter for typed responses. Photo attachments use `media-source://` URIs via temp files in `/media`.
- **AI text/handwriting → product lookup**: AI only identifies product names + estimated grams. Real nutrients come from local cache / OFF search, not AI guessing. Matched names are stored as aliases for future instant matching.
- **Fuzzy search**: Multi-word queries score products by word matches. Exact substring > alias match > partial word. Barcode numbers are checked as exact match first.
- **Swipe navigation**: Touch start/end tracking on the host element. Requires >60px horizontal distance and mostly-horizontal direction. Disabled when dialogs are open.
- **Quick inline editing**: Tap grams text on logged items to show inline number input. Saves on blur/enter, avoids full edit dialog for simple weight changes.
- **Streak tracking**: Counts consecutive days with logged items backwards from today (or yesterday if today is empty). In-memory calculation, no persisted state.
- **Product merge**: Absorbs aliases, barcode, and recipe ingredient references from the removed product into the kept product. Uses search dialog to pick the duplicate.
- **Period view with navigation**: Day detail dialog has Dag/Week/Maand toggle. Week snaps to Monday, month to 1st. Each mode has back/forward arrows. Day navigation syncs with the main panel date.
- **Week sensors**: Per person per nutrient — both 7-day average and 7-day total. Computed from coordinator's `get_period_totals()` on each refresh.
- **Undo snackbar**: Delete actions show a temporary undo snackbar instead of a confirmation dialog. Item is removed immediately but can be restored within the snackbar timeout.
- **Pull to refresh**: Touch pull-down gesture on mobile triggers a log refresh. Uses touch start/move/end tracking with a threshold distance.
- **Nutrient gap suggestions**: "Wat kan ik eten?" uses AI to suggest foods that fill remaining nutrient goals. Sends current day's totals and goals to AI, returns product suggestions from cache/OFF.
- **Today exclusion from averages**: Period averages (week/month) exclude today (incomplete data) and days with zero logged items to avoid skewing the average downward.
- **Nutrient completeness indicator**: Products show a completeness score based on how many nutrient fields are filled in. Helps users identify products with incomplete data.
- **Stale product detection**: Products unused for 90+ days are flagged as stale in the product manager to help with cleanup.
- **Macro ratio bar**: Visual percentage bar showing protein/carbs/fat/fiber distribution in day and period views.
- **Animated transitions**: Day transitions and dialog open/close use CSS animations for a polished mobile experience.
- **Shared constants**: `EDITABLE_NUTRIENTS` is the single source of truth for nutrient editor fields. `_calculate_totals()` and `_get_person_goals()` eliminate backend duplication. `formatDateLabel()` is shared across panel and controllers.
- **AI daily review**: Sends today's meals by category, 7-day averages vs goals, and recurring meal patterns to AI. Gets personalized advice about trends and structural changes to recurring meals.
- **E2E component testing**: Actual LitElement rendered in jsdom with mocked `hass.callWS`. Tests verify shadow DOM content, dialog flows, user interactions, and state transitions.

## Data Model

### Product types (unified store)
```python
# Base product
{"id": str, "type": "base", "name": str, "serving_grams": float,
 "nutrients": dict, "portions": list, "barcode": str|None,
 "aliases": list[str], "favorite": bool}

# Fixed recipe (log a portion of the total)
{"id": str, "type": "recipe", "recipe_type": "fixed", "name": str,
 "ingredients": [...], "total_grams": float, "nutrients": dict,
 "preferred_portion": float|None, "aliases": list[str], "favorite": bool}

# Component recipe (individual items with editable grams)
{"id": str, "type": "recipe", "recipe_type": "component", "name": str,
 "ingredients": [...], "total_grams": float, "nutrients": dict,
 "aliases": list[str], "favorite": bool}
```

### Recipe ingredient
```python
{"product_id": str|None, "name": str, "grams": float, "nutrients": dict}
```
When `product_id` is set, nutrients are resolved from the referenced product on save.

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
| `voedingslog/get_recent` | Recently logged unique products (last 7 days, deduped) |
| `voedingslog/get_streak` | Consecutive days with logged items |
| `voedingslog/get_period` | Daily totals for a date range (person, start_date, end_date) |
| `voedingslog/get_suggestions` | AI-powered nutrient gap suggestions based on remaining goals |
| `voedingslog/daily_review` | AI daily review with trend analysis and recurring meal patterns |
| `voedingslog/lookup_barcode` | Barcode lookup — local first, then OFF (no logging) |
| `voedingslog/search_products` | Fuzzy search (name + aliases + barcode), tracks recent queries |
| `voedingslog/log_product` | Log a product with full nutrient data (optional `components`) |
| `voedingslog/edit_item` | Edit name, weight, category, nutrients, components of existing item |
| `voedingslog/delete_item` | Delete item by index |
| `voedingslog/reset_day` | Clear day's log |
| `voedingslog/get_products` | List all products (optional `product_type` filter) |
| `voedingslog/save_product` | Create/update product — resolves ingredient product_ids, refreshes referencing recipes |
| `voedingslog/delete_product` | Delete product by ID |
| `voedingslog/merge_products` | Merge two products — absorbs aliases/barcode, updates recipe refs |
| `voedingslog/refresh_product` | Re-fetch nutrients from OFF for a product |
| `voedingslog/cleanup_products` | Remove base products not in any log or recipe (keeps favorites) |
| `voedingslog/add_alias` | Add an alias to a product |
| `voedingslog/get_favorites` | List favorite products |
| `voedingslog/toggle_favorite` | Toggle favorite status (by `product_id`) |

### AI (ai_handlers.py)

| Command | Purpose |
|---------|---------|
| `voedingslog/analyze_photo` | AI analysis of nutrition label photo (structured output) |
| `voedingslog/parse_text` | AI text parsing → product lookup from cache/OFF, stores aliases |
| `voedingslog/parse_handwriting` | AI handwriting OCR → product lookup from cache/OFF, stores aliases |
| `voedingslog/ai_guess_nutrients` | AI nutrient estimation for unknown products |

## Code Conventions

- **All code in English** — variable names, functions, comments
- **UI strings in Dutch** — button labels, hints, messages (prepared for future i18n)
- **Controller composition** — each controller has a typed `Host` interface, no casts
- Use arrow functions for all Lit event handlers (`@click=${() => this._method()}`)
- TypeScript strict mode with `experimentalDecorators`
