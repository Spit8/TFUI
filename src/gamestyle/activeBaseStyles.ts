import { indexBaseRules, type BaseStyleIndex } from "./matchBaseRule";
import type { BaseStyles } from "./types";

/** Styles de base du jeu actifs (posés par App au chargement du cache / re-scan). */
let active: { styles: BaseStyles; index: BaseStyleIndex } | null = null;

export function setActiveBaseStyles(styles: BaseStyles | null): void {
  active = styles ? { styles, index: indexBaseRules(styles.rules) } : null;
}

export function getActiveBaseStyles(): BaseStyles | null {
  return active?.styles ?? null;
}

export function getActiveBaseStyleIndex(): BaseStyleIndex | null {
  return active?.index ?? null;
}
