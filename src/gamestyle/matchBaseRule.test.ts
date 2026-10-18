import { describe, expect, it } from "vitest";
import type { Screen, UiNode } from "../model/types";
import { nodeClasses } from "../preview/cascade";
import { baseRuleMatches, indexBaseRules, matchingBaseRules, type MatchTarget } from "./matchBaseRule";
import { testRule } from "./testRules";

function node(id: string, type: string, meta: UiNode["meta"] = {}): UiNode {
  return { id, type, props: {}, meta, slots: {} };
}

function target(chain: UiNode[], state: MatchTarget["state"] = null, kind: Screen["kind"] = "window"): MatchTarget {
  const screen: Screen = { id: "s", fileBase: "f", recipeName: "Rec", kind, state: [], root: chain[0]!, previewViewport: { w: 1920, h: 1080 } };
  return { screen, chain, state };
}

const matches = (selector: string, t: MatchTarget) => baseRuleMatches(testRule(selector, {}), t, nodeClasses);

describe("règles de base du jeu ↔ arbre de l’aperçu", () => {
  const win = node("w", "Window");
  const box = node("b", "BoxLayout", { class: ["rows"] });
  const button = node("btn", "Button");
  const text = node("t", "TextView", { class: ["font-scale-body"] });

  it("type, `*` et classes du nœud", () => {
    expect(matches("TextView", target([win, box, text]))).toBe(true);
    expect(matches("*", target([win, box, text]))).toBe(true);
    expect(matches("Button", target([win, box, text]))).toBe(false);
    expect(matches("BoxLayout!rows", target([win, box]))).toBe(true);
    expect(matches("BoxLayout!cols", target([win, box]))).toBe(false);
  });

  it("descendant et enfant direct", () => {
    expect(matches("Window TextView", target([win, box, text]))).toBe(true);
    expect(matches("Window > TextView", target([win, box, text]))).toBe(false);
    expect(matches("BoxLayout > TextView", target([win, box, text]))).toBe(true);
  });

  it("sous-élément : `Button::Layout TextView` vise le texte d’un bouton, pas la partie elle-même", () => {
    expect(matches("Button::Layout TextView", target([win, button, text]))).toBe(true);
    expect(matches("Button::Layout > TextView", target([win, button, text]))).toBe(true);
    expect(matches("Button::Layout TextView", target([win, box, text]))).toBe(false);
    expect(matches("Button::Layout", target([win, button]))).toBe(false);
    // La barre de titre ne contient pas le contenu de la fenêtre.
    expect(matches("Window::TitleLayout Button", target([win, button]))).toBe(false);
  });

  it("pseudo-état : seulement sur le nœud, égal à l’état simulé", () => {
    expect(matches("Button:hover", target([win, button], "hover"))).toBe(true);
    expect(matches("Button:hover", target([win, button]))).toBe(false);
    expect(matches("Button", target([win, button], "hover"))).toBe(false);
    expect(matches("*:disabled TextView", target([win, box, text]))).toBe(false);
  });

  it("environnement : `!font-medium` au-dessus de la racine, pas `!input-controller`", () => {
    expect(matches("!font-medium !font-scale-body", target([win, text]))).toBe(true);
    expect(matches("!font-small !font-scale-body", target([win, text]))).toBe(false);
    expect(matches("!input-controller Button", target([win, button]))).toBe(false);
  });

  it("classe implicite du Slider et recette R::", () => {
    const slider = node("s", "Slider");
    expect(matches("Slider!horizontal", target([win, slider]))).toBe(true);
    expect(matches("R::Rec TextView", target([box, text], null, "recipe"))).toBe(true);
    expect(matches("R::Rec TextView", target([win, text]))).toBe(false);
  });

  it("l’index renvoie les règles dans l’ordre d’ajout", () => {
    const index = indexBaseRules([
      testRule("TextView", { color: [1, 0, 0, 1] }, 2),
      testRule("Button::Layout TextView", { color: [1, 1, 1, 1] }, 5),
      testRule("Button", {}, 1),
      testRule("*", {}, 0),
    ]);
    const got = matchingBaseRules(index, target([win, button, text]), nodeClasses);
    expect(got.map((r) => r.order)).toEqual([0, 2, 5]);
  });
});
