import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { hashText } from "../src/catalog/hash.ts";
import { parseBuiltinTeal } from "../src/catalog/parseTealDefs.ts";
import { buildManualHelperComponents } from "../src/catalog/overrides.ts";
import { mergeHelperComponents } from "../src/catalog/parseTealDefs.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BUILTIN = join(ROOT, "fixtures", "base-tealdef", "scripts", "builtin.d.tl");
const OUT = join(ROOT, "src", "catalog", "catalog.generated.json");

function main(): void {
  if (!existsSync(BUILTIN)) {
    console.error(
      "fixtures/base-tealdef introuvable. Lancez d’abord : pnpm link-game",
    );
    process.exit(1);
  }
  const source = readFileSync(BUILTIN, "utf8");
  const hash = hashText(source);
  let catalog = parseBuiltinTeal(source, hash);
  catalog = mergeHelperComponents(catalog, buildManualHelperComponents());

  mkdirSync(join(ROOT, "src", "catalog"), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  console.log(
    `Catalogue écrit : ${OUT} (${catalog.components.length} composants, hash ${hash})`,
  );
}

main();
