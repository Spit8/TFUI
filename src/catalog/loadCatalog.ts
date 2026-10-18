import {
  COMPONENT_OVERRIDES,
  componentNotes,
  resolveCategory,
  resolveStatus,
  WHITELIST_ORDER,
} from "./overrides";
import type { Catalog, ResolvedComponent } from "./types";

export function resolveCatalog(catalog: Catalog): ResolvedComponent[] {
  const whitelist = new Set(WHITELIST_ORDER);
  return catalog.components.map((comp) => {
    const ov = COMPONENT_OVERRIDES[comp.name];
    return {
      ...comp,
      category: resolveCategory(comp.name),
      status: resolveStatus(comp.name),
      // Traduites à la lecture (langue courante).
      get notes() {
        return componentNotes(comp.name);
      },
      icon: ov?.icon,
      defaults: ov?.defaults ?? {},
      ugRequire: ov?.ugRequire,
      helperExport: ov?.helperExport,
      inWhitelist: whitelist.has(comp.name),
    };
  });
}

export function findComponent(
  catalog: Catalog,
  name: string,
): ResolvedComponent | undefined {
  return resolveCatalog(catalog).find((c) => c.name === name);
}

export function sortWhitelistFirst(
  components: ResolvedComponent[],
): ResolvedComponent[] {
  const order = new Map(WHITELIST_ORDER.map((n, i) => [n, i]));
  return [...components].sort((a, b) => {
    const ai = order.get(a.name);
    const bi = order.get(b.name);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}
