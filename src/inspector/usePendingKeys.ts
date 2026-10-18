import { useState } from "react";

/**
 * Clés ajoutées sans valeur connue : affichées (champ vide) jusqu’à la
 * première saisie, sans rien écrire dans le projet.
 */
export function usePendingKeys(definedKeys: string[]) {
  const [keys, setKeys] = useState<string[]>([]);
  const visible = keys.filter((k) => !definedKeys.includes(k));
  return {
    keys: visible,
    add: (k: string) => setKeys((ks) => (ks.includes(k) ? ks : [...ks, k])),
    remove: (k: string) => setKeys((ks) => ks.filter((x) => x !== k)),
  };
}
