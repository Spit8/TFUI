import { describe, expect, it } from "vitest";
import {
  asVector,
  formatStyleValue,
  hasDedicatedEditor,
  initialStyleValue,
  isPreviewedStyleKey,
  parseStyleValue,
  SCALAR_STYLE_SPECS,
  STYLE_KEY_SPECS,
  styleKeyHint,
  styleKeyLabel,
} from "./styleValue";

describe("parseStyleValue", () => {
  it("lit tableaux, nombres, booléens et chaînes", () => {
    expect(parseStyleValue("{1, 2}")).toEqual([1, 2]);
    expect(parseStyleValue("0.5, 0.5, 1, 1")).toEqual([0.5, 0.5, 1, 1]);
    expect(parseStyleValue("12")).toBe(12);
    expect(parseStyleValue("true")).toBe(true);
    expect(parseStyleValue('"Center"')).toBe("Center");
    expect(parseStyleValue("Center")).toBe("Center");
    expect(parseStyleValue("  ")).toBeUndefined();
  });

  it("aller-retour avec formatStyleValue", () => {
    for (const v of [[1, 2], 3, true, "x"] as const) {
      expect(parseStyleValue(formatStyleValue(v))).toEqual(v);
    }
  });
});

describe("asVector", () => {
  it("complète ou refuse", () => {
    expect(asVector([1], 2)).toEqual([1, 0]);
    expect(asVector("x", 2)).toBeNull();
  });
});

describe("propriétés à éditeur dédié", () => {
  it("valeurs proposées à l’ajout (formes relevées dans le vanilla)", () => {
    expect(initialStyleValue("textAlignment")).toEqual([0.5, 0.5]);
    expect(initialStyleValue("borderWidth")).toEqual([1, 1, 1, 1]);
    expect(initialStyleValue("fontSize")).toBe(14);
    expect(initialStyleValue("textAutoWrap")).toBe(true);
    expect(initialStyleValue("visibility")).toBe("visible");
    expect(initialStyleValue("transform")).toBeUndefined();
  });

  it("chaque clé dédiée a un libellé et une aide traduits", () => {
    for (const k of [...Object.keys(STYLE_KEY_SPECS), ...Object.keys(SCALAR_STYLE_SPECS)]) {
      expect(hasDedicatedEditor(k)).toBe(true);
      expect(styleKeyHint(k), k).toBeTruthy();
    }
    expect(styleKeyLabel("textAlignment")).toBeTruthy();
    expect(isPreviewedStyleKey("textAlignment")).toBe(true);
    expect(isPreviewedStyleKey("anchorPoint")).toBe(false);
  });
});
