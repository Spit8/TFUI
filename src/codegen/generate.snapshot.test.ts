import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { TfuiProject } from "../model/types";
import { generateProject } from "./generate";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../tests/reference-mod");

describe("generate snapshots", () => {
  it("snapshot script + css", () => {
    const project = JSON.parse(
      readFileSync(join(dir, "project.tfui.json"), "utf8"),
    ) as TfuiProject;
    const files = generateProject(project);
    for (const file of files) {
      expect(file.content).toMatchSnapshot(file.path);
    }
  });
});
