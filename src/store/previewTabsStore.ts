import { create } from "zustand";

/**
 * Onglet affiché par chaque TabWidget de l’aperçu (id du nœud → index).
 * Partagé entre l’aperçu et l’export PNG : l’image exportée montre l’onglet
 * choisi dans l’éditeur (un état local du composant repartait du premier).
 */
interface PreviewTabsState {
  active: Record<string, number>;
  setActive: (tabWidgetId: string, index: number) => void;
}

export const usePreviewTabsStore = create<PreviewTabsState>((set) => ({
  active: {},
  setActive: (tabWidgetId, index) => set((s) => ({ active: { ...s.active, [tabWidgetId]: index } })),
}));
