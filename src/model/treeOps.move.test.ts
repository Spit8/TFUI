import { beforeEach, describe, expect, it } from "vitest";
import { setClipboardNode } from "./clipboard";
import { createEmptyProject, createNode } from "./factory";
import {
  copyNodeToClipboard,
  findNode,
  insertNode,
  moveDown,
  moveUp,
  outdentNode,
  pasteClipboardNode,
  unwrapNode,
  wrapNode,
} from "./treeOps";

describe("treeOps move/outdent/unwrap/paste (S2)", () => {
  beforeEach(() => {
    setClipboardNode(null);
  });

  function boxWithThreeTexts() {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const box = createNode("BoxLayout");
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    const a = createNode("TextView", "A");
    const b = createNode("TextView", "B");
    const c = createNode("TextView", "C");
    project = insertNode(project, screen.id, box.id, "children", a);
    project = insertNode(project, screen.id, box.id, "children", b);
    project = insertNode(project, screen.id, box.id, "children", c);
    return { project, screen, box, a, b, c };
  }

  it("moveUp / moveDown échangent l’ordre", () => {
    const seeded = boxWithThreeTexts();
    let project = seeded.project;
    const { box, a, c } = seeded;
    let r = moveDown(project, a.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    project = r.project;
    expect(
      findNode(project, box.id)!.node.slots.children.map((n) => n.name),
    ).toEqual(["B", "A", "C"]);

    r = moveUp(project, c.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      findNode(r.project, box.id)!.node.slots.children.map((n) => n.name),
    ).toEqual(["B", "C", "A"]);
  });

  it("moveUp refuse le premier", () => {
    const { project, a } = boxWithThreeTexts();
    const r = moveUp(project, a.id);
    expect(r.ok).toBe(false);
  });

  it("outdent place le nœud comme frère du parent", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const outer = createNode("BoxLayout", "Outer");
    const inner = createNode("BoxLayout", "Inner");
    const text = createNode("TextView", "T");
    project = insertNode(project, screen.id, screen.root.id, "content", outer);
    project = insertNode(project, screen.id, outer.id, "children", inner);
    project = insertNode(project, screen.id, inner.id, "children", text);

    const r = outdentNode(project, text.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const outerNode = findNode(r.project, outer.id)!.node;
    expect(outerNode.slots.children.map((n) => n.name)).toEqual([
      "Inner",
      "T",
    ]);
    expect(findNode(r.project, inner.id)!.node.slots.children).toHaveLength(0);
  });

  it("unwrap remplace le wrapper par ses enfants", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const box = createNode("BoxLayout");
    const text = createNode("TextView", "Alone");
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    project = insertNode(project, screen.id, box.id, "children", text);

    const wrapped = wrapNode(project, text.id, "BoxLayout");
    expect(wrapped.ok).toBe(true);
    if (!wrapped.ok) return;
    const wrapperId = findNode(wrapped.project, box.id)!.node.slots.children[0]
      .id;
    const r = unwrapNode(wrapped.project, wrapperId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(
      findNode(r.project, box.id)!.node.slots.children.map((n) => n.name),
    ).toEqual(["Alone"]);
  });

  it("copy + paste réassigne les ids et vide meta.id", () => {
    let project = createEmptyProject();
    const screen = project.screens[0];
    const box = createNode("BoxLayout");
    const text = createNode("TextView", "A");
    text.meta.id = "keep.me";
    project = insertNode(project, screen.id, screen.root.id, "content", box);
    project = insertNode(project, screen.id, box.id, "children", text);

    expect(copyNodeToClipboard(project, text.id).ok).toBe(true);
    const pasted = pasteClipboardNode(project, text.id);
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    const children = findNode(pasted.project, box.id)!.node.slots.children;
    expect(children).toHaveLength(2);
    const clone = children[1];
    expect(clone.id).not.toBe(text.id);
    expect(clone.meta.id).toBeUndefined();
    expect(clone.type).toBe("TextView");
  });
});
