import { applyFieldCorrections } from "./fieldCorrections";
import type {
  Catalog,
  CatalogComponent,
  CatalogField,
  FieldKind,
} from "./types";

const FIELD_LINE =
  /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+?)(?:\s*--\s*(.*))?$/;
const RECORD_START =
  /^\s*(?:global\s+)?record\s+([A-Za-z_][A-Za-z0-9_]*)\b/;
/** Teal blocks closed by `end` that are not records (must still push a frame). */
const BLOCK_START =
  /^\s*(?:global\s+)?(interface|enum|macroexp)\s+([A-Za-z_][A-Za-z0-9_]*)\b/;
const RECIPE_DECL =
  /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*Recipe(?:WithApi)?\s*<\s*([A-Za-z_][A-Za-z0-9_.]*)/;
// Commentaire de fin de ligne toléré : builtin.d.tl documente ainsi
// `Overflow : FloatingLayoutOverflowMode -- this mode will ignore…`.
const ENUM_VALUE =
  /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:--.*)?$/;

/**
 * À incrémenter à chaque changement du résultat de `parseBuiltinTeal` (parseur
 * ou `fieldCorrections`) : un catalogue en cache d’une version antérieure est
 * reconstruit au démarrage.
 */
export const CATALOG_PARSER_VERSION = 4;

/** Catalogue produit par une version antérieure du parseur. */
export function isCatalogOutdated(catalog: Catalog): boolean {
  return catalog.parserVersion !== CATALOG_PARSER_VERSION;
}

export function classifyTealType(tealType: string): {
  kind: FieldKind;
  enumName?: string;
} {
  const t = tealType.trim().replace(/\s+is\s+.+$/, "").trim();

  if (t === "string") return { kind: "string" };
  if (t === "number") return { kind: "number" };
  if (t === "integer") return { kind: "integer" };
  if (t === "boolean") return { kind: "boolean" };
  if (t === "TreeNodeId") return { kind: "slot-single" };
  if (t === "{TreeNodeId}") return { kind: "slot-multi" };
  if (/^function\b/.test(t)) return { kind: "handler" };
  if (t === "Vec2f") return { kind: "vec2f" };
  if (t === "Vec3f") return { kind: "vec3f" };
  if (t === "Vec4f") return { kind: "vec4f" };
  if (t === "Vec2i") return { kind: "vec2i" };

  // `integer|number|string` (valeur d’un ComboBoxItem / TabWidgetChild…).
  if (/^(?:integer|number|string)(?:\s*\|\s*(?:integer|number|string))+$/.test(t)) return { kind: "scalar" };
  if (t === "{number}" || t === "{integer}") return { kind: "number-list" };

  const typeEnum = t.match(/^Type\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (typeEnum) {
    return { kind: "enum", enumName: typeEnum[1] };
  }

  return { kind: "unsupported" };
}

type FrameKind = "builtin" | "type" | "enum" | "param" | "other";

interface Frame {
  name: string;
  kind: FrameKind;
  fields: CatalogField[];
  enumValues: string[];
}

function parseFieldLine(line: string): CatalogField | null {
  const m = line.match(FIELD_LINE);
  if (!m) return null;
  const name = m[1];
  if (name === "userdata") return null;
  const typePart = m[2].trim().replace(/\s+is\s+.+$/, "").trim();
  const comment = m[3]?.trim();
  const { kind, enumName } = classifyTealType(typePart);
  return {
    name,
    tealType: typePart,
    kind,
    ...(enumName ? { enumName } : {}),
    ...(comment ? { comment } : {}),
  };
}

function frameKindFor(name: string, parent: Frame | undefined): FrameKind {
  if (name === "Builtin") return "builtin";
  if (name === "Type" && parent?.kind === "builtin") return "type";
  if (parent?.kind === "type" || parent?.kind === "enum") return "enum";
  if (name.endsWith("Param")) return "param";
  return "other";
}

export function parseBuiltinTeal(source: string, sourceHash: string): Catalog {
  const lines = source.split(/\r?\n/);
  const stack: Frame[] = [];
  const paramRecords = new Map<string, CatalogField[]>();
  const enums: Record<string, string[]> = {};
  const recipes: { name: string; paramRecord: string }[] = [];

  const inBuiltin = () => stack.some((f) => f.kind === "builtin");
  const inType = () => stack.some((f) => f.kind === "type");
  const top = () => stack[stack.length - 1];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("--")) {
      continue;
    }

    const recordMatch = trimmed.match(RECORD_START);
    if (recordMatch) {
      const name = recordMatch[1];
      const kind = frameKindFor(name, top());
      stack.push({ name, kind, fields: [], enumValues: [] });
      continue;
    }

    const blockMatch = trimmed.match(BLOCK_START);
    if (blockMatch) {
      stack.push({
        name: blockMatch[2],
        kind: "other",
        fields: [],
        enumValues: [],
      });
      continue;
    }

    if (trimmed === "end" || trimmed.startsWith("end ")) {
      const closed = stack.pop();
      if (!closed) continue;
      if (closed.kind === "enum" && closed.enumValues.length > 0) {
        enums[closed.name] = closed.enumValues;
      } else if (closed.kind === "param" || closed.name.endsWith("Param")) {
        paramRecords.set(closed.name, closed.fields);
      } else if (closed.kind === "other" && closed.fields.length > 0) {
        // Keep non-Param records that look like param bags (e.g. some helpers)
        if (closed.name.endsWith("Param") || /Param$/.test(closed.name)) {
          paramRecords.set(closed.name, closed.fields);
        }
      }
      continue;
    }

    if (!inBuiltin()) {
      continue;
    }

    const recipe = trimmed.match(RECIPE_DECL);
    if (recipe && !inType() && top()?.kind === "builtin") {
      const paramRecord = recipe[2].includes(".")
        ? recipe[2].split(".").pop()!
        : recipe[2];
      recipes.push({ name: recipe[1], paramRecord });
      continue;
    }

    const current = top();
    if (!current || current.kind === "builtin" || current.kind === "type") {
      continue;
    }

    if (current.kind === "enum") {
      const ev = trimmed.match(ENUM_VALUE);
      // Orientation { Horizontal : Orientation, Vertical : Orientation }
      if (ev && ev[2] === current.name) {
        current.enumValues.push(ev[1]);
      }
      continue;
    }

    const field = parseFieldLine(raw);
    if (field) {
      current.fields.push(field);
    }
  }

  const components: CatalogComponent[] = [];
  const seen = new Set<string>();
  for (const recipe of recipes) {
    if (seen.has(recipe.name)) continue;
    seen.add(recipe.name);
    components.push({
      name: recipe.name,
      paramRecord: recipe.paramRecord,
      fields: paramRecords.get(recipe.paramRecord) ?? [],
      source: "builtin",
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceHash,
    parserVersion: CATALOG_PARSER_VERSION,
    enums,
    components,
  };
}

export function mergeHelperComponents(
  catalog: Catalog,
  helpers: CatalogComponent[],
): Catalog {
  const names = new Set(catalog.components.map((c) => c.name));
  const extra = helpers.filter((h) => !names.has(h.name));
  return {
    ...catalog,
    // Champs mal typés dans builtin.d.tl, corrigés d’après le code vanilla.
    components: applyFieldCorrections([...catalog.components, ...extra]),
  };
}
