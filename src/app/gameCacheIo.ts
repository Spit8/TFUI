import { listen } from "@tauri-apps/api/event";
import { appDataDir } from "@tauri-apps/api/path";
import { cacheRel, fingerprintKey, GAME_FONT_FILES, gameImageFiles } from "../catalog/gameCache";
import { minimumImportEntries, type ImageIndexEntry } from "../catalog/gameIcons";
import { setGameAssetReader, setGamePngReader, type GameBytesReader } from "../gamestyle/gameAssets";
import type { BaseStyles } from "../gamestyle/types";
import type { GameImportMode } from "../settings/defaults";
import {
  clearGameCache,
  gameFingerprint,
  importGameImages,
  planGameImport,
  readCacheFile,
  readZipEntryBytes,
  writeCacheFile,
  type ImportEntry,
} from "../tauri/commands";
import type { ImportProgressState } from "./importProgressModel";
import { t } from "../i18n";

/**
 * Copie locale du contenu graphique du jeu (`<données app>/game-cache/`) :
 * polices (copiées telles quelles) et images `.tga` converties en PNG à
 * l’import (`images/…`, index `images/index.json`). Lue au démarrage ; jamais
 * mise à jour sans l’accord de l’utilisateur.
 */

const INDEX_REL = "images/index.json";

/** Polices et `.tga` de repli : copie locale d’abord, sinon le jeu. */
export function makeCachedReader(tf3Root: string, dataDir: string): GameBytesReader {
  return async (zip, entry) => {
    const rel = cacheRel({ zip, entry });
    try {
      return new Uint8Array(await readCacheFile(dataDir, rel));
    } catch {
      // absent de la copie : lecture dans le jeu
    }
    return new Uint8Array(await readZipEntryBytes(tf3Root, `base/content/${zip}`, entry));
  };
}

/** Empreinte de version de l’installation (taille + date de fichiers clés). */
export async function currentGameFingerprint(tf3Root: string): Promise<string> {
  return fingerprintKey(await gameFingerprint(tf3Root));
}

/** Index des images importées, ou null si aucun import n’a eu lieu. */
export async function loadImageIndex(): Promise<ImageIndexEntry[] | null> {
  try {
    const bytes = await readCacheFile(await appDataDir(), INDEX_REL);
    return JSON.parse(new TextDecoder().decode(bytes)) as ImageIndexEntry[];
  } catch {
    return null;
  }
}

/** Octets d’un fichier de la copie locale (PNG importé…), null si absent. */
export async function readGameCacheFile(rel: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readCacheFile(await appDataDir(), rel));
  } catch {
    return null;
  }
}

/** Branche l’aperçu sur la copie locale (polices chargées à la fin). */
export async function attachGameCopy(tf3Root: string): Promise<void> {
  const dataDir = await appDataDir();
  setGamePngReader(readGameCacheFile);
  await setGameAssetReader(makeCachedReader(tf3Root, dataDir));
}

/** Nombre d’images proposées par mode (pour le dialogue de choix). */
export async function importCounts(
  tf3Root: string,
  styles: BaseStyles | null,
): Promise<Record<GameImportMode, number>> {
  const ui = await planGameImport(tf3Root, "ui");
  const all = await planGameImport(tf3Root, "all");
  return {
    minimum: minimumImportEntries(ui, gameImageFiles(styles)).length,
    ui: ui.length,
    all: all.length,
  };
}

/**
 * Importe le contenu graphique selon le mode : vide la copie, copie les
 * polices, convertit les images (progression par événements Rust).
 */
export async function importGameContent(
  tf3Root: string,
  styles: BaseStyles | null,
  mode: GameImportMode,
  onProgress: (state: ImportProgressState) => void,
): Promise<{ converted: number; errors: string[] }> {
  const dataDir = await appDataDir();
  await clearGameCache(dataDir).catch(() => undefined);

  for (let i = 0; i < GAME_FONT_FILES.length; i++) {
    const { file } = GAME_FONT_FILES[i]!;
    onProgress({ phase: "fonts", phaseRatio: i / GAME_FONT_FILES.length, detail: file.entry });
    const bytes = new Uint8Array(await readZipEntryBytes(tf3Root, `base/content/${file.zip}`, file.entry));
    await writeCacheFile(dataDir, cacheRel(file), bytes);
  }

  onProgress({ phase: "images", phaseRatio: 0, detail: t("progress.inventory") });
  let entries: ImportEntry[];
  if (mode === "minimum") entries = minimumImportEntries(await planGameImport(tf3Root, "ui"), gameImageFiles(styles));
  else entries = await planGameImport(tf3Root, mode);

  const unlisten = await listen<{ done: number; total: number; file: string }>("game-import-progress", (e) => {
    const { done, total, file } = e.payload;
    onProgress({ phase: "images", phaseRatio: total ? done / total : 1, detail: `${done} / ${total} — ${file}` });
  });
  try {
    const summary = await importGameImages(tf3Root, dataDir, entries);
    onProgress({ phase: "images", phaseRatio: 1, detail: t("progress.imagesImported", { n: summary.converted }) });
    return summary;
  } finally {
    unlisten();
  }
}
