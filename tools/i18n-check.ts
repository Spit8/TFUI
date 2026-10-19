/**
 * Contrôle des traductions : compare chaque langue (livrées dans
 * src/i18n/locales et dossier des langues de l’utilisateur) au français de base.
 *
 *   npm run i18n:check                  # dossier des langues par défaut
 *   npm run i18n:check -- --dir <dossier>
 *
 * Échec (code 1) si un fichier est illisible, si des paramètres {…} ou des
 * repères […] diffèrent de la base, ou si un pluriel est cassé (accolades
 * visibles à l’écran). Pour les langues intégrées, échouent aussi : lignes en
 * trop (listes de synonymes), texte parasite (réponse d’IA), valeur restée en
 * français. Les clés manquantes et les longueurs aberrantes sont seulement
 * signalées (le français s’affiche à la place des manquantes).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { flattenMessages } from "../src/i18n/format";
import { compareLocale, type QualityKind, qualityIssues } from "../src/i18n/keyAudit";

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
const files: { label: string; path: string; lang: string; bundled: boolean }[] = [];
const langOf = (name: string) => name.replace(/\.json$/, "");
for (const name of readdirSync(BUNDLED)) {
  if (name.endsWith(".json") && name !== "fr.json") {
    files.push({ label: `intégrée ${name}`, path: join(BUNDLED, name), lang: langOf(name), bundled: true });
  }
}
const dir = userDir(process.argv);
if (dir && existsSync(dir)) {
  for (const name of readdirSync(dir)) {
    if (name.endsWith(".json") && !name.endsWith(".modele.json")) {
      files.push({ label: `utilisateur ${name}`, path: join(dir, name), lang: langOf(name), bundled: false });
    }
  }
}

console.log(`Base française : ${Object.keys(base).length} clés.`);
if (files.length === 0) console.log(`Aucune autre langue (dossier : ${dir ?? "inconnu"}).`);

/** Libellé de chaque défaut ; `always` = bloquant même pour une langue utilisateur. */
const KINDS: Record<QualityKind, { label: string; always: boolean; blocking: boolean }> = {
  plural: { label: "pluriel cassé", always: true, blocking: true },
  tokens: { label: "repères […] différents", always: true, blocking: true },
  extraLines: { label: "lignes en trop", always: false, blocking: true },
  junk: { label: "texte parasite", always: false, blocking: true },
  untranslated: { label: "resté en français", always: false, blocking: true },
  tooLong: { label: "longueur aberrante", always: false, blocking: false },
};

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
  const quality = qualityIssues(base, messages, f.lang);
  const isBlocking = (kind: QualityKind) => KINDS[kind].blocking && (f.bundled || KINDS[kind].always);
  const bad = r.badParams.length > 0 || quality.some((q) => isBlocking(q.kind));
  if (bad) failed = true;
  const done = Object.keys(base).length - r.missing.length;
  console.log(`\n${bad ? "✗" : "✓"} ${f.label} : ${done}/${Object.keys(base).length} clés traduites`);
  for (const q of quality) {
    console.log(`  ${isBlocking(q.kind) ? "✗" : "·"} ${KINDS[q.kind].label.padEnd(22)} ${q.key} : ${q.detail}`);
  }
  for (const b of r.badParams) {
    console.log(`  paramètres différents  ${b.key} : attendu {${b.expected.join("}, {")}} — reçu {${b.got.join("}, {")}}`);
  }
  if (r.extra.length) console.log(`  clés inconnues (ignorées) : ${r.extra.join(", ")}`);
  if (r.missing.length) {
    const shown = r.missing.slice(0, 20);
    console.log(`  manquantes (${r.missing.length}, en français à l’écran) : ${shown.join(", ")}${r.missing.length > 20 ? ", …" : ""}`);
  }
}
process.exit(failed ? 1 : 0);
