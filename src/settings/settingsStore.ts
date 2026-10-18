import { LazyStore } from "@tauri-apps/plugin-store";
import {
  DEFAULT_PREVIEW_APPEARANCE,
  DEFAULT_SETTINGS,
  SETTINGS_STORE_FILE,
  type AppSettings,
  type PreviewAppearance,
  type PreviewBackgroundMode,
  type PreviewFontScale,
  type GameImportMode,
  type UiDensity,
} from "./defaults";
import { t } from "../i18n";

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(SETTINGS_STORE_FILE));
  }
  return storePromise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mergeSettings(partial: unknown): AppSettings {
  if (!isRecord(partial)) {
    return { ...DEFAULT_SETTINGS };
  }
  const densityRaw = partial.density;
  const density: UiDensity =
    densityRaw === "normal" || densityRaw === "compact"
      ? densityRaw
      : DEFAULT_SETTINGS.density;
  const recentRaw = partial.recentProjects;
  const recentProjects = Array.isArray(recentRaw)
    ? recentRaw
        .filter((p): p is string => typeof p === "string" && p.length > 0)
        .slice(0, 8)
    : DEFAULT_SETTINGS.recentProjects;
  return {
    tf3Root:
      typeof partial.tf3Root === "string" && partial.tf3Root.length > 0
        ? partial.tf3Root
        : DEFAULT_SETTINGS.tf3Root,
    stagingArea: typeof partial.stagingArea === "string" ? partial.stagingArea : DEFAULT_SETTINGS.stagingArea,
    density,
    language:
      typeof partial.language === "string" && partial.language.length > 0
        ? partial.language
        : DEFAULT_SETTINGS.language,
    recentProjects,
    lastOpenProject:
      typeof partial.lastOpenProject === "string" &&
      partial.lastOpenProject.length > 0
        ? partial.lastOpenProject
        : null,
    openProjects: Array.isArray(partial.openProjects)
      ? partial.openProjects.filter((p): p is string => typeof p === "string" && p.length > 0)
      : [],
    previewShowBoxes:
      typeof partial.previewShowBoxes === "boolean"
        ? partial.previewShowBoxes
        : DEFAULT_SETTINGS.previewShowBoxes,
    previewBackground:
      partial.previewBackground === "solid" ||
      partial.previewBackground === "hidden" ||
      partial.previewBackground === "image"
        ? partial.previewBackground
        : DEFAULT_SETTINGS.previewBackground,
    previewBackgroundImage:
      typeof partial.previewBackgroundImage === "string" &&
      partial.previewBackgroundImage.length > 0
        ? partial.previewBackgroundImage
        : DEFAULT_SETTINGS.previewBackgroundImage,
    previewBackgroundImages: isRecord(partial.previewBackgroundImages)
      ? Object.fromEntries(
          Object.entries(partial.previewBackgroundImages).filter(
            (e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0,
          ),
        )
      : { ...DEFAULT_SETTINGS.previewBackgroundImages },
    previewAppearance: mergeAppearance(partial.previewAppearance),
    gameImportMode:
      partial.gameImportMode === "minimum" || partial.gameImportMode === "ui" || partial.gameImportMode === "all"
        ? partial.gameImportMode
        : DEFAULT_SETTINGS.gameImportMode,
    previewTextScale:
      partial.previewTextScale === "game" ||
      partial.previewTextScale === "small" ||
      partial.previewTextScale === "medium" ||
      partial.previewTextScale === "large"
        ? partial.previewTextScale
        : DEFAULT_SETTINGS.previewTextScale,
  };
}

/** Mémorise le projet ouvert (null = aucun) pour le rouvrir au démarrage. */
export async function setLastOpenProject(path: string | null): Promise<void> {
  if (!isTauriRuntime()) return;
  const settings = await loadSettings();
  if (settings.lastOpenProject === path) return;
  await saveSettings({ ...settings, lastOpenProject: path });
}

/** Mémorise l’option « Box » de l’aperçu. */
export async function setPreviewShowBoxes(value: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  const settings = await loadSettings();
  if (settings.previewShowBoxes === value) return;
  await saveSettings({ ...settings, previewShowBoxes: value });
}

function isRgba(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && n >= 0 && n <= 1);
}

/** Couleurs de l’aperçu : chaque valeur invalide reprend son défaut. */
export function mergeAppearance(raw: unknown): PreviewAppearance {
  const d = DEFAULT_PREVIEW_APPEARANCE;
  if (!isRecord(raw)) return { ...d };
  const color = (k: keyof Omit<PreviewAppearance, "selectedWidth">) => (isRgba(raw[k]) ? raw[k] : d[k]);
  const w = raw.selectedWidth;
  return {
    hoverFill: color("hoverFill"),
    hoverOutline: color("hoverOutline"),
    boxOutline: color("boxOutline"),
    selectedOutline: color("selectedOutline"),
    selectedWidth: typeof w === "number" && w >= 1 && w <= 8 ? Math.round(w) : d.selectedWidth,
  };
}

