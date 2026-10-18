import { LazyStore } from "@tauri-apps/plugin-store";
import type { DockviewApi, SerializedDockview } from "dockview";
import { t } from "../i18n";
import { LAYOUT_STORAGE_KEY, LAYOUT_STORE_FILE } from "../settings/defaults";
import { listMonitors } from "../tauri/commands";
import { getCurrentScreenBounds, type MonitorBounds } from "./popoutLayout";

export type PanelId =
  | "palette"
  | "tree"
  | "preview"
  | "inspector"
  | "code"
  | "problems"
  | "styles"
  | "gameIcons";

/** Titres traduits, lus à chaque accès (langue courante). */
export const PANEL_TITLES: Record<PanelId, string> = {
  get palette() { return t("panel.palette"); },
  get tree() { return t("panel.tree"); },
  get preview() { return t("panel.preview"); },
  get inspector() { return t("panel.inspector"); },
  get code() { return t("panel.code"); },
  get problems() { return t("panel.problems"); },
  get styles() { return t("panel.styles"); },
  get gameIcons() { return t("panel.gameIcons"); },
};

/** « Icônes du jeu » : onglet à côté de l’inspecteur (qui reste actif). */
export function addGameIconsPanel(api: DockviewApi): void {
  if (api.getPanel("gameIcons") || !api.getPanel("inspector")) return;
  api.addPanel({
    id: "gameIcons",
    component: "gameIcons",
    title: PANEL_TITLES.gameIcons,
    position: { referencePanel: "inspector", direction: "within" },
    inactive: true,
  });
}

export function buildDefaultLayout(api: DockviewApi): void {
  const preview = api.addPanel({
    id: "preview",
    component: "preview",
    title: PANEL_TITLES.preview,
  });

  api.addPanel({
    id: "palette",
    component: "palette",
    title: PANEL_TITLES.palette,
    position: { referencePanel: preview, direction: "left" },
    initialWidth: 260,
  });

  api.addPanel({
    id: "tree",
    component: "tree",
    title: PANEL_TITLES.tree,
    position: { referencePanel: "palette", direction: "below" },
    initialHeight: 280,
  });

  api.addPanel({
    id: "inspector",
    component: "inspector",
    title: PANEL_TITLES.inspector,
    position: { referencePanel: preview, direction: "right" },
    initialWidth: 300,
  });

  addGameIconsPanel(api);

  // Code voisin de l’Aperçu (même groupe d’onglets) — §3.6
  api.addPanel({
    id: "code",
    component: "code",
    title: PANEL_TITLES.code,
    position: { referencePanel: preview, direction: "within" },
  });

  api.addPanel({
    id: "problems",
    component: "problems",
    title: PANEL_TITLES.problems,
    position: { referencePanel: preview, direction: "below" },
    initialHeight: 180,
  });

  api.addPanel({
    id: "styles",
    component: "styles",
    title: PANEL_TITLES.styles,
    position: { referencePanel: "problems", direction: "within" },
  });

  api.getPanel("preview")?.api.setActive();
}

// ── Persistance de la disposition ─────────────────────────────────────────
// Stockée dans `layout.json` (tauri-plugin-store, dossier de données de l’app)
// et non plus dans localStorage, cloisonné par origine (dev ≠ release).
// `preloadDockLayout()` est attendu au démarrage : `onReady` de dockview est
// synchrone et lit le cache.

const LAYOUT_KEY = "dockLayout";
const LAYOUT_BACKUP_KEY = "dockLayout.bak";

let cachedLayout: SerializedDockview | null = null;
let cachedMonitors: MonitorBounds[] = [];
let persistSuspended = false;
let storePromise: Promise<LazyStore> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(LAYOUT_STORE_FILE));
  }
  return storePromise;
}

function readLegacyLayout(): SerializedDockview | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SerializedDockview) : null;
  } catch {
    return null;
  }
}

/** Charge la disposition et la liste des moniteurs avant le montage du dock. */
export async function preloadDockLayout(): Promise<void> {
  if (!isTauriRuntime()) {
    cachedLayout = readLegacyLayout();
    cachedMonitors = [getCurrentScreenBounds()];
    return;
  }
  try {
    const store = await getStore();
    cachedLayout =
      (await store.get<SerializedDockview>(LAYOUT_KEY)) ?? readLegacyLayout();
  } catch {
    cachedLayout = readLegacyLayout();
  }
  try {
    const monitors = await listMonitors();
    cachedMonitors = monitors.length > 0 ? monitors : [getCurrentScreenBounds()];
  } catch {
    cachedMonitors = [getCurrentScreenBounds()];
  }
}

export function loadPersistedLayout(): SerializedDockview | null {
  return cachedLayout;
}

export function getKnownMonitors(): MonitorBounds[] {
  return cachedMonitors.length > 0 ? cachedMonitors : [getCurrentScreenBounds()];
}

async function writeLayout(
  key: string,
  value: SerializedDockview | null,
): Promise<void> {
  if (!isTauriRuntime()) {
    try {
      if (key !== LAYOUT_KEY) return;
      if (value) localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(value));
      else localStorage.removeItem(LAYOUT_STORAGE_KEY);
    } catch {
      // quota / mode privé
    }
    return;
  }
  const store = await getStore();
  if (value) await store.set(key, value);
  else await store.delete(key);
  await store.save();
}

export function persistLayout(api: DockviewApi): void {
  if (persistSuspended) return;
  try {
    cachedLayout = api.toJSON();
  } catch {
    return;
  }
  void writeLayout(LAYOUT_KEY, cachedLayout).catch(() => {
    // disque indisponible : on garde le cache mémoire
  });
}

/**
 * Enregistre immédiatement puis ignore les changements suivants : à la
 * fermeture, dockview rattache les popouts (ce qui changerait la disposition).
 */
export async function flushLayoutAndSuspend(
  api: DockviewApi | null,
): Promise<void> {
  if (api && !persistSuspended) {
    try {
      cachedLayout = api.toJSON();
    } catch {
      // garde le dernier cache
    }
  }
  persistSuspended = true;
  await writeLayout(LAYOUT_KEY, cachedLayout).catch(() => undefined);
}

/** Garde une copie de la disposition qui n’a pas pu être restaurée. */
export function backupBrokenLayout(layout: SerializedDockview): void {
  void writeLayout(LAYOUT_BACKUP_KEY, layout).catch(() => undefined);
}

export function resetPersistedLayout(): void {
  cachedLayout = null;
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    // ignore
  }
  void writeLayout(LAYOUT_KEY, null).catch(() => undefined);
}
