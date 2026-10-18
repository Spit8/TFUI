import { describe, expect, it } from "vitest";
import type { StyleVocabulary } from "../catalog/types";
import { createModScaffoldProject } from "./modProject";
import { createNode } from "./factory";
import { allowedKeysForRule, allowedStyleKeys, COMMON_STYLE_KEYS } from "./styleKeys";
import type { StyleRule, TfuiProject } from "./types";
import { validateProject } from "./validate";

/** Vocabulaire réduit, à la forme de celui extrait des .css.lua vanilla. */
const VOCAB: StyleVocabulary = {
  generatedAt: "",
  styleKeys: [],
  keysByElement: {
    TextView: ["color", "gravity", "textAlignment", "textAutoWrap"],
    BoxLayout: ["gravity", "innerSpacing", "outerSpacing", "size"],
    "Window::Content": ["gravity", "margin", "padding"],
  },
  classes: [],
  fontScaleClasses: [],
  scannedFiles: 0,
};

/** Projet de départ + une TextView et un BoxLayout de classe `c` dans le contenu. */
function project(rules: StyleRule[] = []): { p: TfuiProject; textId: string; boxId: string } {
  const p = createModScaffoldProject({ modId: "demo_mod", displayName: "Demo" });
  const win = p.screens.find((s) => s.kind === "window")!.root;
  const root = win.slots.content![0]!;
  const text = createNode("TextView");
  text.meta.class = ["c"];
  const box = createNode("BoxLayout");
  box.meta.class = ["c"];
  root.slots.children = [...(root.slots.children ?? []), text, box];
  p.styleRules.push(...rules);
  return { p, textId: text.id, boxId: box.id };
}

describe("propriétés de style autorisées (vanilla + socle)", () => {
  it("par type : vanilla, puis socle commun marqué « common »", () => {
    const text = allowedStyleKeys("TextView", VOCAB);
    expect(text.keys.get("textAlignment")).toBe("vanilla");
    expect(text.keys.get("padding")).toBe("common");
    const box = allowedStyleKeys("BoxLayout", VOCAB);
    expect(box.keys.has("textAlignment")).toBe(false);
    expect(box.keys.get("innerSpacing")).toBe("vanilla");
    expect(box.keys.get("padding")).toBe("common");
    for (const k of COMMON_STYLE_KEYS) expect(box.keys.has(k)).toBe(true);
  });

  it("composant utilitaire : aucune propriété", () => {
    const r = allowedStyleKeys("TextButton", VOCAB);
    expect(r.limitation).toBe("helper");
    expect(r.keys.size).toBe(0);
  });

  it("sans vocabulaire par élément : socle seul, re-scan demandé", () => {
    const r = allowedStyleKeys("TextView", { ...VOCAB, keysByElement: undefined });
    expect(r.limitation).toBe("noVocabulary");
    expect([...r.keys.keys()].sort()).toEqual([...COMMON_STYLE_KEYS].sort());
  });

  it("classe partagée : intersection des types touchés, sinon type du sélecteur, sinon socle", () => {
    const { p } = project();
    const both = allowedKeysForRule(p, { id: "r", selector: "!c", props: {} }, VOCAB);
    expect(both.elements).toEqual(["BoxLayout", "TextView"]);
    expect(both.keys.has("textAlignment")).toBe(false);
    expect(both.keys.get("gravity")).toBe("vanilla");
    expect(both.keys.get("size")).toBe("common");

    const typed = allowedKeysForRule(p, { id: "r", selector: "TextView!absente", props: {} }, VOCAB);
    expect(typed.keys.has("textAlignment")).toBe(true);

    const bare = allowedKeysForRule(p, { id: "r", selector: "!absente", props: {} }, VOCAB);
    expect([...bare.keys.keys()].sort()).toEqual([...COMMON_STYLE_KEYS].sort());

    const content = allowedKeysForRule(
      p,
      { id: "r", selector: "Window!demo-mod-main-window Window::Content", props: {} },
      VOCAB,
    );
    expect(content.elements).toEqual(["Window::Content"]);
    expect(content.keys.get("padding")).toBe("vanilla");
  });

  it("règle d’élément : type du nœud", () => {
    const { p, boxId } = project();
    const r = allowedKeysForRule(p, { id: "r", selector: "", ownerNodeId: boxId, props: {} }, VOCAB);
    expect(r.elements).toEqual(["BoxLayout"]);
  });

  it("validateur : avertit d’une propriété non autorisée, pas des règles du projet de départ", () => {
    expect(validateProject(project().p, null, VOCAB).filter((i) => i.code === "style_key_not_allowed")).toEqual([]);

    const { p, boxId } = project();
    p.styleRules.push({ id: "e", selector: "", ownerNodeId: boxId, props: { textAlignment: [0.5, 0.5] } });
    const issues = validateProject(p, null, VOCAB).filter((i) => i.code === "style_key_not_allowed");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "warning", nodeId: boxId });
    expect(issues[0]!.message).toContain("textAlignment");

    // Sans vocabulaire par élément (ancien cache) : rien n’est signalé.
    expect(
      validateProject(p, null, { ...VOCAB, keysByElement: undefined }).filter((i) => i.code === "style_key_not_allowed"),
    ).toEqual([]);
  });
});
