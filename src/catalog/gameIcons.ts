import { gameImageCandidates } from "./gameCache";

/** Ligne de `game-cache/images/index.json` (écrit par l’import Rust). */
export interface ImageIndexEntry {
  /** Chemin dans le jeu, relatif à `base/content` (ex. `gui/hud/icons/x@2x.tga`). */
  path: string;
  /** PNG dans la copie locale, relatif à `game-cache`. */
  png: string;
  width: number;
  height: number;
  /** Masque en niveaux de gris : teinté par la couleur du style. */
  mask: boolean;
}

/** Icône logique : une image du jeu, toutes résolutions confondues. */
export interface GameIcon {
  /** Chemin à écrire dans le code, comme le vanilla : `::/gui/hud/icons/x.tga`. */
  gamePath: string;
  name: string;
  /** Dossier dans le jeu (`gui/hud/icons`). */
  folder: string;
  /** PNG de meilleure résolution (`@2x` si disponible). */
  png: string;
  /** Taille d’interface (image `@2x` divisée par 2). */
  width: number;
  height: number;
  mask: boolean;
}

/** `gui/hud/icons/x@2x.tga` → `::/gui/hud/icons/x.tga`. */
export function gamePathOf(entryPath: string): string {
  return `::/${entryPath.replace(/@2x(\.tga)$/i, "$1")}`;
}

/** Regroupe `@2x` et 1x en une icône, en gardant la meilleure image. */
export function buildGameIcons(index: ImageIndexEntry[]): GameIcon[] {
  const byPath = new Map<string, GameIcon & { scale: number }>();
  for (const e of index) {
    const scale = /@2x\.tga$/i.test(e.path) ? 2 : 1;
    const gamePath = gamePathOf(e.path);
    const prev = byPath.get(gamePath);
    if (prev && prev.scale >= scale) continue;
    const rel = gamePath.slice(3);
    const cut = rel.lastIndexOf("/");
    byPath.set(gamePath, {
      gamePath,
      name: rel.slice(cut + 1).replace(/\.tga$/i, ""),
      folder: cut > 0 ? rel.slice(0, cut) : "",
      png: e.png,
      width: Math.round(e.width / scale),
      height: Math.round(e.height / scale),
      mask: e.mask,
      scale,
    });
  }
  return [...byPath.values()]
    .map(({ scale: _scale, ...icon }) => icon)
    .sort((a, b) => a.gamePath.localeCompare(b.gamePath));
}

export interface IconGroup {
  /** Titre de section (dossier de l’interface, « Contenus du jeu », « Autres »). */
  title: string;
  /** Sous-dossiers, triés. */
  subgroups: { title: string; icons: GameIcon[] }[];
  count: number;
}

/** Images hors interface (assets, climates, mission…) : une seule section. */
export const NON_UI_GROUP = "Contenus du jeu";
/** Sections d’une seule image, regroupées. */
export const OTHER_GROUP = "Autres";

const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

/**
 * Sections : un dossier de l’interface (`gui/hud` → « hud »), les contenus
 * hors interface réunis, les sections d’une seule image dans « Autres » ;
 * ordre alphabétique, « Autres » en dernier.
 */
export function groupGameIcons(icons: GameIcon[]): IconGroup[] {
  const groups = new Map<string, Map<string, GameIcon[]>>();
  const add = (group: string, sub: string, icon: GameIcon) => {
    const subs = groups.get(group) ?? new Map<string, GameIcon[]>();
    subs.set(sub, [...(subs.get(sub) ?? []), icon]);
    groups.set(group, subs);
  };
  for (const icon of icons) {
    const parts = icon.folder.split("/").filter(Boolean);
    if (parts[0] === "gui" && parts[1]) add(parts[1], parts.slice(2).join("/"), icon);
    else add(NON_UI_GROUP, parts.join("/"), icon);
  }
  // Sections d’une seule image → « Autres » (sous-section = dossier d’origine).
  for (const [title, subs] of [...groups.entries()]) {
    const count = [...subs.values()].reduce((n, l) => n + l.length, 0);
    if (count !== 1 || title === OTHER_GROUP) continue;
    groups.delete(title);
    for (const [sub, list] of subs) {
      for (const icon of list) add(OTHER_GROUP, title === NON_UI_GROUP ? sub : [title, sub].filter(Boolean).join("/"), icon);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === OTHER_GROUP ? 1 : b === OTHER_GROUP ? -1 : collator.compare(a, b)))
    .map(([title, subs]) => {
      const subgroups = [...subs.entries()]
        .sort(([a], [b]) => collator.compare(a, b))
        .map(([sub, list]) => ({ title: sub, icons: list }));
      return { title, subgroups, count: subgroups.reduce((n, sg) => n + sg.icons.length, 0) };
    });
}

/** Recherche dans le nom et le dossier (insensible à la casse). */
export function filterGameIcons(icons: GameIcon[], query: string): GameIcon[] {
  const q = query.trim().toLowerCase();
  if (!q) return icons;
  return icons.filter((i) => i.gamePath.toLowerCase().includes(q));
}

/** Entrées d’archive (`gui.zip`…) des images minimales (styles + moteur), parmi celles qui existent. */
export function minimumImportEntries(
  available: { source: string; entry: string }[],
  imageFiles: string[],
): { source: string; entry: string }[] {
  const wanted = new Set(imageFiles.flatMap((f) => gameImageCandidates(f).map((c) => c.entry)));
  return available.filter((a) => wanted.has(a.entry));
}
