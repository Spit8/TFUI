import type { CatalogField, FieldKind } from "../catalog/types";

/** Préfixes d’axe pour les champs vectoriels (§3.7). */
export function axisPrefixesForField(field: CatalogField): string[] {
  const name = field.name.toLowerCase();
  const kind = field.kind;
  const len = vecLen(kind);
  if (len === 0) return [];

  if (isColorField(field)) {
    return ["r", "g", "b", "a"].slice(0, len);
  }
  if (
    name.includes("spacing") ||
    name.includes("margin") ||
    name.includes("padding") ||
    name === "outerspacing" ||
    name === "innerspacing"
  ) {
    if (len === 4) return ["t", "r", "b", "l"];
    if (len === 2) return ["x", "y"];
  }
  if (name === "size" || name.endsWith("size") || name.includes("extent")) {
    if (len >= 2) return ["w", "h"].concat(len > 2 ? ["z"] : []).slice(0, len);
  }
  if (len === 2) return ["x", "y"];
  if (len === 3) return ["x", "y", "z"];
  if (len === 4) return ["x", "y", "z", "w"];
  return Array.from({ length: len }, (_, i) => String(i));
}

export function isColorField(field: CatalogField): boolean {
  if (field.kind !== "vec4f" && field.kind !== "vec3f") return false;
  return /color/i.test(field.name);
}

export function vecLen(kind: FieldKind): number {
  if (kind === "vec4f") return 4;
  if (kind === "vec3f") return 3;
  if (kind === "vec2f" || kind === "vec2i") return 2;
  return 0;
}
