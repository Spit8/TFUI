import { extractBaseStyles } from "../gamestyle/extractBaseStyles";
import type { BaseStyles } from "../gamestyle/types";
import { buildStyleVocabulary } from "./extractStyleVocabulary";
import { hashText } from "./hash";
import { buildManualHelperComponents } from "./overrides";
import { mergeHelperComponents, parseBuiltinTeal } from "./parseTealDefs";
import type { Catalog, StyleVocabulary } from "./types";

export interface GameIo {
  readGameFile: (relativePath: string) => Promise<string>;
  listContentZips: () => Promise<string[]>;
  listZip: (zipRelative: string, suffix?: string) => Promise<string[]>;
  readZipEntry: (zipRelative: string, entry: string) => Promise<string>;
  /** Toutes les entrées d’une archive finissant par `suffix`, en une ouverture (plus rapide). */
  readZipEntries?: (zipRelative: string, suffix: string) => Promise<{ name: string; content: string }[]>;
  /** URL du `glue.wasm` de wasmoon (navigateur) pour exécuter les feuilles de base. */
  wasmUrl?: string;
}

export interface RescanResult {
  catalog: Catalog;
  vocabulary: StyleVocabulary;
  liveHash: string;
  /** Styles de base du jeu ; null si leur extraction a échoué. */
  baseStyles: BaseStyles | null;
  /** Raison de l’échec de l’extraction des styles de base. */
  baseStylesError?: string;
}

/** Catalogue seul (`builtin.d.tl` + entrées manuelles), sans styles ni vocabulaire. */
export async function rescanCatalog(io: Pick<GameIo, "readGameFile">): Promise<Catalog> {
  const source = await io.readGameFile("base/tealdef/scripts/builtin.d.tl");
  return mergeHelperComponents(parseBuiltinTeal(source, hashText(source)), buildManualHelperComponents());
}

/** Vocabulaire de styles seul : toutes les feuilles `.css.lua` des archives du jeu. */
export async function rescanVocabulary(
  io: Pick<GameIo, "listContentZips" | "listZip" | "readZipEntry" | "readZipEntries">,
): Promise<StyleVocabulary> {
  const zips = await io.listContentZips();
  const files: { path: string; content: string }[] = [];
  for (const zipRel of zips) {
    // Une ouverture par archive quand c’est possible (voir `read_zip_entries`).
    if (io.readZipEntries) {
      try {
        for (const e of await io.readZipEntries(zipRel, ".css.lua")) {
          files.push({ path: `${zipRel}::${e.name}`, content: e.content });
        }
      } catch {
        // archive illisible : ignorée
      }
      continue;
    }
    let entries: string[] = [];
    try {
      entries = await io.listZip(zipRel, ".css.lua");
    } catch {
      continue;
    }
    for (const entry of entries) {
      try {
        const content = await io.readZipEntry(zipRel, entry);
        files.push({ path: `${zipRel}::${entry}`, content });
      } catch {
        // skip unreadable entries
      }
    }
  }

  return buildStyleVocabulary(files);
}

export async function rescanGame(io: GameIo): Promise<RescanResult> {
  const catalog = await rescanCatalog(io);
  const liveHash = catalog.sourceHash;
  const vocabulary = await rescanVocabulary(io);
  try {
    const baseStyles = await extractBaseStylesFromGame(io);
    return { catalog, vocabulary, liveHash, baseStyles };
  } catch (error) {
    const baseStylesError = error instanceof Error ? error.message : String(error);
    return { catalog, vocabulary, liveHash, baseStyles: null, baseStylesError };
  }
}

/** Exécute les feuilles de base du jeu depuis `base/content/*.zip`. */
export function extractBaseStylesFromGame(
  io: Pick<GameIo, "readZipEntry" | "wasmUrl">,
): Promise<BaseStyles> {
  return extractBaseStyles(
    (zip, path) => io.readZipEntry(`base/content/${zip}`, path).catch(() => null),
    io.wasmUrl,
  );
}
