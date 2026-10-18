import { t } from "../i18n";
/**
 * Avancement global de l’import du contenu du jeu : phases pondérées et
 * estimation du temps restant d’après le débit mesuré.
 */
export type ImportPhase = "catalog" | "fonts" | "images";

/** Part de chaque phase dans la barre globale (somme = 1). */
export const PHASE_WEIGHTS: Record<ImportPhase, number> = {
  catalog: 0.15,
  fonts: 0.05,
  images: 0.8,
};

const ORDER: ImportPhase[] = ["catalog", "fonts", "images"];

export interface ImportProgressState {
  phase: ImportPhase;
  /** Avancement dans la phase, 0..1. */
  phaseRatio: number;
  /** Détail affiché (fichier en cours, compteur…). */
  detail: string;
}

/** Avancement global 0..1. */
export function overallRatio(state: ImportProgressState): number {
  let done = 0;
  for (const p of ORDER) {
    if (p === state.phase) return Math.min(1, done + PHASE_WEIGHTS[p] * Math.min(1, Math.max(0, state.phaseRatio)));
    done += PHASE_WEIGHTS[p];
  }
  return 1;
}

/** Échantillon (temps en ms, avancement global 0..1). */
export interface ProgressSample {
  t: number;
  ratio: number;
}

/**
 * Temps restant estimé (ms) d’après les échantillons des dernières `windowMs`
 * (moyenne glissante du débit) ; null tant qu’il n’y a pas assez de mesures.
 */
export function estimateRemainingMs(samples: ProgressSample[], windowMs = 8000): number | null {
  if (samples.length < 2) return null;
  const last = samples[samples.length - 1]!;
  const recent = samples.filter((s) => last.t - s.t <= windowMs);
  const first = recent.length >= 2 ? recent[0]! : samples[0]!;
  const dt = last.t - first.t;
  const dr = last.ratio - first.ratio;
  if (dt < 300 || dr <= 0) return null;
  return Math.max(0, ((1 - last.ratio) * dt) / dr);
}

/** « environ 1 min 20 s », « moins de 5 s »… */
export function formatRemaining(ms: number | null): string {
  if (ms === null) return t("progress.estimating");
  const s = Math.round(ms / 1000);
  if (s < 5) return t("progress.lessThan5s");
  if (s < 60) return t("progress.aboutSeconds", { s });
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? t("progress.aboutMinutes", { m }) : t("progress.aboutMinutesSeconds", { m, s: r });
}
