import { describe, expect, it } from "vitest";
import { gameSettingsPath, parseGameFontScale } from "./gameUserSettings";

describe("réglages du joueur (settings.lua du jeu)", () => {
  it("lit la taille du texte", () => {
    expect(parseGameFontScale('\t\tfontScaleClass = "SMALL",\n')).toBe("small");
    expect(parseGameFontScale('fontScaleClass = "medium"')).toBe("medium");
    expect(parseGameFontScale('fontScaleClass = "100"')).toBe("large");
    expect(parseGameFontScale("rien")).toBeNull();
  });

  it("trouve settings.lua à côté de staging_area", () => {
    expect(gameSettingsPath("C:\\Jeu\\local\\staging_area")).toBe("C:\\Jeu\\local\\settings.lua");
    expect(gameSettingsPath("/home/x/local/staging_area/")).toBe("/home/x/local/settings.lua");
  });
});
