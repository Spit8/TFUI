import { describe, expect, it } from "vitest";
import { createModScaffoldProject } from "../model/modProject";
import type { TfuiProject } from "../model/types";
import { suggestSelectorFix } from "./selectorFix";

function withRules(selectors: string[]): TfuiProject {
  const p = createModScaffoldProject({ modId: "demo_mod", displayName: "Demo" });
  return {
    ...p,
    styleRules: selectors.map((selector, i) => ({ id: `r${i}`, selector, props: {} })),
  };
}

describe("suggestSelectorFix (espace avant la classe)", () => {
  it("colle la classe au type et retire R::<fenêtre>", () => {
    const p = withRules([
      "R::DemoModMainWindow BoxLayout !my-root",
      "R::DemoModMainWindow BoxLayout!my-root",
    ]);
    expect(suggestSelectorFix(p, p.styleRules[0]!)).toBe("BoxLayout!my-root");
    expect(suggestSelectorFix(p, p.styleRules[1]!)).toBe("BoxLayout!my-root");
  });

  it("vise la fenêtre par sa classe pour !window-expanded", () => {
    const p = withRules(["R::DemoModMainWindow !window-expanded"]);
    expect(suggestSelectorFix(p, p.styleRules[0]!)).toBe("Window!demo-mod-main-window!window-expanded");
  });

  it("ne propose rien pour un sélecteur qui touche déjà un élément", () => {
    const p = withRules(["Window!demo-mod-main-window!window-expanded"]);
    expect(suggestSelectorFix(p, p.styleRules[0]!)).toBeNull();
  });
});
