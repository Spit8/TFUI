import { invoke } from "@tauri-apps/api/core";

export interface GameRootCheck {
  ok: boolean;
  tf3Root: string;
  builtinPath: string;
  message: string;
}

export interface MonitorBoundsDto {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Zones de travail des moniteurs, en pixels logiques. */
export async function listMonitors(): Promise<MonitorBoundsDto[]> {
  return invoke<MonitorBoundsDto[]>("list_monitors");
}

/** Lance le jeu (détaché) avec des arguments optionnels. */
export async function launchGame(tf3Root: string, args: string[] = []): Promise<void> {
  return invoke<void>("launch_game", { tf3Root, args });
}

export interface GameLog {
  path: string;
  content: string;
  modifiedMs: number;
}

/** Fin du journal de la dernière session du jeu (`crash_dump/stdout.txt`). */
export async function readGameLog(stagingArea: string): Promise<GameLog> {
  return invoke<GameLog>("read_game_log", { stagingArea });
}

/** Position du pointeur à l’écran, en pixels logiques. */
export async function cursorPosition(): Promise<{ x: number; y: number }> {
  return invoke<{ x: number; y: number }>("cursor_position");
}

export async function verifyGameRoot(tf3Root: string): Promise<GameRootCheck> {
  return invoke<GameRootCheck>("verify_game_root", { tf3Root });
}

export async function detectDefaultGameRoot(): Promise<GameRootCheck> {
  return invoke<GameRootCheck>("detect_default_game_root");
}

export async function readGameFile(
  tf3Root: string,
  relativePath: string,
): Promise<string> {
  return invoke<string>("read_game_file", { tf3Root, relativePath });
}

export async function hashGameFile(
  tf3Root: string,
  relativePath: string,
): Promise<string> {
  return invoke<string>("hash_game_file", { tf3Root, relativePath });
}

export async function listZip(
  tf3Root: string,
  zipRelative: string,
  suffix?: string,
): Promise<string[]> {
  return invoke<string[]>("list_zip", { tf3Root, zipRelative, suffix });
}

export async function readZipEntry(
  tf3Root: string,
  zipRelative: string,
  entry: string,
): Promise<string> {
  return invoke<string>("read_zip_entry", { tf3Root, zipRelative, entry });
}

/** Entrées texte d’une archive finissant par `suffix`, lues en une seule ouverture. */
export async function readZipEntries(
  tf3Root: string,
  zipRelative: string,
  suffix: string,
): Promise<{ name: string; content: string }[]> {
  return invoke<{ name: string; content: string }[]>("read_zip_entries", { tf3Root, zipRelative, suffix });
}

export async function listContentZips(tf3Root: string): Promise<string[]> {
  return invoke<string[]>("list_content_zips", { tf3Root });
}

export async function writeAppCatalogFiles(
  appDataDir: string,
  catalogJson: string,
  styleJson: string,
): Promise<void> {
  return invoke("write_app_catalog_files", {
    appDataDir,
    catalogJson,
    styleJson,
  });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

/** Octets d’une entrée d’archive du jeu (police, image .tga). */
export async function readZipEntryBytes(
  tf3Root: string,
  zipRelative: string,
  entry: string,
): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("read_zip_entry_bytes", { tf3Root, zipRelative, entry });
}

export interface FingerprintEntry {
  path: string;
  size: number;
  modifiedMs: number;
}

/** Empreinte de version du jeu (taille + date de fichiers clés). */
export async function gameFingerprint(tf3Root: string): Promise<FingerprintEntry[]> {
  return invoke<FingerprintEntry[]>("game_fingerprint", { tf3Root });
}

/** Fichier du cache des ressources du jeu (`<données app>/game-cache/<rel>`). */
export async function readCacheFile(appDataDir: string, rel: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("read_cache_file", { appDataDir, rel });
}

export async function writeCacheFile(appDataDir: string, rel: string, bytes: Uint8Array): Promise<void> {
  await invoke("write_cache_file", bytes, {
    headers: { "x-app-data-dir": encodeURIComponent(appDataDir), "x-rel": encodeURIComponent(rel) },
  });
}

/** Image du jeu à importer : entrée d’archive (`source` = `base/content/x.zip`) ou fichier non compressé. */
export interface ImportEntry {
  source: string;
  entry: string;
}

export interface ImportSummary {
  converted: number;
  errors: string[];
}

/** Liste des `.tga` à importer : `ui` (gui.zip) ou `all` (toutes les archives et fichiers). */
export async function planGameImport(tf3Root: string, mode: "ui" | "all"): Promise<ImportEntry[]> {
  return invoke<ImportEntry[]>("plan_game_import", { tf3Root, mode });
}

/** Convertit les images en PNG dans la copie locale (événements `game-import-progress`). */
export async function importGameImages(
  tf3Root: string,
  appDataDir: string,
  entries: ImportEntry[],
): Promise<ImportSummary> {
  return invoke<ImportSummary>("import_game_images", { tf3Root, appDataDir, entries });
}

export async function clearGameCache(appDataDir: string): Promise<void> {
  await invoke("clear_game_cache", { appDataDir });
}

/** Écrit un fichier binaire (export PNG), octets bruts sans JSON. */
export async function writeBinaryFile(path: string, bytes: Uint8Array): Promise<void> {
  await invoke("write_binary_file", bytes, { headers: { "x-path": encodeURIComponent(path) } });
}

/** Octets d’une image locale (png, jpg, webp, bmp). */
export async function readImageFile(path: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("read_image_file", { path });
}

export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  return invoke("write_text_file", { path, content });
}

