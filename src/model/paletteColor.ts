import type { PaletteColor } from "./types";

export function isPaletteColor(value: unknown): value is PaletteColor {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { kind?: unknown }).kind === "palette" &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

/** Nom Lua sûr pour `colorDefault.<name>` (identifiant simple). */
export function isPaletteName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

/**
 * RGBA (0..1) d’une couleur de style : littéral `{r,g,b[,a]}` ou référence
 * de palette résolue via `lookup` ; undefined si inconnue.
 */
export function colorToRgba(
  value: unknown,
  lookup: (name: string) => number[] | undefined,
): number[] | undefined {
  if (isPaletteColor(value)) {
    const base = lookup(value.name);
    if (!base || base.length < 3) return undefined;
    return [base[0]!, base[1]!, base[2]!, value.alpha ?? base[3] ?? 1];
  }
  if (Array.isArray(value) && value.length >= 3 && value.every((n) => typeof n === "number")) {
    return value.length >= 4 ? (value as number[]).slice(0, 4) : [...(value as number[]), 1];
  }
  return undefined;
}
