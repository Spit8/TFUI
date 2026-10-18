import type { DockviewApi, DockviewGroupPanel } from "dockview";
import { installNativeMenuBlocker } from "../ui/menu/nativeMenu";
import { getCommandContext } from "./commands";
import { installCommandShortcuts } from "./commands/shortcuts";

/**
 * Fenêtres détachées : elles partagent le contexte JS de la fenêtre principale
 * mais ont leur propre `window` / `document`. Tout écouteur global (raccourcis,
 * blocage du menu natif, focus) doit donc y être posé aussi.
 */

const instrumented = new Map<Window, () => void>();
const focusListeners = new Set<() => void>();

/** Appelé quand une fenêtre détachée reprend le focus (ex. état de build). */
export function onAnyPopoutFocus(listener: () => void): () => void {
  focusListeners.add(listener);
  return () => focusListeners.delete(listener);
}

/** Recopie dans la popout les styles ajoutés après son ouverture (Monaco, chunks). */
function mirrorNewStyles(target: Document): () => void {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        const el = node as HTMLElement;
        if (el.tagName === "STYLE" || (el.tagName === "LINK" && (el as HTMLLinkElement).rel === "stylesheet")) {
          target.head.appendChild(target.importNode(el, true));
        }
      }
    }
  });
  observer.observe(document.head, { childList: true });
  return () => observer.disconnect();
}

function instrument(win: Window): void {
  if (instrumented.has(win)) return;
  let doc: Document;
  try {
    doc = win.document;
  } catch {
    return; // pas encore chargée / inaccessible
  }
  if (!doc.body) return;
  const disposers = [
    installNativeMenuBlocker(doc),
    installCommandShortcuts(() => getCommandContext(), win),
    mirrorNewStyles(doc),
  ];
  const onFocus = () => {
    for (const l of focusListeners) l();
  };
  win.addEventListener("focus", onFocus);
  disposers.push(() => win.removeEventListener("focus", onFocus));
  instrumented.set(win, () => {
    for (const d of disposers) d();
  });
}

export function popoutGroups(api: DockviewApi): DockviewGroupPanel[] {
  return api.groups.filter((g) => g.api.location.type === "popout");
}

export function popoutWindowOf(group: DockviewGroupPanel): Window | null {
  const loc = group.api.location;
  if (loc.type !== "popout") return null;
  try {
    return loc.getWindow() ?? null;
  } catch {
    return null;
  }
}

interface PopoutEntry {
  popoutGroup: DockviewGroupPanel;
  window: { close: () => void };
}

/**
 * Ferme proprement une fenêtre détachée : dockview remet son groupe dans la
 * grille. Passe par l’objet interne `PopoutWindow` car la fenêtre OS peut déjà
 * être fermée (crash, fermeture forcée) sans que `beforeunload` ait été reçu.
 */
export function closePopoutGroup(api: DockviewApi, group: DockviewGroupPanel): void {
  const component = (api as unknown as { component?: { _popoutGroups?: PopoutEntry[] } })
    .component;
  const entry = component?._popoutGroups?.find((p) => p.popoutGroup === group);
  if (entry) {
    entry.window.close();
    return;
  }
  try {
    popoutWindowOf(group)?.close();
  } catch {
    // déjà fermée
  }
}

/**
 * Passe périodique : instrumente les nouvelles fenêtres détachées et rattache
 * les groupes dont la fenêtre a disparu (panneau orphelin).
 */
export function syncPopoutWindows(api: DockviewApi): void {
  const alive = new Set<Window>();
  for (const group of popoutGroups(api)) {
    const win = popoutWindowOf(group);
    if (!win || win.closed) {
      closePopoutGroup(api, group);
      continue;
    }
    alive.add(win);
    instrument(win);
  }
  for (const [win, dispose] of instrumented) {
    if (!alive.has(win)) {
      dispose();
      instrumented.delete(win);
    }
  }
}

/** Retire les écouteurs posés sur toutes les fenêtres détachées. */
export function disposePopoutInstrumentation(): void {
  for (const dispose of instrumented.values()) dispose();
  instrumented.clear();
}
