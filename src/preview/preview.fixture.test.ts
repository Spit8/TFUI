import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TfuiProject, UiNode } from "../model/types";
import { resolveStyles } from "./cascade";

const dir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../tests/preview-fixture",
);

function collectTypes(node: UiNode, into: Set<string>): void {
  into.add(node.type);
  for (const children of Object.values(node.slots)) {
    for (const child of children) collectTypes(child, into);
  }
}

function findById(node: UiNode, id: string): UiNode | null {
  if (node.id === id) return node;
  for (const children of Object.values(node.slots)) {
    for (const child of children) {
      const f = findById(child, id);
      if (f) return f;
    }
  }
  return null;
}

describe("preview fixture 2 colonnes", () => {
  it("contient TabWidget, List, Button et résout les styles", () => {
    const project = JSON.parse(
      readFileSync(join(dir, "two-columns.tfui.json"), "utf8"),
    ) as TfuiProject;
    const screen = project.screens[0];
    const types = new Set<string>();
    collectTypes(screen.root, types);
    expect(types.has("TabWidget")).toBe(true);
    expect(types.has("List")).toBe(true);
    expect(types.has("Button")).toBe(true);
    expect(types.has("BoxLayout")).toBe(true);

    const rootBox = findById(screen.root, "root-box")!;
    const styles = resolveStyles(project, screen, rootBox);
    expect(styles.innerSpacing).toEqual([16, 12]);

    project.styleRules[0] = {
      ...project.styleRules[0],
      props: { innerSpacing: [30, 20] },
    };
    expect(resolveStyles(project, screen, rootBox).innerSpacing).toEqual([
      30, 20,
    ]);
  });
});
