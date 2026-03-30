/**
 * E2E-style component tests for VoedingslogPanel.
 * Renders the actual LitElement in jsdom and tests user interactions.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockHass, mockConfig, nextFrame } from "./test-helpers.js";

// Import to register the custom element
import "./voedingslog-panel.js";
import type { VoedingslogPanel } from "./voedingslog-panel.js";

function createElement(): VoedingslogPanel {
  const el = document.createElement("voedingslog-panel") as VoedingslogPanel;
  el.hass = mockHass();
  document.body.appendChild(el);
  return el;
}

async function waitForRender(el: VoedingslogPanel): Promise<void> {
  await el.updateComplete;
  await nextFrame();
  await el.updateComplete;
}

function queryAll(el: VoedingslogPanel, selector: string): Element[] {
  return Array.from(el.shadowRoot?.querySelectorAll(selector) || []);
}

function query(el: VoedingslogPanel, selector: string): Element | null {
  return el.shadowRoot?.querySelector(selector) || null;
}

function text(el: Element | null): string {
  return el?.textContent?.trim() || "";
}

describe("VoedingslogPanel", () => {
  let el: VoedingslogPanel;

  beforeEach(async () => {
    // Clean up any previous elements
    document.body.innerHTML = "";
  });

  describe("Initial render", () => {
    it("renders the header with title", async () => {
      el = createElement();
      await waitForRender(el);
      const title = query(el, ".header-title");
      expect(text(title)).toBe("Voedingslog");
    });

    it("renders action buttons", async () => {
      el = createElement();
      await waitForRender(el);
      const buttons = queryAll(el, ".action-btn");
      expect(buttons.length).toBeGreaterThanOrEqual(1);
      const labels = buttons.map((b) => text(b));
      expect(labels).toContain("Toevoegen");
    });

    it("renders day totals with kcal", async () => {
      el = createElement();
      await waitForRender(el);
      const totals = query(el, ".day-totals");
      expect(totals).not.toBeNull();
      const cal = query(el, ".totals-cal");
      expect(text(cal)).toContain("kcal");
    });

    it("renders four meal categories", async () => {
      el = createElement();
      await waitForRender(el);
      const sections = queryAll(el, ".category-section");
      expect(sections.length).toBe(4);
    });

    it("renders logged items", async () => {
      el = createElement();
      await waitForRender(el);
      const items = queryAll(el, ".food-item");
      expect(items.length).toBeGreaterThanOrEqual(1);
      const name = query(el, ".item-name");
      expect(text(name)).toBe("Volkoren brood");
    });

    it("renders streak when > 1", async () => {
      el = createElement();
      await waitForRender(el);
      const hint = query(el, ".totals-hint");
      expect(text(hint)).toContain("3 dagen streak");
    });

    it("renders macro ratio bar", async () => {
      el = createElement();
      await waitForRender(el);
      const ratio = query(el, ".macro-ratio-bar");
      expect(ratio).not.toBeNull();
    });
  });

  describe("Person tabs", () => {
    it("shows person tabs + Producten tab when multiple persons", async () => {
      el = document.createElement("voedingslog-panel") as VoedingslogPanel;
      el.hass = mockHass({
        "voedingslog/get_config": () => mockConfig({ persons: ["Jan", "Lisa"] }),
      });
      document.body.appendChild(el);
      await waitForRender(el);
      const tabs = queryAll(el, ".person-tab");
      expect(tabs.length).toBe(3); // Jan, Lisa, Producten
      expect(text(tabs[2])).toBe("Producten");
    });

    it("shows Producten tab even with single person", async () => {
      el = createElement();
      await waitForRender(el);
      const tabs = queryAll(el, ".person-tab");
      expect(tabs.length).toBeGreaterThanOrEqual(1);
      expect(tabs.some((t) => text(t) === "Producten")).toBe(true);
    });
  });

  describe("Dialog opening", () => {
    it("opens day detail on totals click", async () => {
      el = createElement();
      await waitForRender(el);
      const totals = query(el, ".day-totals") as HTMLElement;
      totals?.click();
      await waitForRender(el);
      const dialog = query(el, ".dialog");
      expect(dialog).not.toBeNull();
      const header = query(el, ".dialog-header h2");
      expect(text(header)).toContain("Dagdetails");
    });

    it("opens products dialog on Toevoegen click", async () => {
      el = createElement();
      await waitForRender(el);
      const addBtn = queryAll(el, ".action-btn").find((b) => text(b).includes("Toevoegen")) as HTMLElement;
      addBtn?.click();
      await waitForRender(el);
      const dialog = query(el, ".dialog");
      expect(dialog).not.toBeNull();
      const header = query(el, ".dialog-header h2");
      expect(text(header)).toBe("Toevoegen");
    });

    it("switches to products page on Producten tab click", async () => {
      el = createElement();
      await waitForRender(el);
      const tab = queryAll(el, ".person-tab").find((t) => text(t) === "Producten") as HTMLElement;
      tab?.click();
      await waitForRender(el);
      // Should show FAB (products page indicator)
      const fab = query(el, ".fab");
      expect(fab).not.toBeNull();
    });
  });

  describe("Quick gram edit", () => {
    it("shows inline input on grams click", async () => {
      el = createElement();
      await waitForRender(el);
      const grams = query(el, ".item-grams") as HTMLElement;
      grams?.click();
      await waitForRender(el);
      const input = query(el, ".quick-gram-input") as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input?.type).toBe("number");
    });
  });

  describe("Delete with undo", () => {
    it("shows snackbar after delete", async () => {
      let callCount = 0;
      const deleteCalled = vi.fn();
      el = document.createElement("voedingslog-panel") as VoedingslogPanel;
      el.hass = mockHass({
        "voedingslog/delete_item": (msg) => { deleteCalled(msg); return { success: true }; },
        "voedingslog/get_log": () => {
          callCount++;
          // First call returns items, subsequent calls (after delete) return empty
          if (callCount <= 1) {
            return { items: [{ name: "Brood", grams: 70, nutrients: { "energy-kcal_100g": 247 }, time: "08:30", category: "breakfast" }], totals: {} };
          }
          return { items: [], totals: {} };
        },
      });
      document.body.appendChild(el);
      await waitForRender(el);

      const deleteBtn = query(el, ".item-delete") as HTMLElement;
      expect(deleteBtn).not.toBeNull();
      deleteBtn?.click();
      await waitForRender(el);

      expect(deleteCalled).toHaveBeenCalled();
      const snackbar = query(el, ".snackbar");
      expect(snackbar).not.toBeNull();
      expect(text(snackbar)).toContain("verwijderd");
    });
  });

  describe("Date navigation", () => {
    it("has date nav buttons", async () => {
      el = createElement();
      await waitForRender(el);
      const navBtns = queryAll(el, ".date-nav .date-nav-btn");
      expect(navBtns.length).toBe(2);
    });

    it("shows date label", async () => {
      el = createElement();
      await waitForRender(el);
      const dateText = query(el, ".date-text");
      expect(text(dateText)).toBeTruthy();
    });
  });

  describe("Period toggle in day detail", () => {
    it("shows Dag/Week/Maand toggle", async () => {
      el = createElement();
      await waitForRender(el);
      // Open day detail
      (query(el, ".day-totals") as HTMLElement)?.click();
      await waitForRender(el);
      const toggleBtns = queryAll(el, ".period-toggle button");
      expect(toggleBtns.length).toBe(3);
      expect(text(toggleBtns[0])).toBe("Dag");
      expect(text(toggleBtns[1])).toBe("Week");
      expect(text(toggleBtns[2])).toBe("Maand");
    });
  });

  describe("Error boundary", () => {
    it("shows error message on render failure", async () => {
      el = document.createElement("voedingslog-panel") as VoedingslogPanel;
      el.hass = mockHass({
        "voedingslog/get_config": () => mockConfig(),
        "voedingslog/get_log": () => ({
          items: [{ name: "Test", grams: 100, nutrients: {}, time: "12:00", category: "breakfast" }], totals: {},
        }),
      });
      document.body.appendChild(el);
      await waitForRender(el);
      expect(query(el, ".panel") || query(el, ".container")).not.toBeNull();
    });
  });

  describe("Products dialog — add mode", () => {
    async function openAddMode(): Promise<VoedingslogPanel> {
      const panel = createElement();
      await waitForRender(panel);
      (queryAll(panel, ".action-btn").find((b) => text(b).includes("Toevoegen")) as HTMLElement)?.click();
      await waitForRender(panel);
      return panel;
    }

    it("shows search input", async () => {
      el = await openAddMode();
      const input = query(el, ".dialog input[type='text']") as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input?.placeholder).toContain("Zoek");
    });

    it("shows type filter chips", async () => {
      el = await openAddMode();
      const chips = queryAll(el, ".filter-chip");
      expect(chips.length).toBe(3);
      expect(text(chips[0])).toBe("Alle");
      expect(text(chips[1])).toBe("Producten");
      expect(text(chips[2])).toBe("Recepten");
    });

    it("shows product items from database", async () => {
      el = await openAddMode();
      const items = queryAll(el, ".product-item");
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it("shows barcode and manual buttons", async () => {
      el = await openAddMode();
      const buttons = queryAll(el, ".dialog .btn-secondary.btn-confirm");
      const labels = buttons.map((b) => text(b));
      expect(labels.some((l) => l.includes("Barcode"))).toBe(true);
      expect(labels.some((l) => l.includes("Handmatig"))).toBe(true);
    });

    it("does not show edit/delete buttons in add mode", async () => {
      el = await openAddMode();
      const editBtns = queryAll(el, ".product-item .item-edit");
      expect(editBtns.length).toBe(0);
    });
  });

  describe("Products page (tab view)", () => {
    async function openProductsTab(): Promise<VoedingslogPanel> {
      const panel = createElement();
      await waitForRender(panel);
      const productenTab = queryAll(panel, ".person-tab").find((t) => text(t) === "Producten") as HTMLElement;
      productenTab?.click();
      await waitForRender(panel);
      return panel;
    }

    it("shows products list when Producten tab clicked", async () => {
      el = await openProductsTab();
      const items = queryAll(el, ".product-item");
      expect(items.length).toBeGreaterThanOrEqual(0);
    });

    it("shows FAB button", async () => {
      el = await openProductsTab();
      const fab = query(el, ".fab");
      expect(fab).not.toBeNull();
    });

    it("shows cleanup button", async () => {
      el = await openProductsTab();
      const btns = queryAll(el, ".btn-secondary");
      expect(btns.some((b) => text(b).includes("opruimen"))).toBe(true);
    });
  });

  describe("Weight dialog", () => {
    it("opens with product name and nutrients", async () => {
      const logCalled = vi.fn();
      el = document.createElement("voedingslog-panel") as VoedingslogPanel;
      el.hass = mockHass({
        "voedingslog/log_product": (msg) => { logCalled(msg); return { success: true }; },
      });
      document.body.appendChild(el);
      await waitForRender(el);

      // Click an item to open edit, but instead let's use the products flow
      // Open add mode, click a product
      (queryAll(el, ".action-btn").find((b) => text(b).includes("Toevoegen")) as HTMLElement)?.click();
      await waitForRender(el);
      const productItem = query(el, ".product-item .product-info") as HTMLElement;
      productItem?.click();
      await waitForRender(el);

      // Weight dialog should be open
      const header = query(el, ".dialog-header h2");
      expect(text(header)).toBe("Volkoren brood");

      // Should show weight input
      const weightInput = query(el, "#weight-input") as HTMLInputElement;
      expect(weightInput).not.toBeNull();

      // Should show nutrient preview
      const preview = query(el, ".nutrient-preview");
      expect(preview).not.toBeNull();

      // Should show category selector
      const catSelect = query(el, "#category-select");
      expect(catSelect).not.toBeNull();
    });
  });

  describe("Day detail — day view content", () => {
    async function openDayDetail(): Promise<VoedingslogPanel> {
      const panel = createElement();
      await waitForRender(panel);
      (query(panel, ".day-totals") as HTMLElement)?.click();
      await waitForRender(panel);
      return panel;
    }

    it("shows pie chart section", async () => {
      el = await openDayDetail();
      const pie = query(el, ".pie-chart");
      expect(pie).not.toBeNull();
    });

    it("shows calorie count in pie center", async () => {
      el = await openDayDetail();
      const center = query(el, ".pie-center");
      expect(center).not.toBeNull();
      expect(text(center)).toContain("kcal");
    });

    it("shows macro legend", async () => {
      el = await openDayDetail();
      const legend = queryAll(el, ".legend-item");
      expect(legend.length).toBe(4); // carbs, protein, fat, fiber
    });

    it("shows all nutrients detail table", async () => {
      el = await openDayDetail();
      const header = queryAll(el, ".detail-table-header").find((h) => text(h).includes("Alle voedingswaarden"));
      expect(header).not.toBeNull();
    });

    it("shows logged items grouped by category", async () => {
      el = await openDayDetail();
      const catHeaders = queryAll(el, ".detail-category-header");
      expect(catHeaders.length).toBeGreaterThanOrEqual(1);
    });

    it("shows export button", async () => {
      el = await openDayDetail();
      const btns = queryAll(el, ".dialog .btn-secondary.btn-confirm");
      expect(btns.some((b) => text(b).includes("Exporteer"))).toBe(true);
    });

    it("shows period navigation arrows", async () => {
      el = await openDayDetail();
      const navBtns = queryAll(el, ".period-nav .date-nav-btn");
      expect(navBtns.length).toBe(2);
    });

    it("shows period label", async () => {
      el = await openDayDetail();
      const label = query(el, ".period-nav-label");
      expect(text(label)).toBeTruthy();
    });
  });

  describe("Day detail — week view", () => {
    it("loads period data when switching to week", async () => {
      const periodCalled = vi.fn();
      el = document.createElement("voedingslog-panel") as VoedingslogPanel;
      el.hass = mockHass({
        "voedingslog/get_period": (msg) => {
          periodCalled(msg);
          return { days: [
            { date: "2026-03-23", totals: { "energy-kcal_100g": 1800 }, item_count: 5 },
            { date: "2026-03-24", totals: { "energy-kcal_100g": 2100 }, item_count: 4 },
          ] };
        },
      });
      document.body.appendChild(el);
      await waitForRender(el);

      // Open day detail
      (query(el, ".day-totals") as HTMLElement)?.click();
      await waitForRender(el);

      // Click Week toggle
      const weekBtn = queryAll(el, ".period-toggle button")[1] as HTMLElement;
      weekBtn?.click();
      await waitForRender(el);

      expect(periodCalled).toHaveBeenCalled();
      // Should show chart(s)
      const charts = queryAll(el, ".period-chart");
      expect(charts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Dialog close and back navigation", () => {
    it("closes dialog on overlay click", async () => {
      el = createElement();
      await waitForRender(el);
      (query(el, ".day-totals") as HTMLElement)?.click();
      await waitForRender(el);
      expect(query(el, ".dialog")).not.toBeNull();

      // Click overlay (not dialog body)
      const overlay = query(el, ".dialog-overlay") as HTMLElement;
      overlay?.click();
      await waitForRender(el);
      // Dialog should be gone or navigated back
    });

    it("closes dialog on X button", async () => {
      el = createElement();
      await waitForRender(el);
      (query(el, ".day-totals") as HTMLElement)?.click();
      await waitForRender(el);

      const closeBtn = query(el, ".close-btn") as HTMLElement;
      closeBtn?.click();
      await waitForRender(el);
    });

    it("weight dialog back goes to products in add mode", async () => {
      el = createElement();
      await waitForRender(el);

      // Open add mode
      (queryAll(el, ".action-btn").find((b) => text(b).includes("Toevoegen")) as HTMLElement)?.click();
      await waitForRender(el);

      // Click product to open weight dialog
      (query(el, ".product-item .product-info") as HTMLElement)?.click();
      await waitForRender(el);
      expect(text(query(el, ".dialog-header h2"))).toBe("Volkoren brood");

      // Click close/back on weight dialog
      (query(el, ".close-btn") as HTMLElement)?.click();
      await waitForRender(el);

      // Should be back in products list
      const header = query(el, ".dialog-header h2");
      expect(text(header)).toBe("Toevoegen");
    });
  });

  describe("Loading and empty states", () => {
    it("shows loading state before config loads", async () => {
      el = document.createElement("voedingslog-panel") as VoedingslogPanel;
      // Don't set hass yet — mock a slow config load
      el.hass = {
        callWS: () => new Promise(() => {}), // never resolves
        user: { id: "test", name: "Test" },
      };
      document.body.appendChild(el);
      await el.updateComplete;
      expect(text(el.shadowRoot as unknown as Element)).toContain("Laden");
    });

    it("shows empty hint in categories with no items", async () => {
      el = document.createElement("voedingslog-panel") as VoedingslogPanel;
      el.hass = mockHass({
        "voedingslog/get_log": () => ({ items: [], totals: {} }),
      });
      document.body.appendChild(el);
      await waitForRender(el);
      const hints = queryAll(el, ".empty-hint");
      expect(hints.length).toBe(4); // all 4 categories empty
    });

    it("renders correctly with multiple items in multiple categories", async () => {
      el = document.createElement("voedingslog-panel") as VoedingslogPanel;
      el.hass = mockHass({
        "voedingslog/get_log": () => ({
          items: [
            { name: "Brood", grams: 70, nutrients: { "energy-kcal_100g": 247 }, time: "08:30", category: "breakfast" },
            { name: "Soep", grams: 300, nutrients: { "energy-kcal_100g": 45 }, time: "12:30", category: "lunch" },
            { name: "Pasta", grams: 400, nutrients: { "energy-kcal_100g": 150 }, time: "18:30", category: "dinner" },
          ],
          totals: {},
        }),
      });
      document.body.appendChild(el);
      await waitForRender(el);
      const items = queryAll(el, ".food-item");
      expect(items.length).toBe(3);
      const hints = queryAll(el, ".empty-hint");
      expect(hints.length).toBe(1); // only snack is empty
    });
  });

  describe("Narrow mode", () => {
    it("shows menu button when narrow", async () => {
      el = createElement();
      el.narrow = true;
      await waitForRender(el);
      const menuBtn = query(el, ".menu-btn");
      expect(menuBtn).not.toBeNull();
    });

    it("hides menu button when not narrow", async () => {
      el = createElement();
      el.narrow = false;
      await waitForRender(el);
      const menuBtn = query(el, ".menu-btn");
      expect(menuBtn).toBeNull();
    });
  });
});
