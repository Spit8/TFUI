import type { CSSProperties } from "react";
import { engineElementStyle } from "./engineStyle";
import { hasGameAssets, useTintedImage } from "../../gamestyle/gameAssets";
import { colorToRgba } from "../../model/paletteColor";
import { paletteLookup } from "../styleToCss";
import { NinePatch } from "./NinePatch";
import { asNinePatch } from "./ninePatchSpec";
import { t } from "../../i18n";

/** Icône du jeu (`.tga`) teintée, à sa taille d’interface. */
export function GameIcon({
  fileName,
  color,
  fallback,
}: {
  fileName: string;
  color: number[];
  fallback: string;
}) {
  const img = useTintedImage(fileName, color);
  if (!img) {
    return (
      <span style={{ display: "inline-block", width: 18, height: 18, lineHeight: "18px", textAlign: "center" }}>
        {fallback}
      </span>
    );
  }
  return <img src={img.url} alt="" draggable={false} style={{ display: "block", width: img.width, height: img.height }} />;
}

function edges(value: unknown): [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === "number")
    ? (value as [number, number, number, number])
    : [0, 0, 0, 0];
}

/** Repli sans styles du jeu : couleur de `Window::TitleLayout Button!close`. */
const CLOSE_FALLBACK_COLOR = [0.2025, 0.32625, 0.45, 0.9];

/**
 * Bouton fermer d’une fenêtre `closable` : `Window::TitleLayout Button!close`
 * (surface `close_button_surface.tga` teintée, padding 8, marge gauche 4),
 * icône `window/icons/symbol_close_18.tga` (18 px) : 34×34, la taille native
 * de la surface, collé en haut à droite (mesuré sur une capture en jeu).
 */
export function WindowCloseButton() {
  const style = engineElementStyle(["Button", "Window::TitleLayout Button", "Window::TitleLayout Button!close"]);
  const color = colorToRgba(style.backgroundColor1, paletteLookup) ?? CLOSE_FALLBACK_COLOR;
  // Image du jeu seulement si les ressources sont lisibles (sinon repli CSS).
  const surface = hasGameAssets() ? asNinePatch(style.backgroundImage1) : null;
  const [pt, pr, pb, pl] = Array.isArray(style.padding) ? edges(style.padding) : [8, 8, 8, 8];
  const [mt, mr, mb, ml] = Array.isArray(style.margin) ? edges(style.margin) : [0, 0, 0, 4];
  const box: CSSProperties = {
    position: "relative",
    isolation: "isolate",
    flex: "0 0 auto",
    alignSelf: "flex-start",
    padding: `${pt}px ${pr}px ${pb}px ${pl}px`,
    margin: `${mt}px ${mr}px ${mb}px ${ml}px`,
    color: "#fff",
    fontWeight: 700,
    // Repli tant que l’image du jeu n’est pas disponible.
    background: surface ? undefined : `rgba(${color.slice(0, 3).map((n) => Math.round(n * 255)).join(",")},${color[3] ?? 1})`,
    borderBottomLeftRadius: surface ? undefined : 12,
  };
  return (
    <div style={box} title={t("previewNode.closeButton")}>
      {surface ? <NinePatch spec={surface} color={color} /> : null}
      <GameIcon fileName="::/gui/builtin/window/icons/symbol_close_18.tga" color={[1, 1, 1, 1]} fallback="✕" />
    </div>
  );
}

/**
 * Image d’un ImageView (`path` du jeu, ex. `::/gui/hud/icons/bus.tga`) : copie
 * locale convertie, sinon `.tga` du jeu ; teintée par la couleur du style
 * (masques), à sa taille d’interface ou à la taille demandée.
 */
export function GameImageView({
  path,
  color,
  width,
  height,
}: {
  path: string | null;
  color: number[];
  width?: number;
  height?: number;
}) {
  const img = useTintedImage(path ?? undefined, path ? color : undefined);
  if (!path || !img) {
    return (
      <div
        title={path ? t("previewNode.imageNotFound", { path }) : t("previewNode.imageNoPath")}
        style={{
          width: width ?? 32,
          height: height ?? 32,
          border: "1px dashed rgba(255,255,255,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "rgba(255,255,255,0.6)",
        }}
      >
        image ?
      </div>
    );
  }
  return (
    <img
      src={img.url}
      alt=""
      draggable={false}
      style={{ display: "block", width: width ?? img.width, height: height ?? img.height }}
    />
  );
}
