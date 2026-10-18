import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import {
  readModMetadata,
  saveModMetadata,
  setModThumbnail,
  type ModMetadataPatch,
} from "../../tauri/commands";
import { join } from "../../tauri/pathUtil";
import { t } from "../../i18n";
import { errorMessage } from "../../i18n/backend";

const SEVERITIES = ["None", "Warning", "Critical"] as const;

export function ModDialog({
  projectDir,
  modRootRel,
  modId,
  onClose,
  onModIdChange,
}: {
  projectDir: string;
  modRootRel: string;
  modId: string;
  onClose: () => void;
  onModIdChange: (modId: string) => void;
}) {
  const modRoot = join(projectDir, modRootRel);
  const [patch, setPatch] = useState<ModMetadataPatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void readModMetadata(modRoot)
      .then((data) => {
        const mod = data.mod;
        const info = data.modinfo;
        const authorsRaw = info.authors;
        const authors = Array.isArray(authorsRaw)
          ? (authorsRaw as { name?: string; role?: string }[]).map((a) => ({
              name: a.name ?? "",
              role: a.role ?? "CREATOR",
            }))
          : [{ name: "Author", role: "CREATOR" }];
        const tags = Array.isArray(info.tags)
          ? (info.tags as string[])
          : ["Script Mod"];
        setPatch({
          modId: String(mod.modId ?? modId),
          revision: Number(mod.revision ?? 1),
          severityAdd: String(mod.severityAdd ?? "None"),
          severityRemove: String(mod.severityRemove ?? "None"),
          visible: mod.visible !== false,
          cosmetic: !!mod.cosmetic,
          name: String(info.name ?? modId),
          summary: String(info.summary ?? ""),
          description: String(info.description ?? ""),
          authors,
          tags,
          url: String(info.url ?? ""),
          preRunScript:
            typeof (mod.preRunScript as { fileName?: string } | null)
              ?.fileName === "string"
              ? (mod.preRunScript as { fileName: string }).fileName
              : "",
          runScript:
            typeof (mod.runScript as { fileName?: string } | null)?.fileName ===
            "string"
              ? (mod.runScript as { fileName: string }).fileName
              : "",
          postRunScript:
            typeof (mod.postRunScript as { fileName?: string } | null)
              ?.fileName === "string"
              ? (mod.postRunScript as { fileName: string }).fileName
              : "",
        });
      })
      .catch((e: unknown) => {
        setError(errorMessage(e));
      });
  }, [modRoot, modId]);

  if (!patch) {
    return (
      <div className="modal-backdrop">
        <div className="modal-card">
          <p>{error ?? t("modDialog.loading")}</p>
          <button type="button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card modal-card-wide">
        <h2>{t("modDialog.title")}</h2>
        <div className="modal-grid">
          <label>
            modId
            <input
              type="text"
              value={patch.modId}
              onChange={(e) => setPatch({ ...patch, modId: e.target.value })}
            />
          </label>
          <label>
            revision
            <div className="modal-row">
              <input
                type="number"
                value={patch.revision}
                onChange={(e) =>
                  setPatch({
                    ...patch,
                    revision: parseInt(e.target.value, 10) || 1,
                  })
                }
              />
              <button
                type="button"
                onClick={() =>
                  setPatch({ ...patch, revision: patch.revision + 1 })
                }
              >
                +1
              </button>
            </div>
          </label>
          <label>
            severityAdd
            <select
              value={patch.severityAdd}
              onChange={(e) =>
                setPatch({ ...patch, severityAdd: e.target.value })
              }
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            severityRemove
            <select
              value={patch.severityRemove}
              onChange={(e) =>
                setPatch({ ...patch, severityRemove: e.target.value })
              }
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="modal-check">
            <input
              type="checkbox"
              checked={patch.visible}
              onChange={(e) =>
                setPatch({ ...patch, visible: e.target.checked })
              }
            />
            visible
          </label>
          <label className="modal-check">
            <input
              type="checkbox"
              checked={patch.cosmetic}
              onChange={(e) =>
                setPatch({ ...patch, cosmetic: e.target.checked })
              }
            />
            cosmetic
          </label>
          <label>
            {t("modDialog.name")}
            <input
              type="text"
              value={patch.name}
              onChange={(e) => setPatch({ ...patch, name: e.target.value })}
            />
          </label>
          <label>
            {t("modDialog.summary")}
            <input
              type="text"
              value={patch.summary}
              onChange={(e) => setPatch({ ...patch, summary: e.target.value })}
            />
          </label>
          <label className="modal-span-2">
            {t("modDialog.description")}
            <textarea
              rows={3}
              value={patch.description}
              onChange={(e) =>
                setPatch({ ...patch, description: e.target.value })
              }
            />
          </label>
          <label>
            {t("modDialog.tags")}
            <input
              type="text"
              value={patch.tags.join(", ")}
              onChange={(e) =>
                setPatch({
                  ...patch,
                  tags: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <label>
            {t("modDialog.url")}
            <input
              type="text"
              value={patch.url}
              onChange={(e) => setPatch({ ...patch, url: e.target.value })}
            />
          </label>
          <label>
            {t("modDialog.author")}
            <input
              type="text"
              value={patch.authors[0]?.name ?? ""}
              onChange={(e) =>
                setPatch({
                  ...patch,
                  authors: [
                    {
                      name: e.target.value,
                      role: patch.authors[0]?.role ?? "CREATOR",
                    },
                  ],
                })
              }
            />
          </label>
          <label>
            {t("modDialog.thumbnail")}
            <button
              type="button"
              onClick={() => {
                void open({
                  multiple: false,
                  filters: [
                    { name: t("modDialog.imageFilter"), extensions: ["png", "jpg", "jpeg"] },
                  ],
                }).then(async (sel) => {
                  if (typeof sel !== "string") return;
                  try {
                    await setModThumbnail(modRoot, sel);
                    setStatus(t("modDialog.thumbnailSaved"));
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                });
              }}
            >
              {t("modDialog.chooseImage")}
            </button>
          </label>
        </div>
        {error ? <p className="modal-error">{error}</p> : null}
        {status ? <p className="modal-status">{status}</p> : null}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t("common.close")}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              void (async () => {
                try {
                  await saveModMetadata(modRoot, patch);
                  onModIdChange(patch.modId);
                  setStatus(t("modDialog.saved"));
                  setError(null);
                } catch (e) {
                  setError(errorMessage(e));
                }
              })();
            }}
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
