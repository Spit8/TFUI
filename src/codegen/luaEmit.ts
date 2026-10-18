/** Indent with tabs (vanilla TF3 style). */
export function indent(level: number): string {
  return "\t".repeat(level);
}

export function escapeString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

export function emitString(value: string): string {
  return `"${escapeString(value)}"`;
}

export function emitNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Object.is(value, -0)) return "0";
  // Avoid scientific notation for typical UI numbers
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return String(value);
  }
  const s = value.toFixed(10).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

export function emitBoolean(value: boolean): string {
  return value ? "true" : "false";
}

export function emitArray(values: number[], multiline = false, level = 0): string {
  if (!multiline || values.length <= 4) {
    return `{ ${values.map(emitNumber).join(", ")} }`;
  }
  const inner = values.map((v) => `${indent(level + 1)}${emitNumber(v)},`).join("\n");
  return `{\n${inner}\n${indent(level)}}`;
}

export function emitLuaLiteral(
  value: string | number | boolean | number[] | null,
): string {
  if (value === null) return "nil";
  if (typeof value === "string") return emitString(value);
  if (typeof value === "boolean") return emitBoolean(value);
  if (typeof value === "number") return emitNumber(value);
  return emitArray(value);
}

export function joinLines(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

/** Accès vanilla à la palette du jeu (`default_colors.gres`). */
export const PALETTE_ACCESS =
  'api.gui.genericRep.get(api.gui.genericRep.find("::/gui/main/default_colors.gres")).data';

/**
 * Couleur de palette : `base.Name`, ou `{ base.Name[1], base.Name[2],
 * base.Name[3], alpha }` quand la transparence est remplacée (sans
 * dépendre de `color_util.tl`).
 */
export function emitPaletteColor(name: string, alpha: number | undefined, base: string): string {
  const ref = `${base}.${name}`;
  if (alpha === undefined) return ref;
  return `{ ${ref}[1], ${ref}[2], ${ref}[3], ${emitNumber(alpha)} }`;
}
