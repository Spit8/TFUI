/**
 * Contrôle des traductions : compare chaque langue (livrées dans
 * src/i18n/locales et dossier des langues de l’utilisateur) au français de base.
 *
 *   npm run i18n:check                  # dossier des langues par défaut
 *   npm run i18n:check -- --dir <dossier>
 *
 * Échec (code 1) si un fichier est illisible ou si des paramètres {…} diffèrent
 * de la base ; les clés manquantes sont seulement signalées (le français
 * s’affiche à la place).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { flattenMessages } from "../src/i18n/format";
import { compareLocale } from "../src/i18n/keyAudit";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BUNDLED = join(ROOT, "src", "i18n", "locales");

function userDir(argv: string[]): string | null {
  const i = argv.indexOf("--dir");
  if (i >= 0 && argv[i + 1]) return resolve(argv[i + 1]!);
  const appData = process.env.APPDATA;
  return appData ? join(appData, "com.tf3.uidesigner", "locales") : null;
}

function readLocale(path: string): Record<string, string> {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return flattenMessages(JSON.parse(text));
}

const base = readLocale(join(BUNDLED, "fr.json"));
const files: { label: string; path: string }[] = [];
for (const name of readdirSync(BUNDLED)) {
  if (name.endsWith(".json") && name !== "fr.json") files.push({ label: `intégrée ${name}`, path: join(BUNDLED, name) });
}
const dir = userDir(process.argv);
if (dir && existsSync(dir)) {
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".json") && !name.endsWith(".modele.json")) {
      files.push({ label: `utilisateur ${name}`, path: join(dir, name) });
    }
  }
}

console.log(`Base française : ${Object.keys(base).length} clés.`);
if (files.length === 0) console.log(`Aucune autre langue (dossier : ${dir ?? "inconnu"}).`);

let failed = false;
for (const f of files) {
  let messages: Record<string, string>;
  try {
    messages = readLocale(f.path);
  } catch (error) {
    failed = true;
    console.log(`\n✗ ${f.label} : illisible — ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  const r = compareLocale(base, messages);
  const done = Object.keys(base).length - r.missing.length;
  console.log(`\n${r.badParams.length ? "✗" : "✓"} ${f.label} : ${done}/${Object.keys(base).length} clés traduites`);
  for (const b of r.badParams) {
    failed = true;
    console.log(`  paramètres différents  ${b.key} : attendu {${b.expected.join("}, {")}} — reçu {${b.got.join("}, {")}}`);
  }
  if (r.extra.length) console.log(`  clés inconnues (ignorées) : ${r.extra.join(", ")}`);
  if (r.missing.length) {
    const shown = r.missing.slice(0, 20);
    console.log(`  manquantes (${r.missing.length}, en français à l’écran) : ${shown.join(", ")}${r.missing.length > 20 ? ", …" : ""}`);
  }
}
process.exit(failed ? 1 : 0);
