import { describe, expect, it } from "vitest";
import { checkDrop, chooseDropKind } from "./dropTarget";
import { createEmptyProject, createNode } from "./factory";
import { primaryInsertSlot } from "./slots";

function setup() {
  const project = createEmptyProject({ modId: "m" });
  const root = project.screens[0]!.root;
  const box = createNode("BoxLayout");
  const text = createNode("TextView");
  const text2 = createNode("TextView");
  box.slots[primaryInsertSlot("BoxLayout")!] = [text];
  root.slots[primaryInsertSlot("Window")!] = [box];
  const other = createNode("BoxLayout");
  box.slots[primaryInsertSlot("BoxLayout")!]!.push(other);
  other.slots[primaryInsertSlot("BoxLayout")!] = [text2];
  return { project, root, box, text, text2, other };
}

describe("zone de dépôt", () => {
  it("bords = avant / après, milieu = dans ; sans enfant possible, moitié la plus proche", () => {
    expect(chooseDropKind(0.1, true, true)).toBe("before");
    expect(chooseDropKind(0.5, true, true)).toBe("into");
    expect(chooseDropKind(0.9, true, true)).toBe("after");
    expect(chooseDropKind(0.45, false, true)).toBe("before");
    expect(chooseDropKind(0.55, false, true)).toBe("after");
    expect(chooseDropKind(0.1, true, false)).toBe("into");
  });
});

describe("validité d’un dépôt", () => {
  it("déplace un nœud en enfant d’une BoxLayout", () => {
    const { project, text, other } = setup();
    const r = checkDrop(project, { source: "tree", nodeId: text.id }, other.id, "into");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.placement.parentId).toBe(other.id);
  });

  it("refuse un dépôt dans un élément sans enfant", () => {
    const { project, text, text2 } = setup();
    expect(checkDrop(project, { source: "tree", nodeId: text.id }, text2.id, "into").ok).toBe(false);
  });

  it("relâché sur lui-même ou dans son contenu : rien ne bouge, sans erreur", () => {
    const { project, box, text, text2, other } = setup();
    for (const [id, target, kind] of [
      [text.id, text.id, "after"],
      [box.id, box.id, "into"],
      [box.id, other.id, "into"],
      [box.id, text2.id, "before"],
    ] as const) {
      const r = checkDrop(project, { source: "tree", nodeId: id }, target, kind);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.noop).toBe(true);
    }
  });

  it("refuse une Window déposée depuis la palette, et un frère de la racine", () => {
    const { project, root, box, text2 } = setup();
    expect(checkDrop(project, { source: "palette", type: "Window" }, box.id, "into").ok).toBe(false);
    expect(checkDrop(project, { source: "palette", type: "TextView" }, root.id, "before").ok).toBe(false);
    // Le slot « content » d’une Window n’accepte qu’un enfant.
    expect(checkDrop(project, { source: "palette", type: "TextView" }, box.id, "after").ok).toBe(false);
    expect(checkDrop(project, { source: "palette", type: "TextView" }, text2.id, "after").ok).toBe(true);
  });

  it("icône du jeu : validée comme un ImageView", () => {
    const { project, text2 } = setup();
    const r = checkDrop(project, { source: "gameIcon", path: "::/gui/hud/icons/bus.tga" }, text2.id, "after");
    expect(r.ok).toBe(true);
    expect(checkDrop(project, { source: "gameIcon", path: "x" }, text2.id, "into").ok).toBe(false);
  });
});
