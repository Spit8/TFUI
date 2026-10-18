import { describe, expect, it } from "vitest";
import {
  elementClassName,
  elementRuleSelectors,
  migrateInlineStyles,
  newSharedClassSelector,
  pruneElementRules,
  setElementStyleValue,
} from "./elementStyle";
import { createEmptyProject, createNode } from "./factory";
import { insertNode } from "./treeOps";
import type { TfuiProject } from "./types";

let n = 0;
const id = () => `rule-${++n}`;

describe("elementStyle", () => {
  it("dérive classe et sélecteurs de l’id du nœud", () => {
    expect(elementClassName("ABCD1234-ef56")).toBe("tfui-abcd1234");
    let p = createEmptyProject();
    const box = { ...createNode("BoxLayout"), id: "abcd1234-x" };
    p = insertNode(p, p.screens[0]!.id, p.screens[0]!.root.id, "content", box);
    const screen = p.screens[0]!;
    // Type + classe unique accolés, sans R:: (voir elementRuleSelectors).
    expect(elementRuleSelectors(screen, "abcd1234-x", "hover")).toEqual([
      "BoxLayout!tfui-abcd1234:hover",
    ]);
    // Racine : classe accolée au type ; fenêtre étendue → !window-expanded.
    const root = {
      ...screen.root,
      id: "abcd1234-root",
      props: { ...screen.root.props, expanded: { kind: "literal" as const, value: true } },
    };
    expect(elementRuleSelectors({ ...screen, root }, root.id)).toEqual([
      "Window!tfui-abcd1234",
      "Window!tfui-abcd1234!window-expanded",
    ]);
  });

  it("setElementStyleValue crée puis supprime la règle vide", () => {
    const p0 = { ...createEmptyProject(), styleRules: [] };
    const nodeId = p0.screens[0]!.root.id;
    const p1 = setElementStyleValue(p0, nodeId, null, "size", [10, 20], id);
    expect(p1.styleRules).toHaveLength(1);
    expect(p1.styleRules[0]).toMatchObject({ ownerNodeId: nodeId, props: { size: [10, 20] } });
    const p2 = setElementStyleValue(p1, nodeId, null, "size", undefined, id);
    expect(p2.styleRules).toHaveLength(0);
  });

  it("pruneElementRules retire les règles orphelines", () => {
    const p0 = { ...createEmptyProject(), styleRules: [] };
    const p1 = setElementStyleValue(p0, "gone", null, "size", [1, 1], id);
    expect(pruneElementRules(p1).styleRules).toHaveLength(0);
  });

  it("migre le style inline vers la règle Normal de l’élément", () => {
    let p: TfuiProject = { ...createEmptyProject(), styleRules: [] };
    const screen = p.screens[0]!;
    const box = createNode("BoxLayout");
    box.meta.inlineStyle = { padding: [1, 2, 3, 4] };
    p = insertNode(p, screen.id, screen.root.id, "content", box);
    const migrated = migrateInlineStyles(p, id);
    expect(migrated.styleRules).toHaveLength(1);
    expect(migrated.styleRules[0]).toMatchObject({
      ownerNodeId: box.id,
      props: { padding: [1, 2, 3, 4] },
    });
    const migratedBox = migrated.screens[0]!.root.slots.content![0]!;
    expect(migratedBox.meta.inlineStyle).toBeUndefined();
  });

  it("nomme une nouvelle classe partagée sans collision", () => {
    const p = createEmptyProject();
    p.styleRules.push({ id: "a", selector: "!classe-1", props: {} });
    expect(newSharedClassSelector(p)).toBe("!classe-2");
  });
});
