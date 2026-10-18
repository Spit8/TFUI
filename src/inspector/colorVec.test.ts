import { describe, expect, it } from "vitest";
import { hexToRgba, rgbaToHex } from "./colorVec";

describe("colorVec", () => {
  it("round-trip blanc et rouge", () => {
    expect(rgbaToHex([1, 1, 1, 1])).toBe("#ffffff");
    expect(rgbaToHex([1, 0, 0, 1])).toBe("#ff0000");
    const back = hexToRgba("#00ff00", 0.5);
    expect(back[0]).toBeCloseTo(0);
    expect(back[1]).toBeCloseTo(1);
    expect(back[2]).toBeCloseTo(0);
    expect(back[3]).toBeCloseTo(0.5);
  });
});

describe("TSV", () => {
  it("aller-retour sur quelques couleurs", async () => {
    const { hsvToRgb, rgbToHsv } = await import("./colorVec");
    const samples: [number, number, number][] = [[1, 0, 0], [0.2, 0.4, 0.6], [1, 1, 1], [0, 0, 0], [0.135, 0.1575, 0.18]];
    for (const c of samples) {
      const [h, s, v] = rgbToHsv(c[0], c[1], c[2]);
      const back = hsvToRgb(h, s, v);
      back.forEach((n, i) => expect(n).toBeCloseTo(c[i]!, 6));
    }
    expect(rgbToHsv(0, 0, 1)[0]).toBeCloseTo(240);
  });
});
