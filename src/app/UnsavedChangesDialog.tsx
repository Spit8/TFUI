import { useEffect, useRef, useSyncExternalStore } from "react";
import { useProjectStore } from "../store/projectStore";
import {
  answerUnsaved,
  getPendingUnsaved,
  subscribeUnsaved,
} from "./unsavedChanges";
import { useT } from "../i18n";
import { Rich } from "../i18n/Rich";

/** Dialogue Enregistrer / Ne pas enregistrer / Annuler (voir unsavedChanges). */
export function UnsavedChangesDialog() {
  const t = useT();
  const pending = useSyncExternalStore(subscribeUnsaved, getPendingUnsaved);
  const projectPath = useProjectStore((s) => s.projectPath);
  const saveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    saveRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        answerUnsaved("cancel");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  if (!pending) return null;
  const name = projectPath ? projectPath.split(/[/\\]/).pop() : t("menubar.untitled");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h2>{t("unsaved.title")}</h2>
        <p>
          <Rich k="unsaved.message" params={{ name: name ?? "", action: pending.action }} />
        </p>
        <div className="modal-actions">
          <button type="button" onClick={() => answerUnsaved("cancel")}>
            {t("common.cancel")}
          </button>
          <button type="button" onClick={() => answerUnsaved("discard")}>
            {t("unsaved.discard")}
          </button>
          <button
            ref={saveRef}
            type="button"
            className="primary"
            onClick={() => answerUnsaved("save")}
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
