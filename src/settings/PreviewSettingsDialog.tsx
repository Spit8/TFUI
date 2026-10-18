import { useMemo, useState } from "react";
import {
  clearPreviewBackgroundImage,
  getPreviewBackgroundImages,
  getPreviewBackgroundRatio,
  pickPreviewBackgroundImage,
} from "../app/previewBackground";
import { useCatalog } from "../catalog/CatalogContext";
import { ColorPicker } from "../inspector/ColorPicker";
import { FALLBACK_RESOLUTIONS, groupByAspect } from "../preview/screenRatio";
import {
  setPreviewAppearanceState,
  getPlayerFontScale,
  setPreviewFontScaleState,
  usePreviewAppearance,
  usePreviewFontScale,
} from "../store/previewCameraStore";
import { NumberInput } from "../ui/NumberInput";
import { DEFAULT_PREVIEW_APPEARANCE, type PreviewAppearance, type PreviewFontScale } from "./defaults";
import { setPreviewAppearance, setPreviewFontScaleSetting } from "./settingsStore";
import "./PreviewSettingsDialog.css";
import { translateKey, useT } from "../i18n";

const SCALE_LABELS = {
  small: "previewSettings.scaleSmall",
  medium: "previewSettings.scaleMedium",
  large: "previewSettings.scaleLarge",
} as const;

type ColorKey = Exclude<keyof PreviewAppearance, "selectedWidth">;

const COLOR_KEYS: ColorKey[] = ["hoverFill", "hoverOutline", "boxOutline", "selectedOutline"];

function colorRows(): { key: ColorKey; label: string; hint: string }[] {
  return COLOR_KEYS.map((key) => ({
    key,
    label: translateKey(`previewSettings.${key}`),
    hint: translateKey(`previewSettings.${key}Hint`),
  }));
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Affichage › Réglages de l’aperçu : capture de fond par format d’écran et
 * couleurs du survol, des contours « Box » et de la sélection (mémorisés).
 */
export function PreviewSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { baseStyles } = useCatalog();
  const appearance = usePreviewAppearance();
  const fontScale = usePreviewFontScale();
  const playerScale = getPlayerFontScale();
  const [images, setImages] = useState(getPreviewBackgroundImages);
  const current = getPreviewBackgroundRatio();

  const formats = useMemo(
    () => groupByAspect(baseStyles?.resolutions ?? FALLBACK_RESOLUTIONS),
    [baseStyles],
  );

  const update = (next: PreviewAppearance) => {
    setPreviewAppearanceState(next);
    void setPreviewAppearance(next).catch(() => undefined);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal preview-settings"
        role="dialog"
        aria-labelledby="preview-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="preview-settings-title">{t("previewSettings.title")}</h2>

        <h3>{t("previewSettings.gameText")}</h3>
        <label className="ps-color" title={t("previewSettings.gameTextHint")}>
          <select
            value={fontScale}
            onChange={(e) => {
              const v = e.target.value as PreviewFontScale;
              setPreviewFontScaleState(v);
              void setPreviewFontScaleSetting(v).catch(() => undefined);
            }}
          >
            <option value="game">
              {playerScale
                ? t("previewSettings.asGame", { scale: t(SCALE_LABELS[playerScale]) })
                : t("previewSettings.asGameUnknown")}
            </option>
            <option value="small">{t("previewSettings.scaleSmall")}</option>
            <option value="medium">{t("previewSettings.scaleMedium")}</option>
            <option value="large">{t("previewSettings.scaleLarge")}</option>
          </select>
          <span>{t("previewSettings.textSize")}</span>
        </label>

        <h3>{t("previewSettings.backgrounds")}</h3>
        <p className="modal-hint">{t("previewSettings.backgroundsHint")}</p>
        <div className="ps-formats">
          {formats.map((f) => {
            const path = images[f.label];
            return (
              <div key={f.label} className={`ps-format${f.label === current ? " current" : ""}`}>
                <span className="ps-format-label" title={f.items.map((r) => `${r.w}×${r.h}`).join(", ")}>
                  {f.label}
                  {f.label === current ? <span className="ps-current"> {t("previewSettings.shown")}</span> : null}
                </span>
                <span className="ps-format-file" title={path ?? undefined}>
                  {path ? fileName(path) : "—"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void pickPreviewBackgroundImage(f.label).then(() => setImages(getPreviewBackgroundImages()))
                  }
                >
                  {t("previewSettings.choose")}
                </button>
                <button
                  type="button"
                  disabled={!path}
                  title={t("previewSettings.forget")}
                  onClick={() =>
                    void clearPreviewBackgroundImage(f.label).then(() => setImages(getPreviewBackgroundImages()))
                  }
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        <h3>{t("previewSettings.colors")}</h3>
        <div className="ps-colors">
          {colorRows().map((row) => (
            <div key={row.key} className="ps-color" title={row.hint}>
              <ColorPicker
                value={appearance[row.key]}
                allowPaletteRef={false}
                title={row.hint}
                onChange={(v) => {
                  if (Array.isArray(v)) update({ ...appearance, [row.key]: v });
                }}
              />
              <span>{row.label}</span>
            </div>
          ))}
          <label className="ps-color" title={t("previewSettings.selectedWidthHint")}>
            <NumberInput
              integer
              step={1}
              value={appearance.selectedWidth}
              onCommit={(n) => update({ ...appearance, selectedWidth: Math.min(8, Math.max(1, Math.round(n))) })}
            />
            <span>{t("previewSettings.selectedWidth")}</span>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={() => update({ ...DEFAULT_PREVIEW_APPEARANCE })}>
            {t("previewSettings.defaultColors")}
          </button>
          <button type="button" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
