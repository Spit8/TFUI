import { useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import type { GuiWritePlan } from "./writeGui";
import { useT } from "../i18n";

/** Retire la ligne d’empreinte (posée à l’écriture) pour ne comparer que le code. */
function withoutFingerprint(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !l.startsWith("-- tfui:sha256="))
    .join("\n");
}

type FileState = "new" | "changed" | "same" | "removed";

function stateOf(plan: GuiWritePlan): FileState {
  if (plan.willRemove) return "removed";
  if (plan.previous === null) return "new";
  return withoutFingerprint(plan.previous) === withoutFingerprint(plan.content) ? "same" : "changed";
}

const STATE_LABEL: Record<FileState, "diff.stateNew" | "diff.stateChanged" | "diff.stateSame" | "diff.stateRemoved"> = {
  new: "diff.stateNew",
  changed: "diff.stateChanged",
  same: "diff.stateSame",
  removed: "diff.stateRemoved",
};

const SUMMARY_LABEL: Record<FileState, "diff.new" | "diff.changed" | "diff.same" | "diff.removed"> = {
  new: "diff.new",
  changed: "diff.changed",
  same: "diff.same",
  removed: "diff.removed",
};

export function GuiDiffDialog({
  plans,
  onConfirm,
  onCancel,
}: {
  plans: GuiWritePlan[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  // Fichiers qui changent d’abord, inchangés en dernier.
  const order: FileState[] = ["changed", "new", "removed", "same"];
  const files = [...plans].sort((a, b) => order.indexOf(stateOf(a)) - order.indexOf(stateOf(b)));
  const [current, setCurrent] = useState(0);
  const shown = files[Math.min(current, files.length - 1)];
  const count = (s: FileState) => files.filter((f) => stateOf(f) === s).length;
  const summary = (["changed", "new", "removed", "same"] as FileState[])
    .filter((s) => count(s) > 0)
    .map((s) => t(SUMMARY_LABEL[s], { n: count(s) }))
    .join(", ");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card modal-card-wide">
        <h2>{t("diff.title")}</h2>
        <p>{t("diff.intro", { summary: summary || t("diff.noFile") })}</p>
        {files.length > 0 ? (
          <>
            <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
              {files.map((f, i) => {
                const st = stateOf(f);
                return (
                  <button
                    key={f.relativePath}
                    type="button"
                    role="tab"
                    aria-selected={f === shown}
                    className={f === shown ? "primary" : undefined}
                    style={{ opacity: st === "same" ? 0.6 : 1 }}
                    onClick={() => setCurrent(i)}
                    title={f.path}
                  >
                    {f.relativePath} · {f.userFile ? t("diff.userFileTab") : t(STATE_LABEL[st])}
                  </button>
                );
              })}
            </div>
            <div className="modal-path">{shown.path}</div>
            {shown.userFile ? (
              <p style={{ margin: "4px 0" }}>
                {t("diff.userFileNote")}
              </p>
            ) : null}
            <div style={{ height: 360, border: "1px solid var(--border)" }}>
              <DiffEditor
                key={shown.relativePath}
                height="100%"
                language="lua"
                theme="vs-dark"
                original={withoutFingerprint(shown.previous ?? "")}
                modified={shown.willRemove ? "" : shown.content}
                options={{ readOnly: true, renderSideBySide: true }}
              />
            </div>
          </>
        ) : null}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="primary" onClick={onConfirm}>
            {t("diff.write")}
          </button>
        </div>
      </div>
    </div>
  );
}
