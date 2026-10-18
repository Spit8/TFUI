/** Image 9-patch d’un style du jeu : `{ fileName, horizontal, vertical }`. */
export interface NinePatchSpec {
  fileName: string;
  /** Repères x (échelle 1) : bord gauche, fin du coin gauche, début du coin droit, bord droit. */
  horizontal: number[];
  vertical: number[];
}

export function asNinePatch(value: unknown): NinePatchSpec | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const nums = (x: unknown) => Array.isArray(x) && x.length === 4 && x.every((n) => typeof n === "number");
  if (typeof v.fileName !== "string" || v.fileName === "" || !nums(v.horizontal) || !nums(v.vertical)) return null;
  return { fileName: v.fileName, horizontal: v.horizontal as number[], vertical: v.vertical as number[] };
}