/** Mémorise le mode d’import du contenu du jeu. */
export async function setGameImportModeSetting(mode: GameImportMode): Promise<void> {
  if (!isTauriRuntime()) return;
  const settings = await loadSettings();
  await saveSettings({ ...settings, gameImportMode: mode });
}

/** Mémorise la taille du texte simulée (Text Scaling du jeu). */
export async function setPreviewFontScaleSetting(scale: PreviewFontScale): Promise<void> {
  if (!isTauriRuntime()) return;
  const settings = await loadSettings();
  await saveSettings({ ...settings, previewTextScale: scale });
}

/** Mémorise les couleurs de l’aperçu. */
export async function setPreviewAppearance(appearance: PreviewAppearance): Promise<void> {
  if (!isTauriRuntime()) return;
  const settings = await loadSettings();
  await saveSettings({ ...settings, previewAppearance: appearance });
}

/** Mémorise le fond de l’aperçu (mode, dernière image, image par format). */
export async function setPreviewBackground(
  mode: PreviewBackgroundMode,
  image: string | null,
  images: Record<string, string>,
): Promise<void> {
  if (!isTauriRuntime()) return;
  const settings = await loadSettings();
  if (
    settings.previewBackground === mode &&
    settings.previewBackgroundImage === image &&
    JSON.stringify(settings.previewBackgroundImages) === JSON.stringify(images)
  ) {
    return;
  }
  await saveSettings({
    ...settings,
    previewBackground: mode,
    previewBackgroundImage: image,
    previewBackgroundImages: images,
  });
}

/** Projets ouverts et projet actif, rouverts au démarrage. */
export interface OpenProjectsState {
  paths: string[];
  active: string | null;
}

/**
 * Clé à part dans le même fichier : les autres écritures de paramètres
 * (lecture → modification → réécriture de tout `settings`) ne peuvent plus
 * écraser la liste des projets ouverts avec une valeur périmée.
 */
const OPEN_PROJECTS_KEY = "openProjects";

function asOpenProjects(value: unknown): OpenProjectsState | null {
  if (!isRecord(value) || !Array.isArray(value.paths)) return null;
  return {
    paths: value.paths.filter((p): p is string => typeof p === "string" && p.length > 0),
    active: typeof value.active === "string" && value.active.length > 0 ? value.active : null,
  };
}

export async function loadOpenProjects(): Promise<OpenProjectsState> {
  if (!isTauriRuntime()) return { paths: [], active: null };
  try {
    const store = await getStore();
    const saved = asOpenProjects(await store.get(OPEN_PROJECTS_KEY));
    if (saved) return saved;
  } catch {
    // repli ci-dessous
  }
  // Anciennes versions : champs de `settings`.
  const settings = await loadSettings();
  return { paths: settings.openProjects, active: settings.lastOpenProject };
}

/** Écritures enchaînées dans l’ordre des appels (la dernière gagne toujours). */
let openProjectsWrite: Promise<void> = Promise.resolve();
let lastWritten: string | null = null;

/** Mémorise les projets ouverts et le projet actif (rouverts au démarrage). */
export function setOpenProjects(paths: string[], active: string | null): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve();
  const value: OpenProjectsState = { paths, active };
  const json = JSON.stringify(value);
  openProjectsWrite = openProjectsWrite
    .catch(() => undefined)
    .then(async () => {
      if (json === lastWritten) return;
      const store = await getStore();
      await store.set(OPEN_PROJECTS_KEY, value);
      await store.save();
      lastWritten = json;
    });
  return openProjectsWrite;
}

/** Retire un projet introuvable des récents et des projets ouverts. */
export async function forgetProject(path: string): Promise<string[]> {
  const settings = await loadSettings();
  const recentProjects = settings.recentProjects.filter((p) => p !== path);
  await saveSettings({ ...settings, recentProjects });
  const open = await loadOpenProjects();
  await setOpenProjects(
    open.paths.filter((p) => p !== path),
    open.active === path ? null : open.active,
  );
  return recentProjects;
}

export async function pushRecentProject(path: string): Promise<string[]> {
  const settings = await loadSettings();
  const next = [
    path,
    ...settings.recentProjects.filter((p) => p !== path),
  ].slice(0, 8);
  await saveSettings({ ...settings, recentProjects: next });
  return next;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function loadSettings(): Promise<AppSettings> {
  if (!isTauriRuntime()) {
    return { ...DEFAULT_SETTINGS };
  }
  try {
    const store = await getStore();
    const stored = await store.get<AppSettings>("settings");
    return mergeSettings(stored);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error(
      t("settingsErrors.tauriRequired"),
    );
  }
  const store = await getStore();
  await store.set("settings", settings);
  await store.save();
}
