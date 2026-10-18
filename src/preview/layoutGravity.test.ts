import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setActiveBaseStyles } from "../gamestyle/activeBaseStyles";
import { testRule } from "../gamestyle/testRules";
import type { Screen, TfuiProject, UiNode } from "../model/types";
import {
  alignForGravity,
  DEFAULT_GRAVITY,
  effectiveGravity,
  expandsOnAxis,
  overflowForPolicy,
  scrollPolicies,
  shrinksOnAxis,
} from "./layoutGravity";

function node(id: string, type: string, slots: Record<string, UiNode[]> = {}, meta = {}): UiNode {
  return { id, type, props: {}, meta, slots };
}

function setup(root: UiNode, styleRules: TfuiProject["styleRules"] = []) {
  const screen: Screen = {
    id: "s",
    fileBase: "main",
    recipeName: "W",
    kind: "window",
    state: [],
    root,
    previewViewport: { w: 1920, h: 1080 },
  };
  const project: TfuiProject = {
    schemaVersion: 1,
    mod: { modId: "m", modRoot: "mod", guiDir: "gui" },
    screens: [screen],
    styleRules,
    catalogHash: "",
  };
  return { project, screen };
}

describe("gravity / étirement", () => {
  // Valeurs de builtin.css.lua (vanilla), en règles de test.
  beforeAll(() =>
    setActiveBaseStyles({
      extractedAt: "",
      rules: [
        testRule("Button", { gravity: [0, 0.5] }, 1),
        testRule("ProgressBar", { size: [-1, 20], gravity: [-1, -1] }, 2),
        testRule("Slider!horizontal", { size: [-1, 16], gravity: [-1, 0.5] }, 3),
        testRule("Slider!vertical", { size: [16, -1], gravity: [0.5, -1] }, 4),
        testRule("!horizontal-spacer", { gravity: [-1, 0] }, 5, "gui/main/default.css.lua"),
      ],
    }),
  );
  afterAll(() => setActiveBaseStyles(null));

  it("une ProgressBar s’étire (défaut builtin.css.lua) et étire sa BoxLayout", () => {
    const bar = node("p", "ProgressBar");
    const row = node("r", "BoxLayout", { children: [node("t", "TextView"), bar] });
    const { project, screen } = setup(node("w", "Window", { content: [row] }));
    expect(effectiveGravity(project, screen, bar)).toEqual([-1, -1]);
    expect(expandsOnAxis(project, screen, row, 1)).toBe(true);
  });

  it("sans élément étirable, la BoxLayout ne s’étire pas", () => {
    const row = node("r", "BoxLayout", { children: [node("t", "TextView"), node("b", "Button")] });
    const { project, screen } = setup(node("w", "Window", { content: [row] }));
    expect(expandsOnAxis(project, screen, row, 0)).toBe(false);
    expect(expandsOnAxis(project, screen, row, 1)).toBe(false);
  });

  it("une BoxLayout vide ignore sa gravity (constaté en jeu)", () => {
    const empty = node("e", "BoxLayout", {}, { class: ["spacer"] });
    const filled = node("f", "BoxLayout", { children: [node("t", "TextView")] }, { class: ["spacer"] });
    const { project, screen } = setup(node("w", "Window", { content: [empty, filled] }), [
      { id: "r", selector: "BoxLayout!spacer", props: { gravity: [-1, -1] } },
    ]);
    expect(expandsOnAxis(project, screen, empty, 0)).toBe(false);
    expect(expandsOnAxis(project, screen, empty, 1)).toBe(false);
    expect(expandsOnAxis(project, screen, filled, 1)).toBe(true);
  });

  it("un espaceur vanilla (Component !horizontal-spacer, vide) s’étire en largeur", () => {
    const spacer = node("sp", "Component", { layout: [] }, { class: ["horizontal-spacer"] });
    const row = node("r", "BoxLayout", { children: [node("t", "TextView"), spacer, node("b", "Button")] });
    const { project, screen } = setup(node("w", "Window", { content: [row] }));
    expect(expandsOnAxis(project, screen, spacer, 0)).toBe(true);
    expect(expandsOnAxis(project, screen, spacer, 1)).toBe(false);
  });

  it("une gravity posée sur le conteneur l’emporte sur l’étirement de ses enfants (constaté en jeu)", () => {
    const scroll = node("s", "ScrollArea", { content: [] }, { class: ["fill"] });
    const side = node("side", "BoxLayout", { children: [scroll] }, { class: ["side"] });
    const free = node("free", "BoxLayout", { children: [node("s2", "ScrollArea", { content: [] }, { class: ["fill"] })] });
    const { project, screen } = setup(node("w", "Window", { content: [node("r", "BoxLayout", { children: [side, free] })] }), [
      { id: "a", selector: "ScrollArea!fill", props: { gravity: [-1, -1] } },
      { id: "b", selector: "BoxLayout!side", props: { gravity: [0, -1] } },
    ]);
    expect(expandsOnAxis(project, screen, side, 0)).toBe(false);
    expect(expandsOnAxis(project, screen, side, 1)).toBe(true);
    expect(expandsOnAxis(project, screen, free, 0)).toBe(true);
  });

  it("une taille fixée sur un axe empêche l’étirement sur cet axe (constaté en jeu)", () => {
    const bar = node("p", "ProgressBar", {}, { class: ["small"] });
    const { project, screen } = setup(node("w", "Window", { content: [node("r", "BoxLayout", { children: [bar] })] }), [
      { id: "s", selector: "ProgressBar!small", props: { size: [80, -1] } },
    ]);
    expect(expandsOnAxis(project, screen, bar, 0)).toBe(false);
    expect(expandsOnAxis(project, screen, bar, 1)).toBe(true);
  });

  it("le contenu d’un onglet remplit l’onglet ; la layout d’un Component ne le remplit que si ses enfants s’étirent (constaté en jeu)", () => {
    const inner = node("in", "BoxLayout", { children: [node("t", "TextView")] });
    const item = node("item", "Component", { layout: [inner] });
    const tab = node("tab", "TabWidgetChild", { item: [item], indicator: [node("i", "TextView")] });
    const tabs = node("tabs", "TabWidget", { tabs: [tab] });
    const stretchy = node("st", "BoxLayout", { children: [node("in2", "TextInputField")] });
    const card = node("card", "Component", { layout: [stretchy] });
    const row = node("r", "BoxLayout", { children: [tabs, card] });
    const { project, screen } = setup(node("w", "Window", { content: [row] }));
    expect(expandsOnAxis(project, screen, item, 0)).toBe(true);
    expect(expandsOnAxis(project, screen, item, 1)).toBe(true);
    // Sans enfant étiré, la BoxLayout garde sa taille naturelle dans son Component.
    expect(expandsOnAxis(project, screen, inner, 1)).toBe(false);
    // Avec un TextInputField (étiré par le moteur), elle s’étire, et le Component aussi.
    expect(expandsOnAxis(project, screen, stretchy, 1)).toBe(true);
    expect(expandsOnAxis(project, screen, card, 1)).toBe(true);
  });

  it("une gravity CSS l’emporte sur le défaut", () => {
    const bar = node("p", "ProgressBar", {}, { class: ["thin"] });
    const { project, screen } = setup(node("w", "Window", { content: [bar] }), [
      { id: "r", selector: "ProgressBar!thin", props: { gravity: [0, 0.5] } },
    ]);
    expect(effectiveGravity(project, screen, bar)).toEqual([0, 0.5]);
  });

  it("Slider horizontal s’étire en largeur, TextInputField sur les deux axes (constaté en jeu)", () => {
    const slider = node("s", "Slider");
    const input = node("i", "TextInputField");
    const { project, screen } = setup(node("w", "Window", { content: [node("b", "BoxLayout", { children: [slider, input] })] }));
    expect(expandsOnAxis(project, screen, slider, 0)).toBe(true);
    expect(expandsOnAxis(project, screen, slider, 1)).toBe(false);
    expect(expandsOnAxis(project, screen, input, 0)).toBe(true);
    expect(expandsOnAxis(project, screen, input, 1)).toBe(true);
    const vertical = { ...node("v", "Slider"), props: { horizontal: { kind: "literal" as const, value: false } } };
    const v = setup(node("w", "Window", { content: [vertical] }));
    expect(effectiveGravity(v.project, v.screen, vertical)).toEqual([0.5, -1]);
  });

  it("TextView centré en hauteur sans étirer sa BoxLayout (constaté en jeu)", () => {
    const text = node("t", "TextView");
    const row = node("r", "BoxLayout", { children: [text] });
    const { project, screen } = setup(node("w", "Window", { content: [row] }));
    expect(effectiveGravity(project, screen, text)).toEqual([0, 0.5]);
    expect(expandsOnAxis(project, screen, row, 1)).toBe(false);
  });

  it("aligne selon 0 / 0.5 / 1", () => {
    expect(alignForGravity(0)).toBe("flex-start");
    expect(alignForGravity(0.5)).toBe("center");
    expect(alignForGravity(1)).toBe("flex-end");
  });
});

