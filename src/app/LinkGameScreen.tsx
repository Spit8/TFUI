import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { DEFAULT_SETTINGS } from "../settings/defaults";
import { saveSettings } from "../settings/settingsStore";
import {
  detectDefaultGameRoot,
  verifyGameRoot,
} from "../tauri/commands";
import { useT } from "../i18n";
import { backendMessage } from "../i18n/backend";

interface LinkGameScreenProps {
  initialRoot?: string;
  onLinked: (tf3Root: string) => void;
}

export function LinkGameScreen({ initialRoot, onLinked }: LinkGameScreenProps) {
  const t = useT();
  const [tf3Root, setTf3Root] = useState(
    initialRoot ?? DEFAULT_SETTINGS.tf3Root,
  );
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleDetect() {
    setBusy(true);
    try {
      const result = await detectDefaultGameRoot();
      setTf3Root(result.tf3Root);
      setStatus(backendMessage(result.message));
    } catch (error) {
      setStatus(error instanceof Error ? backendMessage(error.message) : t("link.detectFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleBrowse() {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string") {
        setTf3Root(selected);
      }
    } catch (error) {
      setStatus(
        error instanceof Error ? backendMessage(error.message) : t("link.browseCancelled"),
      );
    }
  }

  async function handleLink() {
    setBusy(true);
    try {
      const result = await verifyGameRoot(tf3Root);
      setStatus(backendMessage(result.message));
      if (!result.ok) {
        return;
      }
      // Conserve tous les autres réglages (récents, densité, dossier staging…).
      let prev = { ...DEFAULT_SETTINGS };
      try {
        const { loadSettings } = await import("../settings/settingsStore");
        prev = await loadSettings();
      } catch {
        // garde les défauts
      }
      await saveSettings({ ...prev, tf3Root: result.tf3Root });
      onLinked(result.tf3Root);
    } catch (error) {
      setStatus(error instanceof Error ? backendMessage(error.message) : t("link.linkFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="link-game-screen">
      <div className="link-game-card">
        <h1>{t("link.title")}</h1>
        <p>{t("link.intro")}</p>
        <label className="field">
          <span>{t("link.root")}</span>
          <input
            type="text"
            value={tf3Root}
            onChange={(e) => setTf3Root(e.target.value)}
          />
        </label>
        {status ? <p className="status-message">{status}</p> : null}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={() => void handleDetect()}>
            {t("settings.detect")}
          </button>
          <button type="button" disabled={busy} onClick={() => void handleBrowse()}>
            {t("link.browse")}
          </button>
          <button type="button" disabled={busy} onClick={() => void handleLink()}>
            {t("link.link")}
          </button>
        </div>
      </div>
    </div>
  );
}
