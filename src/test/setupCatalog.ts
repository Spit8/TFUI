import { beforeAll } from "vitest";
import { setActiveCatalog } from "../catalog/activeCatalog";
import { loadMergedCatalogFromDisk } from "../catalog/loadMergedCatalog";

beforeAll(() => {
  const catalog = loadMergedCatalogFromDisk();
  if (catalog) setActiveCatalog(catalog);
});
