import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManualHelperComponents } from "./overrides";
import { mergeHelperComponents } from "./parseTealDefs";
import type { Catalog } from "./types";

const here = dirname(fileURLToPath(import.meta.url));

/** Charge catalog.generated.json + entrées manuelles (AbsoluteLayout, helpers). */
export function loadMergedCatalogFromDisk(): Catalog | null {
  try {
    const raw = readFileSync(join(here, "catalog.generated.json"), "utf8");
    const base = JSON.parse(raw) as Catalog;
    return mergeHelperComponents(base, buildManualHelperComponents());
  } catch {
    return null;
  }
}
