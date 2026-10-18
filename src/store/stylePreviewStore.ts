import { create } from "zustand";
import type { StyleState } from "../model/elementStyle";

/**
 * État simulé dans l’aperçu pour un nœud (onglet Survol / Pressé /
 * Désactivé de la section Style) : l’aperçu montre ce que l’on modifie.
 */
interface StylePreviewState {
  nodeId: string | null;
  state: StyleState | null;
  setPreviewState: (nodeId: string | null, state: StyleState | null) => void;
}

export const useStylePreviewStore = create<StylePreviewState>()((set) => ({
  nodeId: null,
  state: null,
  setPreviewState: (nodeId, state) => set({ nodeId, state }),
}));
