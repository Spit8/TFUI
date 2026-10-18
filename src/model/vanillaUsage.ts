/**
 * Enfants vus dans le jeu de base, pour les emplacements au répertoire fermé.
 * Relevé du 2026-10-18 sur le code GUI de toutes les archives `base/content`
 * (153 fichiers .tl/.lua ; affectations directes `slot = builtin.X{…}` et
 * listes `slot = { builtin.X{…} }`, comptes entre parenthèses).
 * Un autre type n’est pas interdit, mais aucun écran du jeu ne le fait :
 * rendu et comportement non garantis (ex. ProgressBar en cellule : invisible).
 */
export const VANILLA_SEEN_CHILDREN: Record<string, Record<string, string[]>> = {
  // TextView 99, ImageView 71, BoxLayout 20, Component 17, FloatingLayout 4
  Button: { content: ["TextView", "ImageView", "BoxLayout", "Component", "FloatingLayout"] },
  // ImageView 20, TextView 6, BoxLayout 2, Component 1
  ToggleButton: { content: ["ImageView", "TextView", "BoxLayout", "Component"] },
  // TextView 39, ImageView 1
  ComboBoxItem: { content: ["TextView", "ImageView"] },
  // indicator : TextView 25, Component 2, ImageView 1 ; item : Component 12, TextView 1
  TabWidgetChild: { indicator: ["TextView", "Component", "ImageView"], item: ["Component", "TextView"] },
  // Component 41, TextView 4, List 3, Button 1, ToggleButtonGroup 1
  ScrollArea: { content: ["Component", "TextView", "List", "Button", "ToggleButtonGroup"] },
  // TextView 62, Component 7, TextInputField 7, ImageView 3, ScrollArea 1, ComboBox 1, CheckBox 1
  Row: { cells: ["TextView", "Component", "TextInputField", "ImageView", "ScrollArea", "ComboBox", "CheckBox"] },
  // Component 2, BoxLayout 2
  Window: { content: ["Component", "BoxLayout"] },
};

/** Types vus dans `parent.slot`, ou null si l’emplacement n’est pas suivi. */
export function vanillaSeenChildren(parentType: string, slot: string): string[] | null {
  return VANILLA_SEEN_CHILDREN[parentType]?.[slot] ?? null;
}
