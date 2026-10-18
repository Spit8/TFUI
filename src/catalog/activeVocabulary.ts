import type { StyleVocabulary } from "./types";

/**
 * Vocabulaire de style actif (clés vanilla par élément), lu hors React par
 * le modèle (propriétés autorisées, validateur). Posé par App avec l’état.
 */
let activeVocabulary: StyleVocabulary | null = null;

export function setActiveVocabulary(vocabulary: StyleVocabulary | null): void {
  activeVocabulary = vocabulary;
}

export function getActiveVocabulary(): StyleVocabulary | null {
  return activeVocabulary;
}
