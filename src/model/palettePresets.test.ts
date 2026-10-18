import { describe, expect, it } from "vitest";
import { createStarterNode, nextChildValue } from "./factory";
import { PALETTE_PRESETS } from "./palettePresets";

describe("préréglages de la palette", () => {
  it("un espaceur est un Component vide avec la classe vanilla", () => {
    const { node, styles } = createStarterNode("Component", null, undefined, "HorizontalSpacer", "Espaceur");
    expect(node.type).toBe("Component");
    expect(node.meta.class).toEqual(["horizontal-spacer"]);
    expect(node.name).toBe("Espaceur");
    expect(Object.values(node.slots).flat()).toEqual([]);
    expect(styles).toEqual([]);
  });

  it("un préréglage d’un autre type est ignoré", () => {
    const { node } = createStarterNode("BoxLayout", null, undefined, "HorizontalSpacer");
    expect(node.meta.class).toBeUndefined();
  });

  it("identifiants uniques", () => {
    const ids = PALETTE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("valeur des onglets et éléments de liste déroulante", () => {
  it("prochaine valeur libre : après la plus grande et le nombre de frères", () => {
    const valued = (value: number) => ({ ...createStarterNode("TabWidgetChild").node, props: { value: { kind: "literal" as const, value } } });
    expect(nextChildValue([])).toBe(1);
    expect(nextChildValue([valued(1), valued(2)])).toBe(3);
    expect(nextChildValue([valued(7)])).toBe(8);
    expect(nextChildValue([createStarterNode("TabWidgetChild").node, createStarterNode("TabWidgetChild").node])).toBe(3);
  });
});
