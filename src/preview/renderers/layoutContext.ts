import { createContext } from "react";

/**
 * Axe du layout parent (BoxLayout horizontal = "row", vertical = "column"),
 * null hors d’un layout : chaque élément en déduit son étirement (gravity).
 */
export const ParentLayoutContext = createContext<"row" | "column" | null>(null);

/** Rendu pour un export PNG : ni contours, ni survol, ni étiquette de sélection. */
export const PreviewExportContext = createContext(false);
