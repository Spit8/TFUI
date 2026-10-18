import { describe, expect, it } from "vitest";
import { decodeTga, tintRgba } from "./tga";

function header(type: number, w: number, h: number, bpp: number, descriptor = 0): number[] {
  return [0, 0, type, 0, 0, 0, 0, 0, 0, 0, 0, 0, w, 0, h, 0, bpp, descriptor];
}

describe("décodage TGA", () => {
  it("niveaux de gris bruts, origine en bas : le gris devient l’opacité", () => {
    // 2×2 ; lignes stockées du bas vers le haut.
    const t = decodeTga(new Uint8Array([...header(3, 2, 2, 8), 10, 20, 30, 40]));
    expect(t.gray).toBe(true);
    expect([...t.rgba.filter((_, i) => i % 4 === 3)]).toEqual([30, 40, 10, 20]);
    expect(t.rgba[0]).toBe(255);
  });

  it("niveaux de gris RLE, origine en haut", () => {
    // paquet répété ×3 (0x82, valeur 7) puis brut ×1 (0x00, valeur 9)
    const t = decodeTga(new Uint8Array([...header(11, 2, 2, 8, 0x20), 0x82, 7, 0x00, 9]));
    expect([...t.rgba.filter((_, i) => i % 4 === 3)]).toEqual([7, 7, 7, 9]);
  });

  it("couleur 32 bits BGRA", () => {
    const t = decodeTga(new Uint8Array([...header(2, 1, 1, 32, 0x20), 1, 2, 3, 4]));
    expect([...t.rgba]).toEqual([3, 2, 1, 4]);
  });

  it("refuse un type inconnu", () => {
    expect(() => decodeTga(new Uint8Array(header(1, 1, 1, 8)))).toThrow();
  });

  it("teinte : la couleur multiplie l’image", () => {
    const out = tintRgba(new Uint8ClampedArray([255, 255, 255, 200]), [0.5, 0, 1, 0.5]);
    expect([...out]).toEqual([128, 0, 255, 100]);
  });
});
