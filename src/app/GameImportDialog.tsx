import { useState } from "react";
import type { GameImportMode } from "../settings/defaults";
import "./GameImport.css";
import { translateKey, useT } from "../i18n";

const MODES: GameImportMode[] = ["minimum", "ui", "all"];

/**
 * Choix du contenu à importer depuis le jeu (installation, mise à jour,
 * demande). Rien n’est importé sans ce choix.
 */
export function GameImportDialog({
  title,
  message,
  counts,
  defaultMode,
  laterLabel,
  onChoose,
  onLater,
}: {
  title: string;
  message: string;
  /** Nombre d’images par mode (null : en cours de calcul). */
  counts: Record<GameImportMode, number> | null;
  defaultMode: GameImportMode;
  /** Libellé du bouton de report (absent : choix obligatoire). */
  laterLabel?: string;
  onChoose: (mode: GameImportMode) => void;
  onLater?: () => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<GameImportMode>(defaultMode);
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal game-import" role="dialog" aria-labelledby="game-import-title">
        <h2 id="game-import-title">{title}</h2>
        <p className="modal-hint">{message}</p>
        <div className="game-import-modes" role="radiogroup">
          {MODES.map((m, i) => (
            <label key={m} className={`game-import-mode${mode === m ? " selected" : ""}`}>
              <input
                type="radio"
                name="game-import-mode"
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              <span className="game-import-mode-text">
                <strong>{translateKey(`importDialog.${m}`)}</strong>
                <span className="game-import-count">
                  {counts ? t("importDialog.images", { n: counts[m] }) : t("importDialog.counting")}
                  {i > 0 ? t("importDialog.moreTime") : ""}
                </span>
                <span className="game-import-hint">{translateKey(`importDialog.${m}Hint`)}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="modal-hint">{t("importDialog.footer")}</p>
        <div className="modal-actions">
          <button type="button" onClick={() => onChoose(mode)}>
            {t("importDialog.import")}
          </button>
          {onLater && laterLabel ? (
            <button type="button" onClick={onLater}>
              {laterLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
