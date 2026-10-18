import { join } from "node:path";
import { open } from "yauzl-promise";
import { fixturesBaseContent } from "../catalog/fixtures";
import { GAME_RUNTIME_FILES } from "./luaHarness";

/**
 * Lit le runtime React du jeu depuis `fixtures/base-content/gui.zip`
 * (junction vers l’installation, voir `pnpm link-game`). Tests seulement.
 */
export async function readGameRuntimeFromFixtures(): Promise<Record<string, string>> {
  return readFixtureZipEntries("gui.zip", GAME_RUNTIME_FILES);
}

/** Lit des entrées texte d’une archive de `fixtures/base-content`. Tests seulement. */
export async function readFixtureZipEntries(
  zipName: string,
  paths: readonly string[],
): Promise<Record<string, string>> {
  const wanted = new Set<string>(paths);
  const out: Record<string, string> = {};
  const zip = await open(join(fixturesBaseContent(), zipName));
  try {
    for await (const entry of zip) {
      const name = entry.filename.replace(/\\/g, "/");
      if (!wanted.has(name)) continue;
      const chunks: Buffer[] = [];
      const stream = await entry.openReadStream();
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      out[name] = Buffer.concat(chunks).toString("utf8");
    }
  } finally {
    await zip.close();
  }
  return out;
}
