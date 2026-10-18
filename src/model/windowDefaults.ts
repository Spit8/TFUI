import type { StyleRule, TfuiProject, UiNode } from "./types";
import { createId } from "./uuid";

/** Taille étendue d’une nouvelle fenêtre (`Window!<classe>!window-expanded`). */
export const NEW_WINDOW_SIZE: [number, number] = [720, 420];
/** Marge intérieure du contenu d’une nouvelle fenêtre (`Window!<classe> Window::Content`). */
export const NEW_WINDOW_CONTENT_PADDING: [number, number, number, number] = [8, 8, 8, 8];

/** Les classes CSS n’acceptent que [A-Za-z0-9-] (stylesheetutil.lua). */
function cssSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

/** `NewWindow` / `new_window` → `new_window` (identifiant). */
function snake(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Identifiants de fenêtre (`meta.id`) déjà pris dans le projet. */
function usedWindowIds(project: TfuiProject | null): Set<string> {
  const ids = new Set<string>();
  for (const s of project?.screens ?? []) {
    if (s.root.type === "Window" && s.root.meta.id) ids.add(s.root.meta.id);
  }
  return ids;
}

/**
 * Réglages de toute nouvelle fenêtre, posés à la création (projet, mod,
 * nouvel écran) pour qu’ils soient visibles et modifiables :
 * - `closable` + identifiant `<modId>.<nom>` : le générateur ajoute alors un
 *   `onClose` qui masque la fenêtre en jeu (`api.gui.byId.setVisible`) ;
 * - `expanded = true` + classe `<modId>-<nom>-window` portée par la Window ;
 * - deux classes partagées : taille étendue (`!window-expanded`, motif
 *   map_editor.css.lua) et marge intérieure du contenu seul
 *   (`Window::Content` ; un padding sur la Window décale aussi la barre de
 *   titre et la croix, constaté en jeu).
 * Modifie `win` ; renvoie les règles à ajouter au projet.
 */
export function applyNewWindowDefaults(
  win: UiNode,
  opts: { modId: string; name: string; project?: TfuiProject | null },
): StyleRule[] {
  const base = snake(opts.name) || "window";
  const taken = usedWindowIds(opts.project ?? null);
  let slug = base;
  for (let n = 2; taken.has(`${opts.modId}.${slug}`); n++) slug = `${base}_${n}`;

  const windowClass = `${cssSafe(opts.modId)}-${cssSafe(slug.replace(/_/g, "-"))}-window`;
  win.props.closable = { kind: "literal", value: true };
  win.props.expanded = { kind: "literal", value: true };
  // WindowParam.id (singleton / byId) — émis comme prop `id`, pas dans meta.
  win.meta.id = `${opts.modId}.${slug}`;
  win.meta.class = [...(win.meta.class ?? []).filter((c) => c !== windowClass), windowClass];

  return [
    {
      id: createId(),
      selector: `Window!${windowClass}!window-expanded`,
      props: { size: [...NEW_WINDOW_SIZE] },
    },
    {
      id: createId(),
      selector: `Window!${windowClass} Window::Content`,
      props: { padding: [...NEW_WINDOW_CONTENT_PADDING] },
    },
  ];
}
