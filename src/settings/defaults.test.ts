import { describe, expect, it } from "vitest";
import { DEFAULT_PREVIEW_APPEARANCE, DEFAULT_SETTINGS } from "./defaults";
import { mergeSettings } from "./settingsStore";

describe("DEFAULT_SETTINGS", () => {
  it("propose l’installation Steam par défaut", () => {
    expect(DEFAULT_SETTINGS.tf3Root).toContain("steamapps\\common\\Transport Fever 3");
  });

  it("laisse le dossier staging à renseigner (propre à chaque installation)", () => {
    expect(DEFAULT_SETTINGS.stagingArea).toBe("");
  });
});

describe("mergeSettings", () => {
  it("retombe sur les defaults si entrée invalide", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings("x")).toEqual(DEFAULT_SETTINGS);
  });

  it("conserve les champs valides", () => {
    expect(
      mergeSettings({
        tf3Root: "D:\\Games\\TF3",
        stagingArea: "D:\\staging",
      }),
    ).toEqual({
      tf3Root: "D:\\Games\\TF3",
      stagingArea: "D:\\staging",
      density: "compact",
      recentProjects: [],
      lastOpenProject: null,
      openProjects: [],
      previewShowBoxes: false,
      previewBackground: "solid",
      previewBackgroundImage: null,
      previewBackgroundImages: {},
      previewAppearance: DEFAULT_PREVIEW_APPEARANCE,
      previewTextScale: "game",
      gameImportMode: "ui",
      language: "system",
    });
  });

  it("mémorise le fond de l’aperçu", () => {
    const s = mergeSettings({ previewBackground: "image", previewBackgroundImage: "cap.png" });
    expect(s.previewBackground).toBe("image");
    expect(s.previewBackgroundImage).toBe("cap.png");
    expect(mergeSettings({ previewBackground: "flou" }).previewBackground).toBe("solid");
  });

  it("couleurs de l’aperçu : valeurs invalides remplacées par le défaut", () => {
    const a = mergeSettings({
      previewAppearance: { hoverFill: [1, 0, 0, 0.5], boxOutline: [2, 0, 0, 1], selectedWidth: 3 },
    }).previewAppearance;
    expect(a.hoverFill).toEqual([1, 0, 0, 0.5]);
    expect(a.boxOutline).toEqual(DEFAULT_PREVIEW_APPEARANCE.boxOutline);
    expect(a.selectedWidth).toBe(3);
    expect(mergeSettings({ previewAppearance: { selectedWidth: 40 } }).previewAppearance.selectedWidth).toBe(2);
  });

  it("mémorise une image de fond par format d’écran", () => {
    const s = mergeSettings({ previewBackgroundImages: { "16:9": "a.png", "21:9": "", "4:3": 3 } });
    expect(s.previewBackgroundImages).toEqual({ "16:9": "a.png" });
    expect(mergeSettings({}).previewBackgroundImages).toEqual({});
  });

  it("mémorise l’option Box de l’aperçu", () => {
    expect(mergeSettings({ previewShowBoxes: true }).previewShowBoxes).toBe(true);
    expect(mergeSettings({ previewShowBoxes: "oui" }).previewShowBoxes).toBe(false);
  });

  it("conserve le dernier projet ouvert", () => {
    expect(mergeSettings({ lastOpenProject: "a.tfui.json" }).lastOpenProject).toBe(
      "a.tfui.json",
    );
    expect(mergeSettings({ lastOpenProject: "" }).lastOpenProject).toBeNull();
  });

  it("accepte density normal", () => {
    expect(mergeSettings({ density: "normal" }).density).toBe("normal");
  });

  it("conserve les projets récents", () => {
    expect(
      mergeSettings({ recentProjects: ["a.tfui.json", "b.tfui.json"] })
        .recentProjects,
    ).toEqual(["a.tfui.json", "b.tfui.json"]);
  });
});
