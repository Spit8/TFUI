import type { CatalogField } from "../catalog/types";
import type { PropValue } from "../model/types";
import { t } from "../i18n";

/** Props section: exclude structural slots and styleSheet (Meta/Style only). */
export function isEditablePropField(field: CatalogField): boolean {
  if (field.kind === "slot-single" || field.kind === "slot-multi") {
    return false;
  }
  if (field.name === "styleSheet" || field.name.toLowerCase() === "stylesheet") {
    return false;
  }
  return true;
}

export function filterPropFields(fields: CatalogField[]): CatalogField[] {
  return fields.filter(isEditablePropField);
}

export interface PropListFilter {
  /** Recherche texte (nom + commentaire). */
  query?: string;
  /** N’afficher que les props présentes sur le nœud. */
  definedOnly?: boolean;
  props?: Record<string, PropValue | undefined>;
}

/** Filtre editable + recherche + « définies seulement ». */
export function filterPropFieldsList(
  fields: CatalogField[],
  opts: PropListFilter = {},
): CatalogField[] {
  let list = filterPropFields(fields);
  const q = opts.query?.trim().toLowerCase() ?? "";
  if (q) {
    list = list.filter((f) => {
      const hay = `${f.name} ${f.comment ?? ""} ${f.tealType}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (opts.definedOnly && opts.props) {
    const props = opts.props;
    list = list.filter((f) => props[f.name] !== undefined);
  }
  return list;
}

/** Clamp / validate initialX/Y (normalized 0..1). */
export function clampInitialXY(
  fieldName: string,
  value: number,
): { ok: true; value: number } | { ok: false; message: string } {
  if (fieldName !== "initialX" && fieldName !== "initialY") {
    return { ok: true, value };
  }
  if (Number.isNaN(value)) {
    return { ok: false, message: t("propEditor.mustBeNumber", { field: fieldName }) };
  }
  if (value < 0 || value > 1) {
    return {
      ok: false,
      message: t("propEditor.outOfRange", { field: fieldName, value }),
    };
  }
  return { ok: true, value };
}
