import type { Catalog } from "./types";
import { t } from "../i18n";

/** Catalogue actif pour factory / store / codegen (posé par App au chargement). */
let activeCatalog: Catalog | null = null;

export function setActiveCatalog(catalog: Catalog | null): void {
  activeCatalog = catalog;
}

export function getActiveCatalog(): Catalog | null {
  return activeCatalog;
}

export function requireActiveCatalog(): Catalog {
  if (!activeCatalog) {
    throw new Error(t("catalogErrors.notLoaded"));
  }
  return activeCatalog;
}
