/** Conversion Vec4f 0..1 ↔ #rrggbb pour la pastille couleur (§3.7). */

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function rgbaToHex(rgba: number[]): string {
  const r = Math.round(clamp01(rgba[0] ?? 0) * 255);
  const g = Math.round(clamp01(rgba[1] ?? 0) * 255);
  const b = Math.round(clamp01(rgba[2] ?? 0) * 255);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Conserve alpha existant (défaut 1). */
export function hexToRgba(hex: string, alpha = 1): number[] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0, clamp01(alpha)];
  const n = Number.parseInt(m[1]!, 16);
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
    clamp01(alpha),
  ];
}

/** RVB 0..1 → TSV (teinte 0..360, saturation et valeur 0..1). */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** TSV → RVB 0..1. */
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
