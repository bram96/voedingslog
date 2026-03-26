# CLAUDE.md

## Project Overview

Voedingslog is a Home Assistant custom component for tracking daily nutrition per person. It provides a sidebar panel (LitElement), HA sensors, and services. Data comes from Open Food Facts and can be supplemented with manual entry and AI photo analysis.

## Architecture

### Backend (Python)

| File | Purpose |
|------|---------|
| `__init__.py` | Panel registration (`async_setup`), config entry setup, HA service registration |
| `coordinator.py` | `DataUpdateCoordinator` — manages logs, meals, product cache. Persists to `.storage/` |
| `websocket.py` | All WebSocket command handlers (panel ↔ backend communication) |
| `sensor.py` | HA sensor entities — one nutrient sensor + log overview per person |
| `config_flow.py` | Setup wizard + options flow (persons, goals, AI entity) |
| `open_food_facts.py` | OFF API wrapper — barcode lookup and product search |
| `const.py` | Constants — domain, nutrients, categories, service/WS names |
| `strings.json` | UI strings for config flow |

### Frontend (TypeScript/LitElement)

Source in `frontend-src/src/`, built output in `frontend/voedingslog-panel.js`.

| File | Purpose |
|------|---------|
| `voedingslog-panel.ts` | Main panel component — all rendering and action handlers (~1400 lines) |
| `types.ts` | TypeScript interfaces for all data structures |
| `helpers.ts` | Pure functions — nutrient calculation, grouping, constants |
| `styles.ts` | All CSS as a `css` tagged template export |

### Build

```bash
cd custom_components/voedingslog/frontend-src
pnpm install
pnpm build          # esbuild → ../frontend/voedingslog-panel.js (minified)
pnpm typecheck      # tsc --noEmit
```

The built JS file is committed to the repo (HACS requirement — users don't run build tools).

## Key Design Decisions

- **`async_setup()` + `async_setup_entry()`**: Panel/WS/static files registered globally in `async_setup`. Coordinator/sensors/services registered per config entry in `async_setup_entry`.
- **WebSocket API over services**: Services are fire-and-forget. WS commands return data to the frontend (search results, config, etc).
- **html5-qrcode for barcode scanning**: Works in browser with HTTPS. Falls back to photo decode if camera fails. Light DOM container with `requestAnimationFrame` position tracking for the bottom-sheet dialog.
- **Content hash cache busting**: JS URL uses MD5 hash of file content (`?v=a3f1b2c4`) instead of version number.
- **Local-first search**: Products are cached on first use. Search checks cache first, "Zoek online" button for API.
- **AI photo → manual verify**: AI analysis opens the manual entry dialog pre-filled with recognized values for user verification.

## Data Model

### Log item
```python
{"name": str, "grams": float, "nutrients": dict, "time": str, "category": str}
```
Categories: `breakfast`, `lunch`, `dinner`, `snack` (auto-assigned by time of day).

### Custom meal
```python
{"id": str, "name": str, "ingredients": [...], "total_grams": float, "nutrients_per_100g": dict, "preferred_portion": float|None}
```

### Persistence
- `.storage/voedingslog.logs` — daily logs per person
- `.storage/voedingslog.meals` — custom meals/recipes
- `.storage/voedingslog.products` — product cache from OFF

## WebSocket Commands

| Command | Purpose |
|---------|---------|
| `voedingslog/get_config` | Panel initialization data |
| `voedingslog/get_log` | Day's log for a person |
| `voedingslog/lookup_barcode` | Barcode lookup (no logging) |
| `voedingslog/search_products` | Search local cache or online (OFF) |
| `voedingslog/log_product` | Log a product with full nutrient data |
| `voedingslog/edit_item` | Edit weight/category of existing item |
| `voedingslog/delete_item` | Delete item by index |
| `voedingslog/reset_day` | Clear day's log |
| `voedingslog/analyze_photo` | AI analysis of nutrition label photo |
| `voedingslog/get_meals` | List custom meals |
| `voedingslog/save_meal` | Create/update custom meal |
| `voedingslog/delete_meal` | Delete custom meal |

## Code Conventions

- **All code in English** — variable names, functions, comments
- **UI strings in Dutch** — button labels, hints, messages (prepared for future i18n)
- Use arrow functions for all Lit event handlers (`@click=${() => this._method()}`)
- TypeScript strict mode with `experimentalDecorators`
