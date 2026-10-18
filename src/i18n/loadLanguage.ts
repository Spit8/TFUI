import { appDataDir } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { loadSettings } from "../settings/settingsStore";
import { readUserLocales, writeLocaleTemplate } from "../tauri/commands";
import { BASE_LANGUAGE, baseLocaleJson, setLanguage, setUserLocales } from "./index";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Relit le dossier des langues ; renvoie les fichiers illisibles. */
export async function reloadUserLocales(): Promise<string[]> {
  if (!isTauri()) return [];
  try {
    return setUserLocales(await readUserLocales(await appDataDir()));
  } catch {
    return [];
  }
}

/** Au démarrage : langues de l’utilisateur puis langue choisie dans les paramètres. */
export async function initLanguage(): Promise<string[]> {
  const errors = await reloadUserLocales();
  const settings = await loadSettings();
  setLanguage(settings.language);
  return errors;
}

/**
 * Exporte le modèle (langue de base, complète) dans le dossier des langues et
 * ouvre ce dossier dans l’explorateur.
 */
export async function openLocalesFolder(): Promise<string> {
  const path = await writeLocaleTemplate(await appDataDir(), BASE_LANGUAGE, baseLocaleJson());
  await openPath(path.replace(/[\\/][^\\/]+$/, ""));
  return path;
}
