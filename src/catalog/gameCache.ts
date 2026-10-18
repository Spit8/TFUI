import type { BaseStyles } from "../gamestyle/types";

/**
 * Copie permanente des ressources du jeu utilisées par l’éditeur
 * (`<données de l’app>/game-cache/`, hors dépôt, liée à l’installation) :
 * seulement ce que l’app lit à l’exécution — polices Lato, images des
 * surfaces citées par les styles de base, icônes dessinées par le moteur.
 * Les outils de debug (banc de rendu, fixtures) n’en dépendent pas.
 */

/** Entrée d’archive du jeu (`base/content/<zip>`). */
export interface GameFile {
  zip: string;
  entry: string;
}

/** Empreinte de version : taille + date de fichiers clés de l’installation. */
export interface FingerprintPart {
  path: string;
  size: number;
  modifiedMs: number;
}

export function fingerprintKey(parts: FingerprintPart[]): string {
  return parts
    .map((p) => `${p.path}:${p.size}:${p.modifiedMs}`)
    .sort()
    .join("|");
}

/** Polices du jeu (fontMap anglais de `locale/en.lang.lua`) : poids CSS → fichier. */
export const GAME_FONT_FILES: { weight: string; file: GameFile }[] = [
  { weight: "300", file: { zip: "locale.zip", entry: "locale/Lato2OFL/Lato-Light.ttf" } },
  { weight: "400", file: { zip: "locale.zip", entry: "locale/Lato2OFL/Lato-Regular.ttf" } },
  { weight: "500", file: { zip: "locale.zip", entry: "locale/Lato2OFL/Lato-Medium.ttf" } },
  { weight: "700", file: { zip: "locale.zip", entry: "locale/Lato2OFL/Lato-Bold.ttf" } },
];

/** Icônes que le moteur dessine lui-même (absentes des styles). */
export const ENGINE_ICONS = ["::/gui/builtin/window/icons/symbol_close_18.tga"];

/** `::/gui/builtin/x.tga` → archive `gui.zip`, entrées `@2x` puis `1x`. */
export function gameImageCandidates(fileName: string): (GameFile & { scale: number })[] {
  const path = fileName.replace(/^::/, "").replace(/^\/+/, "");
  const top = path.split("/")[0];
  if (!top || !path.toLowerCase().endsWith(".tga")) return [];
  const zip = `${top}.zip`;
  return [
    { zip, entry: path.replace(/\.tga$/i, "@2x.tga"), scale: 2 },
    { zip, entry: path, scale: 1 },
  ];
}

/** Images `.tga` citées par les styles de base (toute valeur `{ fileName }`). */
export function styleImageFiles(styles: BaseStyles): string[] {
  const out = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v !== "object" || v === null) return;
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    const rec = v as Record<string, unknown>;
    if (typeof rec.fileName === "string" && rec.fileName.toLowerCase().endsWith(".tga")) out.add(rec.fileName);
    Object.values(rec).forEach(visit);
  };
  for (const r of styles.rules) visit(r.styleSheet);
  return [...out].sort();
}

/** Toutes les images à copier : styles + icônes du moteur. */
export function gameImageFiles(styles: BaseStyles | null): string[] {
  return [...new Set([...(styles ? styleImageFiles(styles) : []), ...ENGINE_ICONS])].sort();
}

/** Chemin relatif dans le cache. */
export function cacheRel(file: GameFile): string {
  return `${file.zip}/${file.entry}`;
}