describe("conteneurs défilants (List, ScrollArea)", () => {
  it("une List s’étire et peut descendre sous la taille de son contenu", () => {
    const list = node("l", "List", { children: [node("t1", "TextView"), node("t2", "TextView")] });
    const box = node("b", "BoxLayout", { children: [node("t", "TextView"), list] });
    const { project, screen } = setup(node("w", "Window", { content: [box] }));
    expect(effectiveGravity(project, screen, list)).toEqual([-1, -1]);
    expect(shrinksOnAxis(project, screen, list, 1)).toBe(true);
    // Le layout qui la contient cède la place manquante à la List…
    expect(shrinksOnAxis(project, screen, box, 1)).toBe(true);
    // … un layout sans zone défilante, jamais.
    const plain = node("p", "BoxLayout", { children: [node("t3", "TextView")] });
    expect(shrinksOnAxis(project, screen, plain, 1)).toBe(false);
    expect(shrinksOnAxis(project, screen, node("x", "TextView"), 1)).toBe(false);
  });

  it("politiques de défilement : défaut AsNeeded, enum et AlwaysOff", () => {
    expect(scrollPolicies(node("l", "List"))).toEqual({ x: "AsNeeded", y: "AsNeeded" });
    const off: UiNode = {
      ...node("l2", "List"),
      props: { verticalScrollBarPolicy: { kind: "enum", value: "ScrollBarPolicy.AlwaysOff" } },
    };
    expect(scrollPolicies(off)).toEqual({ x: "AsNeeded", y: "AlwaysOff" });
    const area: UiNode = {
      ...node("s", "ScrollArea"),
      props: { horizontalPolicy: { kind: "lua", code: "builtin.type.ScrollBarPolicy.AlwaysOn" } },
    };
    expect(scrollPolicies(area)?.x).toBe("AlwaysOn");
    expect(scrollPolicies(node("b", "BoxLayout"))).toBeNull();
    expect(overflowForPolicy("AlwaysOff")).toBe("hidden");
    expect(overflowForPolicy("AlwaysOn")).toBe("scroll");
    expect(overflowForPolicy("AsNeededButAlwaysReserveSpace")).toBe("auto");
    // AlwaysOff rogne aussi : la List reste réductible.
    const { project, screen } = setup(node("w", "Window", { content: [off] }));
    expect(shrinksOnAxis(project, screen, off, 1)).toBe(true);
  });
});

describe("gravity par défaut", () => {
  it("un élément sans règle est à gauche et centré en hauteur dans sa box", () => {
    const box = node("b", "BoxLayout");
    const { project, screen } = setup(node("w", "Window", { content: [node("r", "BoxLayout", { children: [box] })] }));
    expect(effectiveGravity(project, screen, box)).toEqual(DEFAULT_GRAVITY);
    expect(DEFAULT_GRAVITY).toEqual([0, 0.5]);
  });
});
