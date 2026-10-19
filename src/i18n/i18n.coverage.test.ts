import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import it_ from "./locales/it.json";
import zh from "./locales/zh.json";
import { flattenMessages } from "./format";
import { compareLocale, hardcodedFrench, placeholders, pluralSyntaxErrors, qualityIssues, unusedKeys } from "./keyAudit";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const base = flattenMessages(fr);

describe("traductions", () => {
  it("paramètres : {nom} et pluriels reconnus", () => {
    expect(placeholders("{a} et {n, plural, one {# {b}} other {# x}}")).toEqual(["a", "b", "n"]);
  });

  it("le corps d’une branche de pluriel n’est pas un paramètre", () => {
    expect(placeholders("{n, plural, one {rule} other {# rules}}")).toEqual(["n"]);
  });

  it("pluriels cassés détectés", () => {
    expect(pluralSyntaxErrors("{n, plural, one {# a} other {# b}}")).toEqual([]);
    expect(pluralSyntaxErrors("{n, plural, other {# 个}}")).toEqual([]);
    expect(pluralSyntaxErrors("{n, singular, one {a} other {b}}")).toHaveLength(1);
    expect(pluralSyntaxErrors("{n, plural, one {# otro} otros {# otros}}").length).toBeGreaterThan(0);
  });

  it("défauts de qualité : repères, lignes en trop, texte parasite, resté en français", () => {
    const base = { s: "État : [state]", l: "Quitter", j: "texte", f: "Aucune note pour ce composant." };
    const kinds = qualityIssues(
      base,
      { s: "Estado: [estado]", l: "Salir\nAbandonar", j: "**texto** (dependiendo del contexto)", f: base.f },
      "es",
    ).map((q) => `${q.key}:${q.kind}`);
    expect(kinds).toEqual(["s:tokens", "l:extraLines", "j:junk", "f:untranslated"]);
  });

  it("langues intégrées sans défaut bloquant", () => {
    const locales = { de, en, es, it: it_, zh };
    const found = Object.entries(locales).flatMap(([lang, tree]) =>
      qualityIssues(base, flattenMessages(tree), lang)
        .filter((q) => q.kind !== "tooLong")
        .map((q) => `${lang} ${q.key} ${q.kind} ${q.detail}`),
    );
    expect(found).toEqual([]);
  });

  it("une langue est comparée à la base (manquantes, en trop, paramètres)", () => {
    const report = compareLocale({ a: "{x} ok", b: "y" }, { a: "{y} ok", c: "z" });
    expect(report.missing).toEqual(["b"]);
    expect(report.extra).toEqual(["c"]);
    expect(report.badParams).toEqual([{ key: "a", expected: ["x"], got: ["y"] }]);
  });

  it("aucune clé française inutilisée", () => {
    const sources = sourceFiles(SRC).map((f) => readFileSync(f, "utf8"));
    expect(unusedKeys(base, sources)).toEqual([]);
  });

  it("aucun texte français en dur dans les composants (hors banc de dev)", () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => f.endsWith(".tsx") && !relative(SRC, f).startsWith("dev"))
      .flatMap((f) => hardcodedFrench(readFileSync(f, "utf8")).map((l) => `${relative(SRC, f)}:${l}`));
    expect(offenders).toEqual([]);
  });

  it("chaque commande a un libellé traduit", () => {
    const ids = sourceFiles(join(SRC, "app", "commands"))
      .map((f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n"))
      .flatMap((s) => [...s.matchAll(/^\s+id: "([^"]+)",\n(?!\s+label)/gm)].map((m) => m[1]!));
    expect(ids.length).toBeGreaterThan(50);
    expect(ids.filter((id) => !(`cmd.${id}` in base))).toEqual([]);
  });
});
