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

  .panel { max-width: 600px; margin: 0 auto; padding-bottom: 24px; }

  /* Header */
  .header {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
    padding: var(--panel-padding);
    padding-top: calc(var(--panel-padding) + env(safe-area-inset-top, 0px));
  }
  .header-top { display: flex; align-items: center; }
  .menu-btn {
    background: none; border: none; color: inherit; cursor: pointer;
    padding: 4px; margin-right: 8px; display: flex; align-items: center;
  }
  .menu-btn ha-icon { --mdc-icon-size: 24px; }
  .header h1 { margin: 0; font-size: 20px; font-weight: 500; flex: 1; }
  .header-person { font-size: 14px; opacity: 0.8; }
  .date-nav { display: flex; align-items: center; gap: 4px; margin-top: 10px; }
  .date-nav-btn {
    background: rgba(255,255,255,0.15); border: none; color: inherit;
    padding: 6px; border-radius: 50%; cursor: pointer;
    display: flex; align-items: center; justify-content: center; transition: background 0.2s;
  }
  .date-nav-btn:hover { background: rgba(255,255,255,0.3); }
  .date-nav-btn ha-icon { --mdc-icon-size: 22px; }
  .date-picker-btn {
    flex: 1; text-align: center; cursor: pointer;
    background: rgba(255,255,255,0.15); border: none; color: inherit;
    border-radius: 8px; padding: 8px 12px; transition: background 0.2s;
  }
  .date-picker-btn:hover { background: rgba(255,255,255,0.25); }
  .date-text { font-size: 15px; font-weight: 500; }
  .person-tabs { display: flex; gap: 8px; margin-top: 12px; }
  .person-tab {
    background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: inherit;
    padding: 6px 16px; border-radius: 20px; font-size: 14px; cursor: pointer; transition: background 0.2s;
  }
  .person-tab.active { background: rgba(255,255,255,0.4); border-color: rgba(255,255,255,0.5); font-weight: 600; }

  .container { padding: var(--panel-padding); display: flex; flex-direction: column; gap: 12px; }

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
  .dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; display: flex; align-items: flex-end; justify-content: center; }
  .dialog { background: var(--card-background-color); border-radius: 16px 16px 0 0; width: 100%; max-width: 600px; max-height: 85vh; overflow-y: auto; padding: 0; }
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

  /* Meals */
  .meal-item { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--divider-color); }
  .meal-item:last-of-type { border-bottom: none; }
  .meal-info { flex: 1; cursor: pointer; min-width: 0; }
  .meal-name { display: block; font-size: 15px; font-weight: 500; }
  .meal-meta { display: block; font-size: 12px; color: var(--secondary-text-color); }
  .meal-ingredients-section { margin-bottom: 16px; }
  .ingredient-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--divider-color); }
  .ingredient-name { flex: 1; font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ingredient-grams-input { width: 65px; padding: 4px 8px; border: 1px solid var(--divider-color); border-radius: 6px; font-size: 14px; text-align: right; background: var(--primary-background-color); color: var(--primary-text-color); }
  .ingredient-unit { font-size: 13px; color: var(--secondary-text-color); }
  .add-ingredient { margin-top: 12px; }
  .ingredient-nutrients { padding: 8px 0 8px 12px; border-bottom: 1px solid var(--divider-color); background: var(--secondary-background-color); border-radius: 0 0 8px 8px; margin-bottom: 4px; }

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
`;
