import { describe, expect, it } from "vitest";
import { setActiveBaseStyles } from "../gamestyle/activeBaseStyles";
import type { StyleProps } from "../model/types";
import { stylePropsToCss } from "./styleToCss";

const css = (s: Record<string, unknown>) => stylePropsToCss(s as unknown as StyleProps);

describe("styles TF3 → CSS de l’aperçu", () => {
  it("size : -1 libre, chaînes relatives à l’écran", () => {
    expect(css({ size: [-1, 20] })).toMatchObject({ height: 20 });
    expect(css({ size: [-1, 20] }).width).toBeUndefined();
    expect(css({ size: ["75vw", "75vh"] })).toMatchObject({ width: "75vw", height: "75vh" });
  });

  it("minSize et police", () => {
    expect(css({ minSize: [-1, 24] })).toMatchObject({ minHeight: 24 });
    expect(css({ fontSize: 17, fontWeight: "Medium" })).toMatchObject({ fontSize: 17, fontWeight: 500 });
  });

  it("fond transparent posé avec une image 9-patch : rendu du thème conservé", () => {
    expect(css({ backgroundColor1: [0, 0, 0, 0], backgroundImage1: { fileName: "x.tga" } }).backgroundColor).toBeUndefined();
    expect(css({ backgroundColor1: [0, 0, 0, 0.5], backgroundImage1: { fileName: "x.tga" } }).backgroundColor).toBe(
      "rgba(0, 0, 0, 0.5)",
    );
  });

  it("contour visible seulement si opaque", () => {
    expect(css({ borderColor: [0, 0, 0, 0] }).boxShadow).toBeUndefined();
    expect(css({ borderColor: [1, 0, 0, 1] }).boxShadow).toBe("inset 0 0 0 1px rgba(255, 0, 0, 1)");
  });

  it("résout une couleur de la palette du jeu (et sa transparence)", () => {
    setActiveBaseStyles({
      extractedAt: "",
      rules: [],
      palette: { colors: [{ name: "AccentMedium", rgba: [0, 0.5, 1, 1] }], transparency: [] },
    });
    try {
      expect(css({ color: { kind: "palette", name: "AccentMedium" } }).color).toBe("rgba(0, 128, 255, 1)");
      expect(css({ backgroundColor1: { kind: "palette", name: "AccentMedium", alpha: 0.5 } }).backgroundColor).toBe(
        "rgba(0, 128, 255, 0.5)",
      );
      expect(css({ color: { kind: "palette", name: "Inconnue" } }).color).toBe("rgba(128, 128, 128, 1)");
    } finally {
      setActiveBaseStyles(null);
    }
  });
});
