import type { CatalogField } from "../catalog/types";
import type { PropValue } from "../model/types";
import { t } from "../i18n";

export type PropMode = "literal" | "enum" | "state" | "handler" | "lua";

export function modeOf(
  value: PropValue | undefined,
  field: CatalogField,
): PropMode {
  if (!value) {
    return field.kind === "enum"
      ? "enum"
      : field.kind === "handler"
        ? "handler"
        : "literal";
  }
  if (value.kind === "enum") return "enum";
  if (value.kind === "state") return "state";
  if (value.kind === "handler") return "handler";
  if (value.kind === "lua") return "lua";
  return "literal";
}

export function defaultForMode(mode: PropMode, field: CatalogField): PropValue {
  switch (mode) {
    case "enum":
      return { kind: "enum", value: "" };
    case "state":
      return { kind: "state", stateVar: "" };
    case "handler":
      return { kind: "handler", fn: "" };
    case "lua":
      return { kind: "lua", code: "" };
    default:
      if (field.kind === "boolean") return { kind: "literal", value: false };
      if (field.kind === "number" || field.kind === "integer") {
        return { kind: "literal", value: 0 };
      }
      if (
        field.kind === "vec2f" ||
        field.kind === "vec2i" ||
        field.kind === "vec3f" ||
        field.kind === "vec4f"
      ) {
        const len =
          field.kind === "vec4f" ? 4 : field.kind === "vec3f" ? 3 : 2;
        return { kind: "literal", value: Array.from({ length: len }, () => 0) };
      }
      return { kind: "literal", value: "" };
  }
}

export function modeIcon(mode: PropMode): string {
  switch (mode) {
    case "state":
      return "◉";
    case "handler":
      return "ƒ";
    case "lua":
      return "{}";
    case "enum":
      return "≡";
    default:
      return "=";
  }
}

export function modeLabel(mode: PropMode): string {
  switch (mode) {
    case "literal":
      return t("propEditor.modeLiteral");
    case "enum":
      return t("propEditor.modeEnum");
    case "state":
      return t("propEditor.modeState");
    case "handler":
      return t("propEditor.modeHandler");
    case "lua":
      return t("propEditor.modeLua");
  }
}

export function modesForField(field: CatalogField): PropMode[] {
  if (field.kind === "handler") return ["handler", "lua", "state"];
  if (field.kind === "enum") return ["enum", "state", "lua"];
  if (field.kind === "unsupported") return ["lua"];
  return ["literal", "state", "handler", "lua"];
}
