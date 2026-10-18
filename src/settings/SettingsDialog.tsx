import { useEffect, useState } from "react";
import { availableLanguages, setLanguage, useT } from "../i18n";
import { openLocalesFolder, reloadUserLocales } from "../i18n/loadLanguage";
import { backendMessage } from "../i18n/backend";
import { detectDefaultGameRoot, verifyGameRoot } from "../tauri/commands";
import { DEFAULT_SETTINGS, type AppSettings, type UiDensity } from "./defaults";
import { applyDensity } from "./density";
import { loadSettings, saveSettings } from "./settingsStore";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onRescan?: () => void;
  rescanStatus?: string;
}

export function SettingsDialog({
  open,
  onClose,
  onRescan,
  rescanStatus,
}: SettingsDialogProps) {
  const t = useT();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [languages, setLanguages] = useState(availableLanguages);
  /** Langue à l’ouverture : rétablie si le dialogue est fermé sans enregistrer. */
  const [initialLanguage, setInitialLanguage] = useState("system");

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setSettings(DEFAULT_SETTINGS);
    setStatus("");
    // Fichiers ajoutés au dossier des langues depuis la dernière ouverture.
    void reloadUserLocales().then(() => {
      if (!cancelled) setLanguages(availableLanguages());
    });
    void loadSettings()
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
          setInitialLanguage(loaded.language);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettings({ ...DEFAULT_SETTINGS });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  async function handleDetect() {
    setBusy(true);
    setStatus(t("settings.detecting"));
    try {
      const result = await detectDefaultGameRoot();
      if (result.ok) {
        setSettings((prev) => ({ ...prev, tf3Root: result.tf3Root }));
        setStatus(backendMessage(result.message));
      } else {
        const checked = await verifyGameRoot(settings.tf3Root);
        setStatus(backendMessage(checked.message));
      }
    } catch (error) {
      setStatus(error instanceof Error ? backendMessage(error.message) : t("settings.detectFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify() {
    setBusy(true);
    try {
      const result = await verifyGameRoot(settings.tf3Root);
      setStatus(backendMessage(result.message));
    } catch (error) {
      setStatus(error instanceof Error ? backendMessage(error.message) : t("settings.verifyFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    try {
      applyDensity(settings.density);
      setLanguage(settings.language);
      // Ne réécrit que les champs du dialogue : récents et dernier projet ont
      // pu changer pendant qu’il était ouvert.
      const latest = await loadSettings();
      await saveSettings({
        ...latest,
        tf3Root: settings.tf3Root,
        stagingArea: settings.stagingArea,
        density: settings.density,
        language: settings.language,
      });
      setInitialLanguage(settings.language);
      setStatus(t("settings.saved"));
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? backendMessage(error.message) : t("settings.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    // Langue essayée sans enregistrer : on revient à la précédente.
    if (settings.language !== initialLanguage) setLanguage(initialLanguage);
    onClose();
  }

  function setDensity(density: UiDensity) {
    setSettings((prev) => ({ ...prev, density }));
    applyDensity(density);
  }

  function chooseLanguage(language: string) {
    setSettings((prev) => ({ ...prev, language }));
    // Aperçu immédiat ; enregistré avec « Enregistrer ».
    setLanguage(language);
  }

  async function handleLocalesFolder() {
    try {
      await openLocalesFolder();
      const errors = await reloadUserLocales();
      setLanguages(availableLanguages());
      setLanguage(settings.language);
      setStatus(errors.length > 0 ? t("settings.localesInvalid", { files: errors.join(" ; ") }) : t("settings.localesHelp"));
    } catch (error) {
      setStatus(error instanceof Error ? backendMessage(error.message) : String(error));
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="settings-title">{t("settings.title")}</h2>
        <p className="modal-hint">{t("settings.hint")}</p>

        <label className="field">
          <span>{t("settings.tf3Root")}</span>
          <input
            type="text"
            value={settings.tf3Root}
            onChange={(event) =>
              setSettings({ ...settings, tf3Root: event.target.value })
            }
          />
        </label>

        <label className="field">
          <span>{t("settings.stagingArea")}</span>
          <input
            type="text"
            value={settings.stagingArea}
            onChange={(event) =>
              setSettings({ ...settings, stagingArea: event.target.value })
            }
          />
        </label>

        <label className="field">
          <span>{t("settings.density")}</span>
          <select
            value={settings.density}
            onChange={(event) =>
              setDensity(event.target.value as UiDensity)
            }
          >
            <option value="compact">{t("settings.densityCompact")}</option>
            <option value="normal">{t("settings.densityNormal")}</option>
          </select>
        </label>

        <label className="field">
          <span>{t("settings.language")}</span>
          <span style={{ display: "flex", gap: 6 }}>
            <select
              value={settings.language}
              onChange={(event) => chooseLanguage(event.target.value)}
              style={{ flex: 1 }}
            >
              <option value="system">{t("settings.languageSystem")}</option>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.code}){l.source === "user" ? ` — ${t("settings.languageUser")}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              title={t("settings.localesFolderHint")}
              onClick={() => void handleLocalesFolder()}
            >
              {t("settings.localesFolder")}
            </button>
          </span>
        </label>

        {status ? <p className="status-message">{status}</p> : null}
        {rescanStatus ? <p className="status-message">{rescanStatus}</p> : null}

        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={() => void handleDetect()}>
            {t("settings.detect")}
          </button>
          <button type="button" disabled={busy} onClick={() => void handleVerify()}>
            {t("settings.verify")}
          </button>
          {onRescan ? (
            <button type="button" disabled={busy} onClick={onRescan}>
              {t("settings.importGame")}
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void handleSave()}>
            {t("common.save")}
          </button>
          <button type="button" disabled={busy} onClick={handleClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
