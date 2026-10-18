import { describe, expect, it } from "vitest";
import { setActiveBaseStyles } from "../gamestyle/activeBaseStyles";
import { testRule } from "../gamestyle/testRules";
import type { Screen, StyleRule, TfuiProject, UiNode } from "../model/types";
import { elementClassName, elementRuleSelectors } from "../model/elementStyle";
import {
  analyzeSelector,
  countRuleTargets,
  matchingRules,
  parseSelector,
  resolveStyles,
  resolveStylesWithOrigin,
  ruleMatchesNode,
  findAncestorChain,
  windowContentStyle,
} from "./cascade";

function node(
  id: string,
  type: string,
  opts?: Partial<UiNode>,
): UiNode {
  return {
    id,
    type,
    props: {},
    meta: {},
    slots: {},
    ...opts,
  };
}

function miniProject(
  root: UiNode,
  rules: TfuiProject["styleRules"],
): { project: TfuiProject; screen: Screen } {
  const screen: Screen = {
    id: "s1",
    fileBase: "main",
    recipeName: "MyWindow",
    kind: "window",
    state: [],
    root,
    previewViewport: { w: 1920, h: 1080 },
  };
  const project: TfuiProject = {
    schemaVersion: 1,
    mod: { modId: "m", modRoot: "mod", guiDir: "gui" },
    screens: [screen],
    styleRules: rules,
    catalogHash: "",
  };
  return { project, screen };
}

