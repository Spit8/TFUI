import { describe, expect, it } from "vitest";
import { testRule } from "../gamestyle/testRules";
import { cacheRel, fingerprintKey, gameImageCandidates, gameImageFiles, styleImageFiles } from "./gameCache";

describe("cache des ressources du jeu", () => {
  it("empreinte : indépendante de l’ordre, sensible à la taille et à la date", () => {
    const a = [
      { path: "gui.zip", size: 10, modifiedMs: 1 },
      { path: "TransportFever3.exe", size: 5, modifiedMs: 2 },
    ];
    expect(fingerprintKey(a)).toBe(fingerprintKey([...a].reverse()));
    expect(fingerprintKey(a)).not.toBe(fingerprintKey([{ ...a[0]!, modifiedMs: 3 }, a[1]!]));
  });

  it("images : seulement celles citées par les styles, plus les icônes du moteur", () => {
    const styles = {
      extractedAt: "",
      rules: [
        testRule("Window", {
          backgroundImage1: { fileName: "::/gui/builtin/window/design/surface.tga", vertical: [0, 1, 2, 3] },
          shadowNinePatch: { fileName: "::/gui/builtin/window/design/shadow.tga" },
        }),
        testRule("Button", { borderImage: { fileName: "" }, soundOnEnter: ["hover.wav"] }),
      ],
    };
    expect(styleImageFiles(styles)).toEqual([
      "::/gui/builtin/window/design/shadow.tga",
      "::/gui/builtin/window/design/surface.tga",
    ]);
    expect(gameImageFiles(styles)).toContain("::/gui/builtin/window/icons/symbol_close_18.tga");
    expect(gameImageFiles(null)).toEqual(["::/gui/builtin/window/icons/symbol_close_18.tga"]);
  });

  it("archive et chemin dans le cache", () => {
    const [hi] = gameImageCandidates("::/gui/builtin/x.tga");
    expect(hi).toEqual({ zip: "gui.zip", entry: "gui/builtin/x@2x.tga", scale: 2 });
    expect(cacheRel(hi!)).toBe("gui.zip/gui/builtin/x@2x.tga");
  });
});
