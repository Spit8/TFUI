import { t } from "../i18n";

/** Messages d’attente pendant l’import du contenu du jeu (thème Transport Fever). */
/**
 * Messages traduits, un par ligne de la clé `loading.messages` (le nombre de
 * messages peut varier d’une langue à l’autre).
 */
export function loadingMessages(): string[] {
  return t("loading.messages")
    .split("\n")
    .map((m) => m.trim())
    .filter(Boolean);
}

/** Message au hasard, différent du précédent. `random` ∈ [0, 1[. */
export function pickLoadingMessage(previous: string | null, random: () => number = Math.random): string {
  const all = loadingMessages();
  const pool = all.length > 1 ? all.filter((m) => m !== previous) : all;
  return pool[Math.floor(random() * pool.length) % pool.length]!;
}

/**
 * Avancement (en %) auquel changer de message : tous les 5 à 8 % d’après
 * l’avancement réel, pas d’après le temps.
 */
export function nextMessageAt(currentPct: number, random: () => number = Math.random): number {
  return currentPct + 5 + random() * 3;
}
