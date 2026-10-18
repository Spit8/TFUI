import { describe, expect, it } from "vitest";
import { getActiveCatalog } from "../catalog/activeCatalog";
import { createEmptyProject, createNode } from "../model/factory";
import { insertNode } from "../model/treeOps";
import {
  paletteTargetNodeId,
  planPaletteAutoInsert,
  planPaletteInsert,
} from "./paletteInsert";

function setup() {
  let project = createEmptyProject();
  const screen = project.screens[0]!;
  const box = createNode("BoxLayout");
  project = insertNode(project, screen.id, screen.root.id, "content", box);
  const text = createNode("TextView", "Titre");
  project = insertNode(project, screen.id, box.id, "children", text);
  return { project, screen, box, text };
}

describe("paletteTargetNodeId", () => {
  it("préfère le nœud sélectionné, sinon la racine de l’écran sélectionné", () => {
    const { project, screen, box } = setup();
    expect(paletteTargetNodeId(project, box.id, screen.id)).toBe(box.id);
    expect(paletteTargetNodeId(project, null, screen.id)).toBe(screen.root.id);
    expect(paletteTargetNodeId(project, null, null)).toBeNull();
  });
});

describe("planPaletteInsert", () => {
  it("ajoute un enfant dans un conteneur", () => {
    const { project, box } = setup();
    const plan = planPaletteInsert(project, box.id, "Button", "child", getActiveCatalog());
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.parentId).toBe(box.id);
      expect(plan.targetType).toBe("BoxLayout");
    }
  });

  it("insère avant / après un nœud, au bon index", () => {
    const { project, box, text } = setup();
    const before = planPaletteInsert(project, text.id, "Button", "before", getActiveCatalog());
    const after = planPaletteInsert(project, text.id, "Button", "after", getActiveCatalog());
    expect(before.ok && before.parentId === box.id && before.index === 0).toBe(true);
    expect(after.ok && after.index === 1).toBe(true);
  });

  it("refuse à côté de la racine avec une raison", () => {
    const { project, screen } = setup();
    const plan = planPaletteInsert(project, screen.root.id, "Button", "after", getActiveCatalog());
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toMatch(/racine/);
  });
});

describe("planPaletteAutoInsert", () => {
  it("insère après un nœud sans enfant au lieu du premier écran", () => {
    const { project, box, text } = setup();
    const plan = planPaletteAutoInsert(project, text.id, "Button", getActiveCatalog());
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.mode).toBe("after");
      expect(plan.parentId).toBe(box.id);
    }
  });
});
