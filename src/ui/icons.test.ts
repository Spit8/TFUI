import { describe, expect, it } from "vitest";
import { Columns3, Puzzle, Rows3 } from "lucide-react";
import { WHITELIST_ORDER } from "../catalog/overrides";
import { resolveComponentIcon } from "./icons";

describe("resolveComponentIcon (§3.4)", () => {
  it("chaque entrée WHITELIST_ORDER résout une icône ≠ Puzzle", () => {
    for (const name of WHITELIST_ORDER) {
      const icon = resolveComponentIcon(name);
      expect(icon, name).not.toBe(Puzzle);
    }
  });

  it("type inconnu → Puzzle", () => {
    expect(resolveComponentIcon("NotARealComponent")).toBe(Puzzle);
  });

  it("BoxLayout suit orientation", () => {
    expect(resolveComponentIcon("BoxLayout")).toBe(Rows3);
    expect(
      resolveComponentIcon("BoxLayout", {
        orientation: "Orientation.Vertical",
      }),
    ).toBe(Rows3);
    expect(
      resolveComponentIcon("BoxLayout", {
        orientation: "Orientation.Horizontal",
      }),
    ).toBe(Columns3);
    expect(
      resolveComponentIcon("BoxLayout", {
        orientation: {
          kind: "literal",
          value: "Orientation.Horizontal",
        },
      }),
    ).toBe(Columns3);
  });
});
