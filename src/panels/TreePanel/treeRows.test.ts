import { describe, expect, it } from "vitest";
import type { Screen, UiNode } from "../../model/types";
import { ancestorIds, filterCollapsedRows, flattenScreen, projectLabel } from "./treeRows";

function node(id: string, type: string, slots: Record<string, UiNode[]> = {}): UiNode {
  return { id, type, props: {}, meta: {}, slots };
}

function screen(root: UiNode): Screen {
  return { id: "s", fileBase: "f", recipeName: "W", kind: "window", state: [], root, previewViewport: { w: 1, h: 1 } };
}

describe("arbre compact", () => {
  const tv = node("t", "TextView");
  const box = node("b", "BoxLayout", { children: [tv] });
  const tab = node("tab", "Tab", { indicator: [node("i", "TextView")], item: [node("c", "BoxLayout")] });
  const win = node("w", "Window", { content: [box], header: [tab] });
  const rows = flattenScreen(screen(win));

  it("une ligne par nœud, un cran d’indentation par niveau (pas d’en-tête de slot)", () => {
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ["w", 0],
      ["b", 1],
      ["t", 2],
      ["tab", 1],
      ["i", 2],
      ["c", 2],
    ]);
  });

  it("étiquette de slot seulement quand le parent a plusieurs slots", () => {
    const badge = Object.fromEntries(rows.map((r) => [r.id, r.slotBadge]));
    // Window : header ET content remplis ici → étiquettes.
    expect(badge.b).toBe("content");
    expect(badge.t).toBeUndefined();
    expect(badge.i).toBe("indicator");
    expect(badge.c).toBe("item");
  });

  it("repli et ancêtres", () => {
    expect(filterCollapsedRows(rows, new Set(["b"])).map((r) => r.id)).toEqual(["w", "b", "tab", "i", "c"]);
    expect(ancestorIds(rows, "t")).toEqual(["b", "w"]);
    expect(projectLabel("C:\\x\\mod.tfui.json")).toBe("mod.tfui.json");
    expect(projectLabel(null)).toBe("Sans titre");
  });

  it("un seul slot rempli (BoxLayout children / child) : pas d’étiquette", () => {
    const only = flattenScreen(screen(node("w", "Window", { content: [node("b", "BoxLayout", { children: [node("t", "TextView")], child: [] })] })));
    expect(only.every((r) => r.slotBadge === undefined)).toBe(true);
  });
});
