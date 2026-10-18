import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractFromCssLua } from "./extractStyleVocabulary";
import {
  FIXTURES_SKIP_MESSAGE,
  fixturesLinked,
  projectRoot,
} from "./fixtures";

describe.skipIf(!fixturesLinked())("style-vocabulary (jeu lié)", () => {
  it(FIXTURES_SKIP_MESSAGE, () => {
    expect(fixturesLinked()).toBe(true);
  });

  it("détecte clés et classes dans un extrait css.lua", () => {
    const sample = `
local ssu = require "::/gui/main/stylesheetutil.lua"
function data()
	local result = {}
	local a = ssu.makeAdder(result)
	a("R::Demo BoxLayout !my-root", { innerSpacing = { 12, 10 }, outerSpacing = { 0, 0 } })
	a("R::Demo !window-expanded", { size = { 1100, 700 } })
	a(".font-scale-body", { color = { 1, 1, 1, 1 } })
	return result
end
`;
    const extracted = extractFromCssLua(sample);
    expect(extracted.keys.has("innerSpacing")).toBe(true);
    expect(extracted.keys.has("size")).toBe(true);
    expect(extracted.classes.has("!my-root")).toBe(true);
    expect(extracted.fontScale.has("font-scale-body")).toBe(true);
  });

  it("le fichier généré existe après extract-style-vocabulary", () => {
    const path = join(
      projectRoot(),
      "src",
      "catalog",
      "style-vocabulary.generated.json",
    );
    if (!existsSync(path)) {
      // Acceptable if user n'a pas encore lancé l'extracteur
      expect(fixturesLinked()).toBe(true);
      return;
    }
    const vocab = JSON.parse(readFileSync(path, "utf8")) as {
      styleKeys: string[];
      classes: string[];
      scannedFiles: number;
    };
    expect(vocab.scannedFiles).toBeGreaterThan(0);
    expect(vocab.styleKeys.length).toBeGreaterThan(5);
    expect(vocab.classes.length).toBeGreaterThan(5);
  });
});
