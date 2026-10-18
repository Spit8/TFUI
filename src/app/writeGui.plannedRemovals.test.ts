import { describe, expect, it } from "vitest";
import { createEmptyProject } from "../model/factory";
import { plannedRemovals } from "./writeGui";

describe("plannedRemovals (R5)", () => {
  it("ne propose que les fichiers de lastWrittenFiles absents du plan", () => {
    const project = createEmptyProject();
    project.lastWrittenFiles = [
      "main_gui.script.lua",
      "main_gui.css.lua",
      "old.res.lua",
      "readme.txt",
    ];
    expect(
      plannedRemovals(project, ["main_gui.script.lua", "main_gui.css.lua"]),
    ).toEqual(["old.res.lua"]);
  });

  it("sans lastWrittenFiles, aucune suppression", () => {
    const project = createEmptyProject();
    expect(plannedRemovals(project, ["main_gui.script.lua"])).toEqual([]);
  });
});
