import type { BaseStyleLevel, BaseStyleRule } from "./types";

/**
 * Règle de base construite à la main pour les tests purs (découpage simplifié
 * façon `stylesheetutil.lua` : espaces = niveaux, `>` final = enfant direct).
 * Les vraies règles ne viennent que de l’installation du jeu.
 */
export function testRule(
  selector: string,
  styleSheet: Record<string, unknown>,
  order = 0,
  file = "gui/main/builtin.css.lua",
): BaseStyleRule {
  const tokens = selector.replace(/\s*>/g, ">").trim().split(/\s+/);
  const levels = tokens.map((raw): BaseStyleLevel => {
    let token = raw;
    let childCombinator = 0;
    if (token.endsWith(">>")) {
      childCombinator = 2;
      token = token.slice(0, -2);
    } else if (token.endsWith(">")) {
      childCombinator = 1;
      token = token.slice(0, -1);
    }
    const level: BaseStyleLevel = { classList: [], pseudoClassList: [], childCombinator };
    const id = token.match(/^#([\w-]+)/);
    if (id) {
      level.id = id[1];
      token = token.slice(id[0].length);
    }
    const el = token.match(/^(R::\w+|\*|\w+(?:::\w+)?)/);
    if (el) {
      level.element = el[1];
      token = token.slice(el[0].length);
    }
    for (const m of token.matchAll(/([!:])([\w-]+)/g)) {
      (m[1] === "!" ? level.classList : level.pseudoClassList).push(m[2]!);
    }
    return level;
  });
  return { file, order, selector, levels, styleSheet };
}
