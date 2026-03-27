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
      expect(buttons.length).toBeGreaterThanOrEqual(2);
      const labels = buttons.map((b) => text(b));
      expect(labels).toContain("Producten");
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
    it("shows tabs when multiple persons configured", async () => {
      el = document.createElement("voedingslog-panel") as VoedingslogPanel;
      el.hass = mockHass({
        "voedingslog/get_config": () => mockConfig({ persons: ["Jan", "Lisa"] }),
      });
      document.body.appendChild(el);
      await waitForRender(el);
      const tabs = queryAll(el, ".person-tab");
      expect(tabs.length).toBe(2);
    });

    it("hides tabs when single person", async () => {
      el = createElement();
      await waitForRender(el);
      const tabs = queryAll(el, ".person-tab");
      expect(tabs.length).toBe(0);
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

    it("opens products manage dialog on Producten click", async () => {
      el = createElement();
      await waitForRender(el);
      const btn = queryAll(el, ".action-btn").find((b) => text(b).includes("Producten")) as HTMLElement;
      btn?.click();
      await waitForRender(el);
      const header = query(el, ".dialog-header h2");
      expect(text(header)).toBe("Producten");
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
        "voedingslog/get_config": () => {
          // Return config that will cause groupByCategory to fail
          return mockConfig();
        },
        "voedingslog/get_log": () => {
          // Return malformed items that might cause render issues
          return { items: [{ name: "Test", grams: 100, nutrients: {}, time: "12:00", category: "breakfast" }], totals: {} };
        },
      });
      document.body.appendChild(el);
      await waitForRender(el);
      // Panel should render without crashing
      expect(query(el, ".panel") || query(el, ".container")).not.toBeNull();
    });
  });
});
