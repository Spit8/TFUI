/** Résolution d’écran simulée. */
export interface Resolution {
  w: number;
  h: number;
}

/**
 * Repli tant que la liste du jeu n’a pas été extraite (re-scan) : la liste
 * réelle vient de `gui/menu/settings_page.tl` (`fullscreenSizes`).
 */
export const FALLBACK_RESOLUTIONS: Resolution[] = [
  { w: 1280, h: 720 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
  { w: 3840, h: 2160 },
];

/** Formats d’écran usuels, du plus étroit au plus large. */
const NAMED_RATIOS: { label: string; value: number }[] = [
  { label: "5:4", value: 5 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "16:10", value: 16 / 10 },
  { label: "16:9", value: 16 / 9 },
  { label: "21:9", value: 64 / 27 },
  { label: "32:9", value: 32 / 9 },
];

/**
 * Format d’une résolution (« 16:9 », « 21:9 »…). Les écrans « 21:9 » réels
 * vont de 2.33 à 2.39 (2560×1080, 3440×1440) ; 1366×768 est un 16:9.
 */
export function aspectLabel(w: number, h: number): string {
  const r = w / h;
  let best = NAMED_RATIOS[0]!;
  for (const n of NAMED_RATIOS) {
    if (Math.abs(n.value - r) < Math.abs(best.value - r)) best = n;
  }
  if (Math.abs(best.value - r) / best.value <= 0.04) return best.label;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

/** Résolutions plein écran déclarées par le menu Options du jeu. */
export function parseGameResolutions(settingsPageSource: string): Resolution[] {
  const block = settingsPageSource.match(/fullscreenSizes\s*=\s*\{([\s\S]*?)\n\s*\}/);
  if (!block) return [];
  const out: Resolution[] = [];
  for (const m of block[1]!.matchAll(/Vec2i\.new\(\s*(\d+)\s*,\s*(\d+)\s*\)/g)) {
    out.push({ w: Number(m[1]), h: Number(m[2]) });
  }
  return out;
}

/** Résolutions groupées par format, formats du plus étroit au plus large. */
export function groupByAspect(list: Resolution[]): { label: string; items: Resolution[] }[] {
  const groups = new Map<string, Resolution[]>();
  for (const r of list) {
    const label = aspectLabel(r.w, r.h);
    groups.set(label, [...(groups.get(label) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([label, items]) => ({ label, items: items.sort((a, b) => a.w - b.w || a.h - b.h) }))
    .sort((a, b) => a.items[0]!.w / a.items[0]!.h - b.items[0]!.w / b.items[0]!.h);
}
