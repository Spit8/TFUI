import type { StyleRule, TfuiProject } from "../model/types";
import { analyzeSelector, countRuleTargets } from "./cascade";

/**
 * Corrige l’erreur courante « espace avant la classe » quand une classe
 * partagée ne touche aucun élément :
 * - `BoxLayout !x`  → `BoxLayout!x` (le BoxLayout porte la classe) ;
 * - `R::<Fenêtre> !x` → `Window!x` ; pour `!window-expanded`, la classe
 *   propre de la fenêtre est ajoutée pour ne pas viser toutes les fenêtres ;
 * - `R::<Fenêtre> BoxLayout!x` → `BoxLayout!x` (`R::<fenêtre wrapper>` ne
 *   touche rien, voir cascade.ts).
 * Renvoie le sélecteur corrigé s’il touche au moins un élément, sinon null.
 */
export function suggestSelectorFix(
  project: TfuiProject,
  rule: StyleRule,
): string | null {
  if (rule.ownerNodeId) return null;
  const analysis = analyzeSelector(rule.selector);
  if (!analysis.simulated) return null;
  if (countRuleTargets(project, rule).length > 0) return null;

  const windowScreen = (token: string) =>
    token.startsWith("R::") && !token.includes("!")
      ? project.screens.find((s) => s.kind === "window" && s.recipeName === token.slice(3))
      : undefined;

  const out: string[] = [];
  for (const token of analysis.base.split(/\s+/).filter(Boolean)) {
    const prev = out[out.length - 1];
    const prevWindow = prev ? windowScreen(prev) : undefined;
    if (prevWindow && token.startsWith("!")) {
      // `R::<fenêtre> !x` : la fenêtre elle-même par sa classe.
      const own = (prevWindow.root.meta.class ?? []).filter((c) => c !== "window-expanded");
      const ownPart = token === "!window-expanded" && own[0] ? `!${own[0]}` : "";
      out[out.length - 1] = `Window${ownPart}${token}`;
      continue;
    }
    if (prevWindow) {
      // `R::<fenêtre> Type…` : le niveau R:: ne touche rien, on le retire.
      out.pop();
    }
    if (token.startsWith("!") && prev && !prevWindow && /^[A-Za-z]/.test(prev) && !prev.startsWith("R::")) {
      out[out.length - 1] = `${prev}${token}`;
      continue;
    }
    out.push(token);
  }
  const candidate = `${out.join(" ")}${analysis.state ? `:${analysis.state}` : ""}`;
  if (candidate === rule.selector) return null;
  return countRuleTargets(project, { ...rule, selector: candidate }).length > 0
    ? candidate
    : null;
}
