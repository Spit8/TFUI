import { describe, expect, it } from "vitest";
import { createEmptyProject, createNode } from "./factory";
import {
  duplicateNode,
  findNode,
  insertNode,
  wrapNode,
} from "./treeOps";

describe("duplicateNode / wrapNode (R7)", () => {
  it("refuse de dupliquer dans un slot mono plein", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const scroll = createNode("ScrollArea");
    project = insertNode(project, screen.id, screen.root.id, "content", scroll);
    // Un Component (le jeu refuse un layout en contenu de ScrollArea).
    const box = createNode("Component");
    project = insertNode(project, screen.id, scroll.id, "content", box);

    const result = duplicateNode(project, box.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/un seul enfant/);
  });

  it("vide meta.id et suffixe le name à la duplication", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const box = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    const text = createNode("TextView", "Label");
    text.meta.id = "unique.label";
    project = insertNode(project, screen.id, box.id, "children", text);

    const result = duplicateNode(project, text.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const children = findNode(result.project, box.id)!.node.slots.children;
    expect(children).toHaveLength(2);
    expect(children[1].meta.id).toBeUndefined();
    expect(children[1].name).toBe("Label_2");
    expect(children[1].id).not.toBe(children[0].id);
  });

  it("refuse d’envelopper la Window racine", () => {
    const project = createEmptyProject();
    const result = wrapNode(
      project,
      project.screens[0].root.id,
      "BoxLayout",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/racine/);
  });

  it("refuse d’envelopper si le parent n’accepte pas le wrapper", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const box = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    const text = createNode("TextView");
    project = insertNode(project, screen.id, box.id, "children", text);
    // AbsoluteLayoutChild n’est valide que sous AbsoluteLayout
    const result = wrapNode(project, text.id, "AbsoluteLayoutChild");
    expect(result.ok).toBe(false);
  });
});