describe("cascade", () => {
  it("parseSelector découpe R:: / type / !classe", () => {
    expect(parseSelector("R::MyWindow BoxLayout!my-root")).toEqual([
      [{ kind: "recipe", name: "MyWindow" }],
      [
        { kind: "type", name: "BoxLayout" },
        { kind: "class", name: "my-root" },
      ],
    ]);
    // Comme stylesheetutil.lua : un espace = un niveau descendant.
    expect(parseSelector("BoxLayout !my-root")).toEqual([
      [{ kind: "type", name: "BoxLayout" }],
      [{ kind: "class", name: "my-root" }],
    ]);
  });

  it("match type + classe ; R:: d’une recette non-fenêtre (plugin)", () => {
    const box = node("b1", "BoxLayout", { meta: { class: ["my-root"] } });
    const root = node("w1", "Window", {
      slots: { content: [box] },
    });
    const { project, screen } = miniProject(root, [
      {
        id: "r1",
        selector: "BoxLayout!my-root",
        props: { innerSpacing: [12, 10] },
      },
    ]);
    const chain = findAncestorChain(root, "b1")!;
    expect(ruleMatchesNode(project.styleRules[0], screen, box, chain)).toBe(
      true,
    );
    expect(matchingRules(project, screen, box)).toHaveLength(1);
    expect(resolveStyles(project, screen, box).innerSpacing).toEqual([12, 10]);

    // Plugin : la recette est au-dessus de sa racine.
    const pluginRoot = node("p1", "BoxLayout", { meta: { class: ["bar"] } });
    const plugin = { ...screen, id: "s2", kind: "plugin" as const, recipeName: "MyPlugin", root: pluginRoot };
    const pluginRule = { id: "r2", selector: "R::MyPlugin BoxLayout!bar", props: {} };
    expect(ruleMatchesNode(pluginRule, plugin, pluginRoot, [pluginRoot])).toBe(true);
  });

  it("R::<fenêtre wrapper> ne touche rien (comme en jeu)", () => {
    const box = node("b1", "BoxLayout", { meta: { class: ["my-root"] } });
    const root = node("w1", "Window", { slots: { content: [box] } });
    const { project, screen } = miniProject(root, [
      { id: "r1", selector: "R::MyWindow BoxLayout!my-root", props: { innerSpacing: [1, 1] } },
    ]);
    expect(matchingRules(project, screen, box)).toHaveLength(0);
  });

  it("modifier innerSpacing d’une règle change resolveStyles", () => {
    const box = node("b1", "BoxLayout", { meta: { class: ["c"] } });
    const root = node("w1", "Window", { slots: { content: [box] } });
    const { project, screen } = miniProject(root, [
      {
        id: "r1",
        selector: "BoxLayout!c",
        props: { innerSpacing: [4, 4] },
      },
    ]);
    expect(resolveStyles(project, screen, box).innerSpacing).toEqual([4, 4]);
    project.styleRules[0] = {
      ...project.styleRules[0],
      props: { innerSpacing: [20, 8] },
    };
    expect(resolveStyles(project, screen, box).innerSpacing).toEqual([20, 8]);
  });

  it("analyzeSelector sépare l’état et repère la syntaxe non simulée", () => {
    expect(analyzeSelector("R::X !a:hover")).toMatchObject({
      base: "R::X !a",
      state: "hover",
      simulated: true,
    });
    expect(analyzeSelector("Window#menu.x").simulated).toBe(false);
    expect(analyzeSelector("List::Item").simulated).toBe(false);
    expect(analyzeSelector("R::X > FlowLayout").simulated).toBe(false);
    expect(analyzeSelector("Button:focus").simulated).toBe(false);
  });

  it("une règle d’état ne s’applique qu’à cet état", () => {
    const box = node("b1", "BoxLayout", { meta: { class: ["c"] } });
    const root = node("w1", "Window", { slots: { content: [box] } });
    const { project, screen } = miniProject(root, [
      { id: "r1", selector: "BoxLayout!c", props: { innerSpacing: [1, 1] } },
      { id: "r2", selector: "BoxLayout!c:hover", props: { innerSpacing: [5, 5] } },
      { id: "r3", selector: "Window#id BoxLayout", props: { innerSpacing: [9, 9] } },
    ]);
    expect(resolveStyles(project, screen, box).innerSpacing).toEqual([1, 1]);
    expect(resolveStyles(project, screen, box, "hover").innerSpacing).toEqual([5, 5]);
  });

  it("la règle de l’élément l’emporte et donne sa provenance", () => {
    const box = node("b1", "BoxLayout");
    const root = node("w1", "Window", { slots: { content: [box] } });
    const { project, screen } = miniProject(root, [
      { id: "shared", selector: "BoxLayout", props: { innerSpacing: [2, 2], padding: [1, 1, 1, 1] } },
      { id: "own", selector: "", ownerNodeId: "b1", props: { innerSpacing: [7, 7] } },
    ]);
    const r = resolveStylesWithOrigin(project, screen, box);
    expect(r.values.innerSpacing).toEqual([7, 7]);
    expect(r.origins.innerSpacing).toMatchObject({ kind: "element" });
    expect(r.origins.padding).toMatchObject({ kind: "shared", ruleId: "shared" });
    expect(matchingRules(project, screen, box).map((x) => x.id)).toEqual(["shared"]);
  });

  it("un espace avant la classe vise un descendant, pas l’élément", () => {
    const box = node("b1", "BoxLayout", { meta: { class: ["c"] } });
    const inner = node("t1", "TextView", { meta: { class: ["c"] } });
    box.slots = { children: [inner] };
    const root = node("w1", "Window", { slots: { content: [box] } });
    const { project, screen } = miniProject(root, [
      { id: "r1", selector: "BoxLayout !c", props: { innerSpacing: [3, 3] } },
    ]);
    expect(resolveStyles(project, screen, box).innerSpacing).toBeUndefined();
    expect(resolveStyles(project, screen, inner).innerSpacing).toEqual([3, 3]);
  });

  it("fenêtre : R::Recette !x ne vise pas la Window ; Window!x!window-expanded oui", () => {
    const win = node("w1", "Window", {
      props: { expanded: { kind: "literal", value: true } },
      meta: { class: ["my-win"] },
    });
    const { project, screen } = miniProject(win, [
      { id: "bad", selector: "R::MyWindow !window-expanded", props: { size: [1, 1] } },
      { id: "good", selector: "Window!my-win!window-expanded", props: { size: [720, 420] } },
    ]);
    expect(matchingRules(project, screen, win).map((r) => r.id)).toEqual(["good"]);
    expect(resolveStyles(project, screen, win).size).toEqual([720, 420]);
  });

  it("inlineStyle écrase la cascade", () => {
    const box = node("b1", "BoxLayout", {
      meta: { class: ["c"], inlineStyle: { innerSpacing: [1, 1] } },
    });
    const root = node("w1", "Window", { slots: { content: [box] } });
    const { project, screen } = miniProject(root, [
      {
        id: "r1",
        selector: "BoxLayout",
        props: { innerSpacing: [9, 9] },
      },
    ]);
    expect(resolveStyles(project, screen, box).innerSpacing).toEqual([1, 1]);
  });
});