export async function writeGeneratedFile(
  path: string,
  content: string,
  force: boolean,
): Promise<void> {
  return invoke("write_generated_file", { path, content, force });
}

export async function removeGeneratedFile(path: string, force = false): Promise<void> {
  return invoke("remove_generated_file", { path, force });
}

/** Crée un fichier de l’utilisateur s’il est absent ; `false` s’il existait (jamais écrasé). */
export async function createUserFileIfAbsent(path: string, content: string): Promise<boolean> {
  return invoke<boolean>("create_user_file_if_absent", { path, content });
}

/** Fichiers `<données app>/locales/<code>.json` : `{ code: contenu }`. */
export async function readUserLocales(appDataDir: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("read_user_locales", { appDataDir });
}

/** Écrit `<code>.modele.json` dans le dossier des langues ; renvoie son chemin. */
export async function writeLocaleTemplate(appDataDir: string, code: string, content: string): Promise<string> {
  return invoke<string>("write_locale_template", { appDataDir, code, content });
}

/** Le dossier (ou un parent) contient-il un dépôt git ? */
export async function isVersioned(path: string): Promise<boolean> {
  return invoke<boolean>("is_versioned", { path });
}

export async function listDirFiles(path: string): Promise<string[]> {
  return invoke<string[]>("list_dir_files", { path });
}

export interface ScaffoldResult {
  projectDir: string;
  tfuiPath: string;
  modRoot: string;
}

export interface ModMetadataPatch {
  modId: string;
  revision: number;
  severityAdd: string;
  severityRemove: string;
  visible: boolean;
  cosmetic: boolean;
  name: string;
  summary: string;
  description: string;
  authors: { name: string; role: string }[];
  tags: string[];
  url: string;
  preRunScript?: string | null;
  runScript?: string | null;
  postRunScript?: string | null;
}

export async function createModScaffold(
  parentDir: string,
  modId: string,
  displayName: string,
): Promise<ScaffoldResult> {
  return invoke<ScaffoldResult>("create_mod_scaffold", {
    parentDir,
    modId,
    displayName,
  });
}

export async function saveModMetadata(
  modRoot: string,
  patch: ModMetadataPatch,
): Promise<void> {
  return invoke("save_mod_metadata", { modRoot, patch });
}

export async function readModMetadata(modRoot: string): Promise<{
  mod: Record<string, unknown>;
  modinfo: Record<string, unknown>;
}> {
  return invoke("read_mod_metadata", { modRoot });
}

export async function setModThumbnail(
  modRoot: string,
  sourceImage: string,
): Promise<void> {
  return invoke("set_mod_thumbnail", { modRoot, sourceImage });
}

export interface BuildResult {
  buildDir: string;
  fileCount: number;
}

export interface InstallResult {
  targetDir: string;
  preservedModIoFileid: boolean;
}

export async function buildMod(
  projectDir: string,
  modRootRel: string,
  modId: string,
): Promise<BuildResult> {
  return invoke<BuildResult>("build_mod", {
    projectDir,
    modRootRel,
    modId,
  });
}

export async function installMod(
  buildDir: string,
  stagingArea: string,
  modId: string,
  tf3Root: string,
  appDataDir: string,
  force: boolean,
): Promise<InstallResult> {
  return invoke<InstallResult>("install_mod", {
    buildDir,
    stagingArea,
    modId,
    tf3Root,
    appDataDir,
    force,
  });
}

export async function exportModZip(
  buildDir: string,
  zipPath: string,
): Promise<void> {
  return invoke("export_mod_zip", { buildDir, zipPath });
}

export async function isTf3Running(): Promise<boolean> {
  return invoke<boolean>("is_tf3_running");
}

export async function checkTeal(
  modRoot: string,
  guiDir: string,
): Promise<string[]> {
  return invoke<string[]>("check_teal", { modRoot, guiDir });
}

export interface BuildStateEntry {
  guiHash: string;
  sourceHash: string;
  fingerprint: string;
  builtAt: string;
}

export async function modSourceHash(
  projectDir: string,
  modRootRel: string,
): Promise<string> {
  return invoke<string>("mod_source_hash", { projectDir, modRootRel });
}

export async function readBuildState(
  appDataDir: string,
  projectPath: string,
): Promise<BuildStateEntry | null> {
  return invoke<BuildStateEntry | null>("read_build_state", {
    appDataDir,
    projectPath,
  });
}

export async function writeBuildState(
  appDataDir: string,
  projectPath: string,
  entry: BuildStateEntry,
): Promise<void> {
  return invoke("write_build_state", { appDataDir, projectPath, entry });
}

export async function readInstallHash(
  appDataDir: string,
  modId: string,
): Promise<string | null> {
  return invoke<string | null>("read_install_hash", { appDataDir, modId });
}
