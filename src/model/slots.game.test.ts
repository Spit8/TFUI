import { describe, expect, it } from "vitest";
import { getActiveCatalog } from "../catalog/activeCatalog";
import { WHITELIST_ORDER } from "../catalog/overrides";
import {
  defaultSlotsForType,
  migrateNodeSlots,
  slotFieldsForType,
} from "./slots";
import { createNode } from "./factory";

describe("slots catalogue (R1)", () => {
  it("charge un catalogue actif (setup vitest)", () => {
    expect(getActiveCatalog()).toBeTruthy();
  });

  it("List → children, ComboBox → items, Component → layout, CheckBox → aucun", () => {
    const catalog = getActiveCatalog()!;
    expect(
      slotFieldsForType("List", catalog).map((f) => f.name),
    ).toEqual(["children"]);
    expect(
      slotFieldsForType("ComboBox", catalog).map((f) => f.name),
    ).toEqual(["items"]);
    expect(
      slotFieldsForType("Component", catalog).map((f) => f.name),
    ).toEqual(["layout"]);
    expect(slotFieldsForType("CheckBox", catalog)).toEqual([]);
    expect(
      slotFieldsForType("AbsoluteLayoutChild", catalog).map((f) => f.name),
    ).toEqual(["item"]);
    expect(
      slotFieldsForType("TabWidgetChild", catalog).map((f) => f.name),
    ).toEqual(["indicator", "item"]);
    expect(
      slotFieldsForType("ComboBoxItem", catalog).map((f) => f.name),
    ).toEqual(["content"]);
  });

  it("chaque slot défaut d’un type whitelist existe dans le catalogue", () => {
    const catalog = getActiveCatalog()!;
    for (const type of WHITELIST_ORDER) {
      const fields = new Set(
        slotFieldsForType(type, catalog).map((f) => f.name),
      );
      for (const slot of Object.keys(defaultSlotsForType(type, catalog))) {
        expect(fields.has(slot), `${type}.${slot} hors catalogue`).toBe(true);
      }
    }
  });

  it("createNode n’invente pas de slots List/ComboBox/CheckBox", () => {
    expect(Object.keys(createNode("List").slots)).toEqual(["children"]);
    expect(Object.keys(createNode("ComboBox").slots)).toEqual(["items"]);
    expect(Object.keys(createNode("CheckBox").slots)).toEqual([]);
    expect(Object.keys(createNode("Component").slots)).toEqual(["layout"]);
  });

  it("migre les clés de slots obsolètes", () => {
    const list = createNode("List");
    list.slots = { items: [createNode("TextView")] };
    const warnings = migrateNodeSlots(list);
    expect(list.slots.children).toHaveLength(1);
    expect(list.slots.items).toBeUndefined();

    const combo = createNode("ComboBox");
    combo.slots = { children: [createNode("ComboBoxItem")] };
    migrateNodeSlots(combo);
    expect(combo.slots.items).toHaveLength(1);
    expect(combo.slots.children).toBeUndefined();

    const check = createNode("CheckBox");
    check.slots = { content: [createNode("TextView")] };
    const w = migrateNodeSlots(check);
    expect(check.slots.content).toBeUndefined();
    expect(w.length).toBeGreaterThan(0);
    expect(warnings).toEqual([]);
  });
});
