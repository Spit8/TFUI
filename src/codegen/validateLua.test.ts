import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TfuiProject } from "../model/types";
import { generateProject } from "./generate";
import { validateGeneratedFiles } from "./validateLua";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../tests/reference-mod");

describe("validateLua", () => {
  it("parse tous les fichiers générés du reference-mod", () => {
    const project = JSON.parse(
      readFileSync(join(dir, "project.tfui.json"), "utf8"),
    ) as TfuiProject;
    const files = generateProject(project);
    expect(validateGeneratedFiles(files)).toEqual([]);
  });
});
