import { describe, expect, it } from "vitest";
import type { CatalogField } from "../catalog/types";
import {
  clampInitialXY,
  filterPropFields,
  filterPropFieldsList,
  isEditablePropField,
} from "./propFilters";

describe("propFilters", () => {
  it("exclut slots et styleSheet", () => {
    const fields: CatalogField[] = [
      { name: "text", tealType: "string", kind: "string" },
      { name: "content", tealType: "TreeNodeId", kind: "slot-single" },
      { name: "children", tealType: "{TreeNodeId}", kind: "slot-multi" },
      { name: "styleSheet", tealType: "any", kind: "unsupported" },
      { name: "StyleSheet", tealType: "any", kind: "unsupported" },
    ];
    expect(filterPropFields(fields).map((f) => f.name)).toEqual(["text"]);
    expect(isEditablePropField(fields[3]!)).toBe(false);
  });

  it("refuse initialX > 1", () => {
    const bad = clampInitialXY("initialX", 1.5);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toMatch(/\[0, 1]/);

    const good = clampInitialXY("initialX", 0.5);
    expect(good.ok).toBe(true);

    const other = clampInitialXY("title", 99);
    expect(other.ok).toBe(true);
  });

  it("filtre par requête et définies seulement", () => {
    const fields: CatalogField[] = [
      { name: "title", tealType: "string", kind: "string", comment: "Titre fenêtre" },
      { name: "initialX", tealType: "number", kind: "number" },
      { name: "closable", tealType: "boolean", kind: "boolean" },
    ];
    expect(
      filterPropFieldsList(fields, { query: "titre" }).map((f) => f.name),
    ).toEqual(["title"]);
    expect(
      filterPropFieldsList(fields, {
        definedOnly: true,
        props: {
          title: { kind: "literal", value: "x" },
          closable: { kind: "literal", value: true },
        },
      }).map((f) => f.name),
    ).toEqual(["title", "closable"]);
  });
});
