import { describe, expect, it } from "vitest";
import { aspectLabel, groupByAspect, parseGameResolutions } from "./screenRatio";

describe("formats d’écran", () => {
  it("nomme les formats usuels, y compris les 21:9 réels", () => {
    expect(aspectLabel(1920, 1080)).toBe("16:9");
    expect(aspectLabel(1366, 768)).toBe("16:9");
    expect(aspectLabel(1920, 1200)).toBe("16:10");
    expect(aspectLabel(2880, 1800)).toBe("16:10");
    expect(aspectLabel(1024, 768)).toBe("4:3");
    expect(aspectLabel(1280, 1024)).toBe("5:4");
    expect(aspectLabel(2560, 1080)).toBe("21:9");
    expect(aspectLabel(3440, 1440)).toBe("21:9");
    expect(aspectLabel(5120, 1440)).toBe("32:9");
    expect(aspectLabel(1000, 1000)).toBe("1:1");
  });

  it("lit la liste fullscreenSizes (forme du menu Options du jeu)", () => {
    const src = `
\t\tlocal fullscreenSizes = {
\t\t\tapi.type.Vec2i.new(1280, 720),
\t\t\tapi.type.Vec2i.new(2560, 1080),
\t\t\tapi.type.Vec2i.new(1920, 1080)
\t\t}
\t\tlocal other = { api.type.Vec2i.new(1, 1) }`;
    expect(parseGameResolutions(src)).toEqual([
      { w: 1280, h: 720 },
      { w: 2560, h: 1080 },
      { w: 1920, h: 1080 },
    ]);
    expect(parseGameResolutions("rien")).toEqual([]);
  });

  it("groupe par format, du plus étroit au plus large", () => {
    const groups = groupByAspect([
      { w: 2560, h: 1080 },
      { w: 1920, h: 1080 },
      { w: 1280, h: 720 },
      { w: 1024, h: 768 },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["4:3", "16:9", "21:9"]);
    expect(groups[1]!.items.map((r) => r.w)).toEqual([1280, 1920]);
  });
});
