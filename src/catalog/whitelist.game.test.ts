import { describe, expect, it } from "vitest";
import { getActiveCatalog } from "./activeCatalog";
import { WHITELIST_ORDER } from "./overrides";

describe("whitelist ⊆ catalogue (R2)", () => {
  it("chaque entrée WHITELIST_ORDER existe dans le catalogue résolu", () => {
    const catalog = getActiveCatalog();
    expect(catalog).toBeTruthy();
    const names = new Set(catalog!.components.map((c) => c.name));
    for (const name of WHITELIST_ORDER) {
      expect(names.has(name), `whitelist « ${name} » absent du catalogue`).toBe(
        true,
      );
    }
  });

  it("AbsoluteLayout est injecté avec slot children", () => {
    const abs = getActiveCatalog()!.components.find(
      (c) => c.name === "AbsoluteLayout",
    );
    expect(abs).toBeTruthy();
    expect(abs!.fields.find((f) => f.name === "children")?.kind).toBe(
      "slot-multi",
    );
  });
});
