import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { BaseStyles } from "../gamestyle/types";
import { resolveCatalog, sortWhitelistFirst } from "./loadCatalog";
import type { Catalog, ResolvedComponent, StyleVocabulary } from "./types";

export interface CatalogContextValue {
  catalog: Catalog | null;
  vocabulary: StyleVocabulary | null;
  /** Styles de base du jeu (aussi lisibles hors React : gamestyle/activeBaseStyles). */
  baseStyles: BaseStyles | null;
  resolved: ResolvedComponent[];
}

const CatalogContext = createContext<CatalogContextValue>({
  catalog: null,
  vocabulary: null,
  baseStyles: null,
  resolved: [],
});

export function CatalogProvider({
  catalog,
  vocabulary,
  baseStyles = null,
  children,
}: {
  catalog: Catalog | null;
  vocabulary: StyleVocabulary | null;
  baseStyles?: BaseStyles | null;
  children: ReactNode;
}) {
  const value = useMemo<CatalogContextValue>(() => {
    if (!catalog) {
      return { catalog: null, vocabulary, baseStyles, resolved: [] };
    }
    return {
      catalog,
      vocabulary,
      baseStyles,
      resolved: sortWhitelistFirst(resolveCatalog(catalog)),
    };
  }, [catalog, vocabulary, baseStyles]);

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

// Hook co-localisé avec le Provider (pattern context React).
// eslint-disable-next-line react-refresh/only-export-components -- hook du même module
export function useCatalog(): CatalogContextValue {
  return useContext(CatalogContext);
}