describe("styles de base du jeu dans la cascade", () => {
  it("s’appliquent en premier, avec la provenance « jeu », sous les règles du projet", () => {
    const bar = node("p", "ProgressBar", { meta: { class: ["thin"] } });
    const { project, screen } = miniProject(node("w", "Window", { slots: { content: [bar] } }), [
      { id: "r", selector: "ProgressBar!thin", props: { size: [-1, 8] } },
    ]);
    setActiveBaseStyles({
      extractedAt: "",
      rules: [testRule("ProgressBar", { size: [-1, 20], color: [0, 0, 1, 1] }, 1)],
    });
    try {
      const r = resolveStylesWithOrigin(project, screen, bar);
      expect(r.values.size).toEqual([-1, 8]);
      expect(r.origins.size?.kind).toBe("shared");
      expect((r.values as Record<string, unknown>).color).toEqual([0, 0, 1, 1]);
      expect(r.origins.color).toEqual({
        kind: "game",
        file: "gui/main/builtin.css.lua",
        selector: "ProgressBar",
        state: null,
      });
    } finally {
      setActiveBaseStyles(null);
    }
  });

  describe("sous-partie Window::Content", () => {
    it("analyzeSelector simule seulement `<fenêtre> Window::Content`", () => {
      expect(analyzeSelector("Window!w Window::Content")).toMatchObject({
        simulated: true,
        part: "Window::Content",
        prefix: "Window!w",
      });
      expect(analyzeSelector("Window!w Button::Layout").simulated).toBe(false);
      expect(analyzeSelector("Window::Content").simulated).toBe(false);
      expect(analyzeSelector("Window#id Window::Content").simulated).toBe(false);
    });

    it("le padding va à la zone de contenu, jamais à la Window (barre de titre)", () => {
      const root = node("w1", "Window", { meta: { class: ["w"] } });
      const rule: StyleRule = { id: "r1", selector: "Window!w Window::Content", props: { padding: [8, 8, 8, 8] } };
      const { project, screen } = miniProject(root, [rule]);
      expect(resolveStyles(project, screen, root).padding).toBeUndefined();
      expect(windowContentStyle(project, screen, root)).toEqual({ padding: [8, 8, 8, 8] });
      expect(countRuleTargets(project, rule)).toEqual(["w1"]);
    });

    it("une autre classe de fenêtre ne reçoit rien", () => {
      const root = node("w1", "Window", { meta: { class: ["autre"] } });
      const rule: StyleRule = { id: "r1", selector: "Window!w Window::Content", props: { padding: [8, 8, 8, 8] } };
      const { project, screen } = miniProject(root, [rule]);
      expect(windowContentStyle(project, screen, root)).toEqual({});
      expect(countRuleTargets(project, rule)).toEqual([]);
    });
  });
});

describe("Component visé par R::Component (constaté en jeu)", () => {
  it("R::Component!x s’applique, Component!x ne vise rien ; le style par élément émet la forme R::", () => {
    const comp = node("c1", "Component", { meta: { class: ["card"] } });
    const root = node("w", "Window", { slots: { content: [comp] } });
    const { project, screen } = miniProject(root, [
      { id: "r1", selector: "Component!card", props: { padding: [1, 1, 1, 1] } },
      { id: "r2", selector: "R::Component!card", props: { margin: [2, 2, 2, 2] } },
    ]);
    const styles = resolveStyles(project, screen, comp);
    expect(styles.padding).toBeUndefined();
    expect(styles.margin).toEqual([2, 2, 2, 2]);
    expect(elementRuleSelectors(screen, "c1")).toEqual([`R::Component!${elementClassName("c1")}`]);
  });
});

