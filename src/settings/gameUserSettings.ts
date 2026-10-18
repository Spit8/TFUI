import type { GameFontScale } from "../gamestyle/matchBaseRule";

/**
 * Réglages du joueur enregistrés par le jeu dans `<dossier local>/settings.lua`
 * (dossier parent de `staging_area`), ex. `fontScaleClass = "SMALL"`.
 */
export function parseGameFontScale(settingsLua: string): GameFontScale | null {
  const m = settingsLua.match(/fontScaleClass\s*=\s*"([^"]+)"/);
  if (!m) return null;
  // Valeurs du menu Options : small / medium / 100 (Large).
  const v = m[1]!.toLowerCase();
  if (v === "small") return "small";
  if (v === "medium") return "medium";
  if (v === "large" || v === "100") return "large";
  return null;
}

/** Chemin de `settings.lua` du jeu, à côté du dossier `staging_area`. */
export function gameSettingsPath(stagingArea: string): string | null {
  const trimmed = stagingArea.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (cut <= 0) return null;
  const sep = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed.slice(0, cut)}${sep}settings.lua`;
}
