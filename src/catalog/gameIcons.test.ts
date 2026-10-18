import { describe, expect, it } from "vitest";
import { buildGameIcons, filterGameIcons, gamePathOf, groupGameIcons, minimumImportEntries } from "./gameIcons";

const entry = (path: string, w: number, mask = true) => ({
  path,
  png: `images/${path.replace(/\.tga$/, ".png")}`,
  width: w,
  height: w,
  mask,
});

describe("icônes du jeu importées", () => {
  it("chemin du jeu sans @2x, comme le vanilla", () => {
    expect(gamePathOf("gui/hud/icons/bus@2x.tga")).toBe("::/gui/hud/icons/bus.tga");
    expect(gamePathOf("gui/menu/x.tga")).toBe("::/gui/menu/x.tga");
  });

  it("une icône par image, la @2x gardée et ramenée à la taille d’interface", () => {
    const icons = buildGameIcons([
      entry("gui/hud/icons/bus.tga", 16),
      entry("gui/hud/icons/bus@2x.tga", 32),
      entry("gui/menu/design/bg.tga", 256, false),
    ]);
    expect(icons).toHaveLength(2);
    const bus = icons.find((i) => i.name === "bus")!;
    expect(bus).toMatchObject({ gamePath: "::/gui/hud/icons/bus.tga", folder: "gui/hud/icons", width: 16 });
    expect(bus.png).toContain("@2x");
  });

  it("sections : dossiers d’interface, contenus du jeu réunis, sections d’une image dans « Autres »", () => {
    const icons = buildGameIcons([
      entry("gui/hud/icons/bus.tga", 16),
      entry("gui/hud/design/bar.tga", 16),
      entry("gui/menu/x.tga", 16),
      entry("gui/Construction/a.tga", 16),
      entry("gui/Construction/b.tga", 16),
      entry("climates/temperate/sky.tga", 64, false),
      entry("mission/m1/map.tga", 64, false),
      entry("gui/guidesystem/only.tga", 16),
    ]);
    const groups = groupGameIcons(icons);
    // Ordre alphabétique sans tenir compte de la casse, « Autres » en dernier ;
    // les sections d’une seule image (menu, guidesystem) vont dans « Autres ».
    expect(groups.map((g) => [g.title, g.count])).toEqual([
      ["Construction", 2],
      ["Contenus du jeu", 2],
      ["hud", 2],
      ["Autres", 2],
    ]);
    const others = groups.find((g) => g.title === "Autres")!;
    expect(others.subgroups.map((s) => s.title)).toEqual(["guidesystem", "menu"]);
    const nonUi = groups.find((g) => g.title === "Contenus du jeu")!;
    expect(nonUi.subgroups.map((s) => s.title)).toEqual(["climates/temperate", "mission/m1"]);
    expect(filterGameIcons(icons, "BUS").map((i) => i.name)).toEqual(["bus"]);
  });

  it("import minimum : seulement les images des styles présentes dans le jeu", () => {
    const available = [
      { source: "base/content/gui.zip", entry: "gui/builtin/a@2x.tga" },
      { source: "base/content/gui.zip", entry: "gui/builtin/b@2x.tga" },
    ];
    expect(minimumImportEntries(available, ["::/gui/builtin/a.tga"])).toEqual([available[0]]);
  });
});
