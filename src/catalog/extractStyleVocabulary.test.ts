import { describe, expect, it } from "vitest";
import {
  buildStyleVocabulary,
  extractFromCssLua,
  parseCssLuaRules,
  selectorElement,
} from "./extractStyleVocabulary";

const SHEET = `local ssu = require "::/gui/main/stylesheetutil.lua"
function data()
	local result = {}
	local a = ssu.makeAdder(result)
	-- a("Commentaire", { ignored = 1 })
	a("TextView!titre", {
		textAlignment = { 0.5, 0.5 },
		backgroundImage1 = {
			fileName = "::/gui/x.tga",
			horizontal = { 0, 1, 2, 3 },
		},
		color = colorDefault.Accent, -- couleur
	})
	a([[Button!a:hover,
		R::MaFenetre !libre,
		Window!w Window::Content]], {
		padding = { 8, 8, 8, 8 },
	})
	a("!seule", { size = { 1, 2 } })
	return result
end
`;

describe("extractStyleVocabulary", () => {
  it("ne garde que les clés de premier niveau de la table de chaque règle", () => {
    const rules = parseCssLuaRules(SHEET);
    expect(rules).toHaveLength(3);
    expect(rules[0]).toEqual({
      selector: "TextView!titre",
      keys: ["textAlignment", "backgroundImage1", "color"],
    });
    const { keys } = extractFromCssLua(SHEET);
    // Champs de 9-patch imbriqués, variables Lua et commentaires : ignorés.
    for (const k of ["fileName", "horizontal", "result", "ignored"]) expect(keys.has(k)).toBe(false);
  });

  it("attribue les clés à l’élément du dernier niveau (sous-partie comprise)", () => {
    const { keysByElement, classes } = extractFromCssLua(SHEET);
    expect([...keysByElement.get("TextView")!]).toEqual(["textAlignment", "backgroundImage1", "color"]);
    expect([...keysByElement.get("Button")!]).toEqual(["padding"]);
    expect([...keysByElement.get("Window::Content")!]).toEqual(["padding"]);
    // `!libre` et `!seule` ne visent aucun élément.
    expect(keysByElement.has("R::MaFenetre")).toBe(false);
    expect([...keysByElement.keys()].sort()).toEqual(["Button", "TextView", "Window::Content"]);
    expect(classes.has("!seule")).toBe(true);
  });

  it("selectorElement : type, sous-partie, rien pour une classe / recette / id", () => {
    expect(selectorElement("R::X BoxLayout!a:hover")).toBe("BoxLayout");
    expect(selectorElement("Window!w Window::Content")).toBe("Window::Content");
    expect(selectorElement("R::X > TextView")).toBe("TextView");
    expect(selectorElement("Button !a")).toBeNull();
    expect(selectorElement("R::MaRecette")).toBeNull();
    expect(selectorElement("R::Panel R::Component!card:hover")).toBe("Component");
    expect(selectorElement("#menu.x")).toBeNull();
  });

  it("agrège plusieurs fichiers", () => {
    const vocab = buildStyleVocabulary([
      { path: "a", content: 'a("BoxLayout!x", { size = {1,2} })' },
      { path: "b", content: 'a("BoxLayout", { innerSpacing = {1,2} }) -- !bar font-scale-title' },
    ]);
    expect(vocab.styleKeys).toEqual(["innerSpacing", "size"]);
    expect(vocab.keysByElement).toEqual({ BoxLayout: ["innerSpacing", "size"] });
    expect(vocab.classes).toContain("!bar");
    expect(vocab.fontScaleClasses).toContain("font-scale-title");
    expect(vocab.scannedFiles).toBe(2);
  });
});
