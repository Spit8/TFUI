import { join } from "node:path";
import { open } from "yauzl-promise";
import { beforeAll, describe, expect, it } from "vitest";
import { buildStyleVocabulary } from "../catalog/extractStyleVocabulary";
import { FIXTURES_SKIP_MESSAGE, fixturesBaseContent, fixturesLinked } from "../catalog/fixtures";
import type { StyleVocabulary } from "../catalog/types";
import { createEmptyProject } from "./factory";
import { createModScaffoldProject } from "./modProject";
import { allowedStyleKeys } from "./styleKeys";
import { validateProject } from "./validate";

/** Toutes les feuilles `.css.lua` d’une archive du jeu lié. Tests seulement. */
async function readCssLua(zipName: string): Promise<{ path: string; content: string }[]> {
  const out: { path: string; content: string }[] = [];
  const zip = await open(join(fixturesBaseContent(), zipName));
  try {
    for await (const entry of zip) {
      const name = entry.filename.replace(/\\/g, "/");
      if (!name.endsWith(".css.lua")) continue;
      const chunks: Buffer[] = [];
      for await (const chunk of await entry.openReadStream()) chunks.push(chunk as Buffer);
      out.push({ path: name, content: Buffer.concat(chunks).toString("utf8") });
    }
  } finally {
    await zip.close();
  }
  return out;
}

describe.skipIf(!fixturesLinked())("propriétés de style par type (feuilles du jeu)", () => {
  let vocab: StyleVocabulary;
  beforeAll(async () => {
    vocab = buildStyleVocabulary(await readCssLua("gui.zip"));
  });

  it(FIXTURES_SKIP_MESSAGE, () => {
    expect(vocab.scannedFiles).toBeGreaterThan(30);
  });

  it("TextView a textAlignment ; BoxLayout ne l’a pas, et n’a padding que par le socle", () => {
    expect(vocab.keysByElement?.TextView).toContain("textAlignment");
    expect(allowedStyleKeys("BoxLayout", vocab).keys.has("textAlignment")).toBe(false);
    expect(vocab.keysByElement?.BoxLayout).not.toContain("padding");
    expect(allowedStyleKeys("BoxLayout", vocab).keys.get("padding")).toBe("common");
    expect(vocab.keysByElement?.["Window::Content"]).toContain("padding");
    // Champs imbriqués de 9-patch : jamais des propriétés.
    expect(vocab.styleKeys).not.toContain("fileName");
  });

  it("les projets de départ ne déclenchent aucun avertissement de propriété", () => {
    for (const p of [createEmptyProject(), createModScaffoldProject({ modId: "demo_mod", displayName: "Demo" })]) {
      expect(validateProject(p, null, vocab).filter((i) => i.code === "style_key_not_allowed")).toEqual([]);
    }
  });
});
