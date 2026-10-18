import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { t } from "../../i18n";

const MOD_ID_RE = /^[a-z0-9_]+$/;

export function NewModDialog({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (opts: {
    parentDir: string;
    modId: string;
    displayName: string;
  }) => void;
}) {
  const [parentDir, setParentDir] = useState("");
  const [modId, setModId] = useState("tfui_sandbox");
  const [displayName, setDisplayName] = useState("TFUI Sandbox");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2>{t("newMod.title")}</h2>
        <p>{t("newMod.intro")}</p>
        <label>
          {t("newMod.parentDir")}
          <div className="modal-row">
            <input type="text" value={parentDir} readOnly />
            <button
              type="button"
              onClick={() => {
                void open({ directory: true, multiple: false }).then((sel) => {
                  if (typeof sel === "string") setParentDir(sel);
                });
              }}
            >
              {t("link.browse")}
            </button>
          </div>
        </label>
        <label>
          modId
          <input
            type="text"
            value={modId}
            onChange={(e) => setModId(e.target.value.trim())}
          />
        </label>
        <label>
          {t("newMod.displayName")}
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        {error ? <p className="modal-error">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (!parentDir) {
                setError(t("newMod.chooseParent"));
                return;
              }
              if (!MOD_ID_RE.test(modId)) {
                setError(t("newMod.invalidModId"));
                return;
              }
              if (!displayName.trim()) {
                setError(t("newMod.nameRequired"));
                return;
              }
              setError(null);
              onCreate({ parentDir, modId, displayName: displayName.trim() });
            }}
          >
            {t("newMod.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
