import { describe, expect, it } from "vitest";
import { createEmptyProject, createNode, createStarterNode } from "./factory";
import { inlineEditTarget } from "./inlineEdit";
import { insertSlotFor } from "./slots";
import { validateProject } from "./validate";

describe("titre d’un onglet (TabWidgetChild.indicator)", () => {
  it("un onglet neuf a son titre : TextView de classe font-scale-tab-widget-indicator", () => {
    const { node } = createStarterNode("TabWidgetChild");
    const title = node.slots.indicator?.[0];
    expect(title?.type).toBe("TextView");
    expect(title?.meta.class).toEqual(["font-scale-tab-widget-indicator"]);
    expect(title?.props.text).toMatchObject({ kind: "literal" });
  });

  it("déposé dans l’onglet : le contenu d’abord, puis le titre s’il est libre", () => {
    const tab = createNode("TabWidgetChild");
    expect(insertSlotFor(tab)).toBe("item");
    tab.slots.item = [createNode("TextView")];
    expect(insertSlotFor(tab)).toBe("indicator");
    tab.slots.indicator = [createNode("TextView")];
    // Tout est pris : slot principal, le refus « déjà occupé » est expliqué ailleurs.
    expect(insertSlotFor(tab)).toBe("item");
    // Les autres types ne changent pas de comportement.
    expect(insertSlotFor(createNode("BoxLayout"))).toBe("children");
  });

  it("double-clic sur l’onglet : édite le texte de son titre", () => {
    const { node } = createStarterNode("TabWidgetChild");
    const target = inlineEditTarget(node);
    expect(target).toMatchObject({ mode: "text", nodeId: node.slots.indicator![0]!.id, prop: "text" });
  });

  it("avertit d’un onglet sans titre", () => {
    const project = createEmptyProject();
    const root = project.screens[0]!.root;
    const tabs = createNode("TabWidget");
    const bare = createNode("TabWidgetChild");
    const titled = createStarterNode("TabWidgetChild").node;
    tabs.slots.tabs = [bare, titled];
    root.slots.content = [tabs];
    const warnings = validateProject(project).filter((i) => i.code === "tab_without_title");
    expect(warnings.map((w) => w.nodeId)).toEqual([bare.id]);
  });
});
