import { beforeAll, describe, expect, it } from "vitest";
import { fixturesLinked } from "../catalog/fixtures";
import { readFixtureZipEntries } from "../verify/fixtureRuntime";
import { BASE_STYLE_FILES, extractBaseStyles, SETTINGS_PAGE } from "./extractBaseStyles";
import type { BaseStyleRule, BaseStyles } from "./types";

let styles: BaseStyles;

function bySelector(selector: string): BaseStyleRule[] {
  return styles.rules.filter((r) => r.selector === selector);
}

describe.skipIf(!fixturesLinked())("styles de base du jeu (feuilles vanilla)", () => {
  beforeAll(async () => {
    const byZip = new Map<string, string[]>();
    for (const [zip, path] of [...BASE_STYLE_FILES, ["gui.zip", SETTINGS_PAGE] as const]) {
      byZip.set(zip, [...(byZip.get(zip) ?? []), path]);
    }
    const contents = new Map<string, Record<string, string>>();
    for (const [zip, paths] of byZip) contents.set(zip, await readFixtureZipEntries(zip, paths));
    styles = await extractBaseStyles(async (zip, path) => contents.get(zip)?.[path] ?? null);
  }, 60_000);

  it("extrait les règles des trois feuilles (≈ 400 appels a(…), sélecteurs à virgules éclatés)", () => {
    expect(styles.rules.length).toBeGreaterThan(500);
    const files = new Set(styles.rules.map((r) => r.file));
    expect(files.size).toBe(3);
  });

  it("Slider!horizontal s’étire en largeur", () => {
    const g = bySelector("Slider!horizontal").map((r) => r.styleSheet.gravity).find(Boolean);
    expect(g).toEqual([-1, 0.5]);
  });

  it("ProgressBar a une hauteur de 20 et s’étire", () => {
    const sheets = bySelector("ProgressBar").map((r) => r.styleSheet);
    expect(sheets.some((s) => JSON.stringify(s.size) === JSON.stringify([-1, 20]))).toBe(true);
  });

  it("TextView reçoit une couleur de la palette default_colors", () => {
    const withColor = styles.rules.filter(
      (r) => r.levels.at(-1)?.element === "TextView" && Array.isArray(r.styleSheet.color),
    );
    expect(withColor.length).toBeGreaterThan(0);
  });

  it("extrait la palette nommée et les transparences du jeu", () => {
    const names = styles.palette?.colors.map((c) => c.name) ?? [];
    expect(names).toContain("AccentMedium");
    expect(names).toContain("Invisible");
    expect(names.some((n) => n.startsWith("Debug"))).toBe(false);
    expect(styles.palette?.colors.find((c) => c.name === "NeutralLightest")?.rgba).toEqual([1, 1, 1, 1]);
    expect(styles.palette?.transparency.map((t) => t.name)).toContain("Medium");
  });

  it("lit les résolutions plein écran du menu Options", () => {
    const list = styles.resolutions ?? [];
    expect(list.length).toBeGreaterThan(10);
    expect(list).toContainEqual({ w: 1920, h: 1080 });
    expect(list).toContainEqual({ w: 3440, h: 1440 });
  });
});
