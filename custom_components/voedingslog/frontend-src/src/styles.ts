import { css } from "lit";

export const panelStyles = css`
  :host {
    --panel-padding: 16px;
    display: block;
    background: var(--primary-background-color);
    min-height: 100vh;
    font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
    color: var(--primary-text-color);
  }

  .panel { padding-bottom: 24px; }

  /* Header — HA-style app toolbar */
  .header {
    background: var(--app-header-background-color, var(--primary-color));
    color: var(--app-header-text-color, var(--text-primary-color, #fff));
    padding-top: env(safe-area-inset-top, 0px);
    border-bottom: 1px solid var(--divider-color);
  }
  .header-bar {
    display: flex; align-items: center; height: 48px; padding: 0 4px;
  }
  .menu-btn {
    background: none; border: none; color: inherit; cursor: pointer;
    padding: 8px; display: flex; align-items: center;
  }
  .menu-btn ha-icon { --mdc-icon-size: 24px; }
  .header-title { font-size: 20px; font-weight: 400; margin: 0 0 0 4px; flex: 1; }
  .person-tabs { display: flex; padding: 0 16px; }
  .person-tab {
    background: none; border: none; border-bottom: 3px solid transparent;
    color: inherit; opacity: 0.7;
    padding: 12px 16px; font-size: 14px; cursor: pointer;
    transition: opacity 0.2s, border-color 0.2s;
  }
  .person-tab:hover { opacity: 1; }
  .person-tab.active { opacity: 1; border-bottom-color: currentColor; font-weight: 500; }

  /* Date nav — below header */
  .date-nav {
    display: flex; align-items: center; gap: 4px;
    max-width: 600px; margin: 0 auto; padding: 8px var(--panel-padding);
  }
  .date-nav-btn {
    background: var(--secondary-background-color); border: none; color: var(--primary-text-color);
    padding: 6px; border-radius: 50%; cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: background 0.2s;
  }
  .date-nav-btn:hover { background: var(--divider-color); }
  .date-nav-btn ha-icon { --mdc-icon-size: 22px; }
  .date-picker-btn {
    flex: 1; text-align: center; cursor: pointer;
    background: var(--secondary-background-color); border: none; color: var(--primary-text-color);
    border-radius: 8px; padding: 8px 12px; transition: background 0.2s;
  }
  .date-picker-btn:hover { background: var(--divider-color); }
  .date-text { font-size: 15px; font-weight: 500; }

  .container { padding: var(--panel-padding); display: flex; flex-direction: column; gap: 12px; max-width: 600px; margin: 0 auto; animation: fade-in 0.15s ease-out; }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

  /* Actions */
  .actions { display: flex; gap: 8px; }
  .action-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 12px 8px; background: var(--card-background-color);
    border: 1px solid var(--divider-color); border-radius: 12px;
    color: var(--primary-color); cursor: pointer; font-size: 12px; transition: background 0.2s;
  }
  .action-btn:hover { background: var(--secondary-background-color); }
  .action-btn ha-icon { --mdc-icon-size: 24px; }
  .action-btn-primary { background: var(--primary-color) !important; color: var(--text-primary-color, #fff) !important; border-color: var(--primary-color) !important; }

  /* Cards */
  .card { background: var(--card-background-color); border-radius: 12px; padding: 16px; border: 1px solid var(--divider-color); }

  /* Day totals */
  .totals-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .totals-title { font-weight: 500; font-size: 16px; }
  .totals-cal { font-size: 14px; color: var(--secondary-text-color); }
  .progress-bar { height: 8px; background: var(--divider-color); border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
  .progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .macro-row { display: flex; justify-content: space-around; }
  .macro-item { text-align: center; flex: 1; }
  .macro-value { display: block; font-size: 16px; font-weight: 500; }
  .macro-label { display: block; font-size: 11px; color: var(--secondary-text-color); }
  .macro-bar { height: 4px; background: var(--divider-color); border-radius: 2px; margin: 3px 4px 1px; overflow: hidden; }
  .macro-bar-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }

  .macro-ratio { margin-top: 8px; }
  .macro-ratio-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; }
  .macro-ratio-bar div { height: 100%; }
  .macro-ratio-labels { display: flex; justify-content: space-between; font-size: 10px; font-weight: 600; margin-top: 2px; }
  .totals-hint { display: flex; align-items: center; gap: 4px; justify-content: center; font-size: 11px; color: var(--secondary-text-color); margin-top: 8px; opacity: 0.7; }
  .totals-hint ha-icon { --mdc-icon-size: 14px; }

  /* Category sections */
  .category-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--divider-color); }
  .category-header ha-icon { --mdc-icon-size: 20px; color: var(--primary-color); }
  .category-title { font-weight: 500; flex: 1; }
  .category-cal { font-size: 13px; color: var(--secondary-text-color); }
  .empty-hint { font-size: 13px; color: var(--secondary-text-color); font-style: italic; padding: 4px 0; }

  /* Food items */
  .food-item {
    display: flex; align-items: center; gap: 8px;
    cursor: pointer; border-radius: 8px; margin: 0 -8px; padding: 8px;
    border-bottom: 1px solid var(--divider-color); transition: background 0.15s;
  }
  .food-item:last-child { border-bottom: none; }
  .food-item:hover { background: var(--secondary-background-color); }
  .item-main { flex: 1; min-width: 0; }
  .item-name { display: block; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .item-meta { display: block; font-size: 12px; color: var(--secondary-text-color); }
  .item-grams { cursor: pointer; text-decoration: underline dotted; text-underline-offset: 2px; }
  .quick-gram-input { width: 60px; padding: 2px 6px; border: 1px solid var(--primary-color); border-radius: 4px; font-size: 13px; text-align: right; background: var(--card-background-color); color: var(--primary-text-color); }
  .item-nutrients { white-space: nowrap; }
  .item-kcal { font-size: 13px; white-space: nowrap; font-weight: 500; }
  .item-delete, .item-edit {
    background: none; border: none; color: var(--secondary-text-color);
    cursor: pointer; padding: 4px; border-radius: 50%; display: flex;
  }
  .item-delete:hover { color: var(--error-color, #db4437); }
  .item-edit:hover { color: var(--primary-color); }
  .item-delete ha-icon, .item-edit ha-icon { --mdc-icon-size: 18px; }

  /* Dialog */
  .dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: flex-end; justify-content: center; animation: overlay-in 0.15s ease-out; }
  @keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }
  .dialog { background: var(--card-background-color); border-radius: 16px 16px 0 0; width: 100%; max-width: 600px; max-height: 85vh; overflow-y: auto; padding: 0; animation: dialog-slide-up 0.2s ease-out; }
  @keyframes dialog-slide-up { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .dialog-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--divider-color); }
  .dialog-header h2 { margin: 0; font-size: 18px; font-weight: 500; }
  .close-btn { background: none; border: none; color: var(--secondary-text-color); cursor: pointer; padding: 4px; display: flex; }
  .dialog-body { padding: 16px; }

  /* Scanner / camera */
  .scanner-area { min-height: 250px; background: #000; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  .scanner-hint { color: #999; font-size: 14px; }
  .camera-capture-btn { margin-top: 8px; width: 100%; }
  .manual-barcode { margin-top: 16px; font-size: 13px; color: var(--secondary-text-color); }
  .manual-barcode span { display: block; margin-bottom: 8px; }

  /* Inputs & buttons */
  .input-row { display: flex; gap: 8px; }
  .input-row input { flex: 1; padding: 10px 12px; border: 1px solid var(--divider-color); border-radius: 8px; font-size: 14px; background: var(--primary-background-color); color: var(--primary-text-color); }
  .btn-primary {
    background: var(--primary-color); color: var(--text-primary-color, #fff); border: none;
    padding: 10px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;
    display: flex; align-items: center; gap: 6px; justify-content: center;
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-secondary {
    background: var(--secondary-background-color); color: var(--primary-text-color);
    border: 1px solid var(--divider-color); padding: 10px 16px; border-radius: 8px;
    font-size: 14px; font-weight: 500; cursor: pointer;
    display: flex; align-items: center; gap: 6px; justify-content: center;
  }
  .btn-secondary:hover { background: var(--divider-color); }
  .btn-confirm { width: 100%; padding: 14px; font-size: 16px; margin-top: 8px; }
  .export-preview { margin-top: 12px; text-align: center; }
  .export-actions { display: flex; gap: 8px; margin-top: 12px; }
  .export-actions .btn-confirm { flex: 1; }

  /* AI validate */
  .ai-textarea {
    width: 100%; min-height: 120px; padding: 12px; border: 1px solid var(--divider-color);
    border-radius: 8px; font-size: 14px; font-family: inherit; resize: vertical; box-sizing: border-box;
    background: var(--primary-background-color); color: var(--primary-text-color);
  }
  .ai-validate-progress { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 13px; color: var(--secondary-text-color); }
  .ai-validate-bar { flex: 1; height: 4px; background: var(--divider-color); border-radius: 2px; overflow: hidden; }
  .ai-validate-fill { height: 100%; background: var(--primary-color); transition: width 0.3s; }
  .ai-validate-actions { display: flex; gap: 8px; margin-top: 16px; }
  .ai-validate-actions button { flex: 1; }
  .ai-context { font-size: 13px; color: var(--secondary-text-color); margin-bottom: 8px; }
  .ai-warning { background: rgba(255, 152, 0, 0.1); border: 1px solid rgba(255, 152, 0, 0.3); border-radius: 8px; padding: 8px 12px; font-size: 13px; margin-bottom: 12px; }
  .ai-validate-search { margin-bottom: 12px; }
  .ai-validate-search input { width: 100%; padding: 8px 12px; border: 1px solid var(--divider-color); border-radius: 8px; font-size: 14px; box-sizing: border-box; background: var(--primary-background-color); color: var(--primary-text-color); }
  .ai-validate-search .search-results { max-height: 150px; }

  /* Search */
  .search-results { margin-top: 12px; max-height: 300px; overflow-y: auto; }
  .search-result { display: flex; align-items: center; padding: 8px; border-bottom: 1px solid var(--divider-color); border-radius: 8px; gap: 4px; }
  .search-result:hover { background: var(--secondary-background-color); }
  .search-result-main { flex: 1; min-width: 0; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
  .result-name { font-size: 14px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 8px; }
  .result-meta { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; }
  .fav-btn { background: none; border: none; cursor: pointer; padding: 4px; display: flex; color: #ff9800; flex-shrink: 0; }
  .fav-btn ha-icon { --mdc-icon-size: 20px; }
  .favorites-section { margin: 12px 0 4px; }
  .search-online-btn { width: 100%; margin-top: 8px; }
  .search-loading { display: flex; align-items: center; gap: 8px; padding: 12px 0; font-size: 13px; color: var(--secondary-text-color); }

  /* Photo / file picker */
  .photo-hint { font-size: 14px; color: var(--secondary-text-color); margin-bottom: 16px; }
  .photo-buttons { display: flex; flex-direction: column; gap: 8px; }
  .photo-btn { width: 100%; padding: 14px; font-size: 16px; }
  .analyzing { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px 0; }

  /* Weight / edit / manual dialog */
  .nutrient-preview { background: var(--primary-background-color); border-radius: 8px; padding: 12px; margin-bottom: 16px; }
  .preview-title { font-size: 13px; color: var(--secondary-text-color); margin-bottom: 8px; }
  .nutrient-grid { display: grid; gap: 4px; }
  .nutrient-row { display: flex; justify-content: space-between; font-size: 14px; padding: 2px 0; }
  .form-field { margin-bottom: 16px; }
  .form-field-inline { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .form-field-inline label { flex: 1; white-space: nowrap; }
  .form-field-inline input { width: 100px; flex: 0 0 100px; text-align: right; }
  .nutrient-edit-section { margin-top: 8px; margin-bottom: 16px; border-top: 1px solid var(--divider-color); padding-top: 12px; }
  .form-field label { display: block; font-size: 13px; color: var(--secondary-text-color); margin-bottom: 6px; }
  .form-field input, .form-field select {
    width: 100%; padding: 10px 12px; border: 1px solid var(--divider-color); border-radius: 8px;
    font-size: 16px; background: var(--primary-background-color); color: var(--primary-text-color); box-sizing: border-box;
  }
  .section-label { display: block; font-size: 13px; color: var(--secondary-text-color); margin-bottom: 8px; font-weight: 500; }
  .portion-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .portion-chip {
    background: var(--secondary-background-color); border: 1px solid var(--divider-color);
    border-radius: 16px; padding: 4px 12px; font-size: 13px; cursor: pointer;
    color: var(--primary-text-color); transition: background 0.2s;
  }
  .portion-chip:hover { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
  .manual-hint { font-size: 13px; color: var(--secondary-text-color); margin-bottom: 8px; }
  .manual-fields { display: grid; gap: 8px; margin-bottom: 16px; }
  .manual-field-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .manual-field-row label { font-size: 14px; flex: 1; }
  .manual-field-row input {
    width: 80px; padding: 6px 8px; border: 1px solid var(--divider-color); border-radius: 6px;
    font-size: 14px; text-align: right; background: var(--primary-background-color); color: var(--primary-text-color);
  }

  /* Chooser grid */
  .chooser-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .chooser-item {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 20px 12px; background: var(--secondary-background-color);
    border: 1px solid var(--divider-color); border-radius: 12px;
    cursor: pointer; color: var(--primary-text-color); font-size: 14px; transition: background 0.2s;
  }
  .chooser-item:hover { background: var(--divider-color); }
  .chooser-item:disabled { opacity: 0.4; cursor: not-allowed; }
  .chooser-item ha-icon { --mdc-icon-size: 28px; color: var(--primary-color); }

  /* Products */
  .product-item { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--divider-color); }
  .product-item:last-of-type { border-bottom: none; }
  .product-info { flex: 1; cursor: pointer; min-width: 0; }
  .product-name-row { display: flex; align-items: center; }
  .product-name { font-size: 15px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .product-meta { display: block; font-size: 12px; color: var(--secondary-text-color); margin-left: 24px; }
  .type-filter-chips { display: flex; gap: 6px; margin-bottom: 12px; }
  .filter-chip {
    padding: 5px 14px; border-radius: 16px; font-size: 13px; cursor: pointer;
    border: 1px solid var(--divider-color); background: var(--card-background-color);
    color: var(--primary-text-color); transition: all 0.2s;
  }
  .filter-chip.active { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }
  .portion-edit-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .portion-label-input { flex: 1; padding: 4px 8px; border: 1px solid var(--divider-color); border-radius: 6px; font-size: 13px; background: var(--primary-background-color); color: var(--primary-text-color); }
  .portion-grams-input { width: 60px; padding: 4px 8px; border: 1px solid var(--divider-color); border-radius: 6px; font-size: 13px; text-align: right; background: var(--primary-background-color); color: var(--primary-text-color); }
  .alias-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .alias-name { flex: 1; font-size: 13px; color: var(--secondary-text-color); }
  .meal-ingredients-section { margin-bottom: 16px; }

  /* Component recipe (weight/edit dialogs) */
  .component-list { margin-bottom: 16px; }
  .component-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--divider-color); }
  .component-name { flex: 1; font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .component-grams-input { width: 65px; padding: 4px 8px; border: 1px solid var(--divider-color); border-radius: 6px; font-size: 14px; text-align: right; background: var(--primary-background-color); color: var(--primary-text-color); }
  .component-total { display: flex; justify-content: space-between; padding: 10px 0 4px; font-weight: 600; font-size: 14px; }
  .ingredient-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--divider-color); }
  .ingredient-name { flex: 1; font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ingredient-grams-input { width: 65px; padding: 4px 8px; border: 1px solid var(--divider-color); border-radius: 6px; font-size: 14px; text-align: right; background: var(--primary-background-color); color: var(--primary-text-color); }
  .ingredient-unit { font-size: 13px; color: var(--secondary-text-color); }
  .add-ingredient { margin-top: 12px; }
  .ingredient-nutrients { padding: 8px 0 8px 12px; border-bottom: 1px solid var(--divider-color); background: var(--secondary-background-color); border-radius: 0 0 8px 8px; margin-bottom: 4px; }

  /* HA-style search bar (products full-page) */
  .ha-search-bar {
    display: flex; align-items: center; gap: 8px;
    background: var(--card-background-color); border: 1px solid var(--divider-color);
    border-radius: 28px; padding: 8px 16px; margin-bottom: 8px;
  }
  .dialog-body .ha-search-bar { margin-bottom: 12px; }
  .ha-search-input {
    flex: 1; border: none; background: none; outline: none;
    font-size: 14px; color: var(--primary-text-color);
    font-family: inherit;
  }
  .ha-search-input::placeholder { color: var(--secondary-text-color); }
  .ha-search-action {
    background: none; border: none; cursor: pointer; padding: 4px;
    color: var(--secondary-text-color); display: flex; border-radius: 50%;
  }
  .ha-search-action.active { color: #ff9800; }

  /* FAB */
  .fab-container { position: fixed; bottom: 24px; right: 24px; z-index: 50; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
  .fab {
    width: 56px; height: 56px; border-radius: 16px; border: none;
    background: var(--primary-color); color: var(--text-primary-color, #fff);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    box-shadow: 0 3px 5px -1px rgba(0,0,0,0.2), 0 6px 10px 0 rgba(0,0,0,0.14), 0 1px 18px 0 rgba(0,0,0,0.12);
    transition: transform 0.2s;
  }
  .fab:hover { transform: scale(1.05); }
  .fab ha-icon { --mdc-icon-size: 24px; }
  .fab-menu { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; animation: fab-menu-in 0.15s ease-out; }
  @keyframes fab-menu-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  .fab-menu-item {
    display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 8px;
    background: var(--card-background-color); border: none; cursor: pointer;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15); font-size: 14px; color: var(--primary-text-color);
    white-space: nowrap;
  }
  .fab-menu-item ha-icon { --mdc-icon-size: 20px; color: var(--primary-color); }
  .fab-scrim { position: fixed; inset: 0; z-index: 49; }

  /* Portion chips */
  .portion-chip.active { background: var(--primary-color); color: var(--text-primary-color, #fff); border-color: var(--primary-color); }

  /* Pull to refresh */
  .pull-indicator { display: flex; align-items: center; justify-content: center; overflow: hidden; color: var(--secondary-text-color); }
  .pull-indicator ha-icon { --mdc-icon-size: 24px; }

  /* Snackbar */
  .snackbar {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--primary-text-color, #333); color: var(--primary-background-color, #fff);
    padding: 12px 16px; border-radius: 8px; display: flex; align-items: center; gap: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 1000;
    animation: snackbar-in 0.2s ease-out;
    font-size: 14px;
  }
  .snackbar button {
    background: none; border: none; color: var(--primary-color); cursor: pointer;
    font-weight: 600; font-size: 14px; padding: 4px 8px; white-space: nowrap;
  }
  @keyframes snackbar-in { from { opacity: 0; transform: translateX(-50%) translateY(20px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

  /* Period toggle */
  .period-toggle { display: flex; gap: 0; margin-bottom: 16px; border: 1px solid var(--divider-color); border-radius: 8px; overflow: hidden; }
  .period-toggle button { flex: 1; padding: 8px; border: none; background: var(--card-background-color); cursor: pointer; font-size: 14px; color: var(--primary-text-color); transition: background 0.2s; }
  .period-toggle button.active { background: var(--primary-color); color: var(--text-primary-color, #fff); }

  /* Period navigation */
  .period-nav { display: flex; align-items: center; gap: 4px; margin-bottom: 16px; }
  .period-nav .date-nav-btn { background: var(--secondary-background-color); border: none; color: var(--primary-text-color); padding: 6px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; }
  .period-nav .date-nav-btn ha-icon { --mdc-icon-size: 20px; }
  .period-nav-label { flex: 1; text-align: center; font-size: 15px; font-weight: 500; }

  /* Period charts */
  .period-chart { width: 100%; height: auto; display: block; }
  .period-chart-title { font-size: 14px; font-weight: 500; margin: 12px 0 4px; }
  .period-loading { text-align: center; padding: 24px; color: var(--secondary-text-color); }

  /* Day detail / pie chart */
  .pie-section { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-bottom: 20px; }
  .pie-chart {
    width: 180px; height: 180px; border-radius: 50%; position: relative;
    display: flex; align-items: center; justify-content: center;
  }
  .pie-center {
    width: 100px; height: 100px; border-radius: 50%;
    background: var(--card-background-color);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .pie-kcal { font-size: 22px; font-weight: 600; line-height: 1; }
  .pie-unit { font-size: 11px; color: var(--secondary-text-color); }
  .pie-legend { width: 100%; }
  .legend-item { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; }
  .legend-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
  .legend-info { flex: 1; min-width: 0; }
  .legend-top { display: flex; justify-content: space-between; align-items: center; }
  .legend-label { font-size: 14px; }
  .legend-value { font-size: 13px; color: var(--secondary-text-color); }
  .detail-table-header { font-size: 14px; font-weight: 500; margin-bottom: 8px; }
  .detail-row {
    display: flex; justify-content: space-between; padding: 6px 0;
    border-bottom: 1px solid var(--divider-color); font-size: 14px;
  }
  .detail-row:last-child { border-bottom: none; }
  .detail-row span:last-child { color: var(--secondary-text-color); white-space: nowrap; }
  .ai-advice { background: var(--secondary-background-color); border-radius: 8px; padding: 10px 12px; font-size: 13px; line-height: 1.5; margin: 8px 0; display: flex; gap: 8px; align-items: flex-start; }
  .ai-advice span { flex: 1; }
  .suggestions-section { margin-top: 4px; }
  .suggestion-group { margin-top: 8px; }
  .suggestion-label { font-size: 12px; font-weight: 500; color: var(--secondary-text-color); margin-bottom: 2px; display: flex; align-items: center; gap: 4px; }
  .suggestion-bullets { margin: 4px 0 0 0; padding-left: 20px; font-size: 13px; line-height: 1.6; }
  .suggestion-bullets li { margin-bottom: 2px; }
  .nutrient-gap-badge { background: #ff9800; color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 8px; margin-left: 4px; font-weight: 600; vertical-align: middle; }
  .detail-category { margin-top: 8px; }
  .detail-category-header { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--secondary-text-color); padding: 4px 0; }
`;
