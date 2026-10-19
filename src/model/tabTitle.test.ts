import { describe, expect, it } from "vitest";
import { createEmptyProject, createNode, createStarterNode } from "./factory";
import { inlineEditTarget } from "./inlineEdit";
import { primaryInsertSlot } from "./slots";
import { setTabTitle, tabTitleText } from "./tabTitle";
import { canPlaceType } from "./treeOps";
import { validateProject } from "./validate";

describe("titre d’un onglet (TabWidgetChild.indicator)", () => {
  it("un onglet neuf a son titre : TextView de classe font-scale-tab-widget-indicator", () => {
    const { node } = createStarterNode("TabWidgetChild");
    const title = node.slots.indicator?.[0];
    expect(title?.type).toBe("TextView");
    expect(title?.meta.class).toEqual(["font-scale-tab-widget-indicator"]);
    expect(title?.props.text).toMatchObject({ kind: "literal" });
  });

  it("on ne dépose dans un onglet que dans son contenu, jamais dans son titre", () => {
    const tab = createNode("TabWidgetChild");
    expect(primaryInsertSlot("TabWidgetChild")).toBe("item");
    expect(canPlaceType("TabWidgetChild", "item", "TextView", tab.slots).ok).toBe(true);
    expect(canPlaceType("TabWidgetChild", "indicator", "TextView", tab.slots).ok).toBe(false);
  });

  it("le titre se règle depuis l’inspecteur : modifié, ou créé s’il manque", () => {
    const project = createEmptyProject();
    const root = project.screens[0]!.root;
    const tabs = createNode("TabWidget");
    const bare = createNode("TabWidgetChild");
    const titled = createStarterNode("TabWidgetChild").node;
    tabs.slots.tabs = [bare, titled];
    root.slots.content = [tabs];

    const p1 = setTabTitle(project, bare.id, "Réglages");
    const created = p1.screens[0]!.root.slots.content![0]!.slots.tabs![0]!;
    expect(tabTitleText(created)).toBe("Réglages");
    expect(created.slots.indicator![0]!.meta.class).toEqual(["font-scale-tab-widget-indicator"]);

    const p2 = setTabTitle(p1, titled.id, "Lignes");
    expect(tabTitleText(p2.screens[0]!.root.slots.content![0]!.slots.tabs![1]!)).toBe("Lignes");
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
