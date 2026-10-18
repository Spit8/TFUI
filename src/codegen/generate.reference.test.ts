import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TfuiProject } from "../model/types";
import { generateProject } from "./generate";
import { normalizeLua } from "./normalize";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../tests/reference-mod");

describe("reference-mod", () => {
  it("génère un code équivalent aux attendus (normalisé)", () => {
    const project = JSON.parse(
      readFileSync(join(dir, "project.tfui.json"), "utf8"),
    ) as TfuiProject;
    const files = generateProject(project);
    expect(files.map((f) => f.path).sort()).toEqual([
      "main_gui.css.lua",
      "main_gui.script.lua",
    ]);

    for (const file of files) {
      const expected = readFileSync(join(dir, "expected", file.path), "utf8");
      expect(normalizeLua(file.content)).toBe(normalizeLua(expected));
    }
  });
});
