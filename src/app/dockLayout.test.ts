import { describe, expect, it } from "vitest";
import { PANEL_TITLES } from "./dockLayout";

describe("PANEL_TITLES", () => {
  it("couvre les panneaux de l’éditeur", () => {
    expect(Object.keys(PANEL_TITLES).sort()).toEqual(
      ["code", "gameIcons", "inspector", "palette", "preview", "problems", "styles", "tree"].sort(),
    );
  });
});
