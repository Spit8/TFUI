import { useEffect, useRef, useState } from "react";
import {
  estimateRemainingMs,
  formatRemaining,
  overallRatio,
  type ImportProgressState,
  type ProgressSample,
} from "./importProgressModel";
import { nextMessageAt, pickLoadingMessage } from "./loadingMessages";
import "./GameImport.css";
import { useT } from "../i18n";

const PHASE_LABELS: Record<ImportProgressState["phase"], "progress.catalog" | "progress.fonts" | "progress.images"> = {
  catalog: "progress.catalog",
  fonts: "progress.fonts",
  images: "progress.images",
};

/** Barre de chargement globale de l’import (temps restant, messages). */
export function ImportProgress({ state }: { state: ImportProgressState }) {
  const t = useT();
  const ratio = overallRatio(state);
  const samples = useRef<ProgressSample[]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [message, setMessage] = useState(() => pickLoadingMessage(null));
  // Message suivant quand l’avancement a progressé de 5 à 8 %.
  const changeAt = useRef(nextMessageAt(0));

  useEffect(() => {
    const now = performance.now();
    const list = samples.current;
    list.push({ t: now, ratio });
    if (list.length > 400) list.splice(0, list.length - 400);
    setRemaining(estimateRemainingMs(list));
  }, [ratio]);

  const pct = Math.round(ratio * 100);
  useEffect(() => {
    if (ratio * 100 < changeAt.current) return;
    changeAt.current = nextMessageAt(ratio * 100);
    setMessage((prev) => pickLoadingMessage(prev));
  }, [ratio]);
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal game-import-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <h2>{t("progress.title")}</h2>
        <p className="game-import-fun">{message}</p>
        <div className="game-import-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="game-import-figures">
          <span>
            {t("progress.phase", { pct, phase: t(PHASE_LABELS[state.phase]) })}
          </span>
          <span>{t("progress.remaining", { time: formatRemaining(remaining) })}</span>
        </div>
        <p className="game-import-detail" title={state.detail}>
          {state.detail}
        </p>
      </div>
    </div>
  );
}
