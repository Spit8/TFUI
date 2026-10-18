import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { open } from "yauzl-promise";
import { buildStyleVocabulary } from "../src/catalog/extractStyleVocabulary.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CONTENT = join(ROOT, "fixtures", "base-content");
const OUT = join(ROOT, "src", "catalog", "style-vocabulary.generated.json");

async function readCssFromZip(
  zipPath: string,
): Promise<{ path: string; content: string }[]> {
  const results: { path: string; content: string }[] = [];
  const zip = await open(zipPath);
  try {
    for await (const entry of zip) {
      const name = entry.filename.replace(/\\/g, "/");
      if (!name.toLowerCase().endsWith(".css.lua")) continue;
      const stream = await entry.openReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      results.push({
        path: `${zipPath.replace(/\\/g, "/")}::${name}`,
        content: Buffer.concat(chunks).toString("utf8"),
      });
    }
  } finally {
    await zip.close();
  }
  return results;
}

async function main(): Promise<void> {
  if (!existsSync(CONTENT)) {
    console.error(
      "fixtures/base-content introuvable. Lancez d’abord : pnpm link-game",
    );
    process.exit(1);
  }

  const zips = readdirSync(CONTENT).filter((f) =>
    f.toLowerCase().endsWith(".zip"),
  );
  const files: { path: string; content: string }[] = [];
  for (const zipName of zips) {
    const zipPath = join(CONTENT, zipName);
    try {
      const entries = await readCssFromZip(zipPath);
      files.push(...entries);
      console.log(`  ${zipName}: ${entries.length} .css.lua`);
    } catch (err) {
      console.warn(`  ignore ${zipName}:`, err);
    }
  }

  const vocab = buildStyleVocabulary(files);
  mkdirSync(join(ROOT, "src", "catalog"), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(vocab, null, 2)}\n`, "utf8");
  console.log(
    `Vocabulaire écrit : ${OUT} (${vocab.styleKeys.length} clés, ${vocab.classes.length} classes, ${vocab.scannedFiles} fichiers)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
