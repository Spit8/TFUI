import type { CSSProperties, ReactNode } from "react";
import { colorToRgba } from "../../model/paletteColor";
import { paletteLookup } from "../styleToCss";
import { previewTheme } from "../theme";
import { engineElementStyle } from "./engineStyle";
import "./scrollbars.css";

/** Replis tant que les styles de base du jeu ne sont pas chargés (teintes BaseLight / BaseVeryLight). */
const GROOVE_FALLBACK = [0.28, 0.33, 0.38, 1];
const HANDLE_FALLBACK = [0.62, 0.68, 0.74, 1];

function cssColor(rgba: number[]): string {
  return `rgba(${rgba.slice(0, 3).map((n) => Math.round(n * 255)).join(",")},${rgba[3] ?? 1})`;
}

/** Couleur `backgroundColor1` des règles exactes de builtin.css.lua, sinon le repli. */
function engineColor(selectors: string[], fallback: number[]): string {
  const style = engineElementStyle(selectors);
  return cssColor(colorToRgba(style.backgroundColor1, paletteLookup) ?? fallback);
}

/**
 * Couleurs des barres de défilement du moteur (builtin.css.lua) :
 * `ScrollBar::Groove` (piste) et `ScrollBar::Handle` (poignée), avec les
 * états `ScrollBar:hover` / `ScrollBar:active`.
 */
function scrollbarVars(): CSSProperties {
  const handle = engineColor(["ScrollBar::Handle"], HANDLE_FALLBACK);
  return {
    "--tf-groove": engineColor(["ScrollBar::Groove"], GROOVE_FALLBACK),
    "--tf-handle": handle,
    "--tf-handle-hover": engineColor(["ScrollBar::Handle", "ScrollBar:hover ScrollBar::Handle"], HANDLE_FALLBACK),
    "--tf-handle-active": engineColor(["ScrollBar::Handle", "ScrollBar:active ScrollBar::Handle"], HANDLE_FALLBACK),
  } as CSSProperties;
}

/**
 * Zone défilante d’une List / ScrollArea : elle occupe la place que lui donne
 * son parent, rogne son contenu et défile selon les politiques du jeu
 * (`AlwaysOff` → rogné sans barre, `AlwaysOn` → barre toujours,
 * `AsNeeded` → barre si besoin ; `AsNeededButAlwaysReserveSpace` réserve la
 * place). Les éléments s’étirent sur l’axe transverse
 * (`List::Content::Layout` / `ScrollArea::Content::Layout { gravity { -1, 0 } }`).
 */
export function ScrollBox({
  vertical,
  overflowX,
  overflowY,
  reserveX,
  reserveY,
  emptyLabel,
  children,
}: {
  vertical: boolean;
  overflowX: "hidden" | "scroll" | "auto";
  overflowY: "hidden" | "scroll" | "auto";
  reserveX: boolean;
  reserveY: boolean;
  /** Libellé de la cible de dépôt d’un conteneur vide (éditeur seulement), sinon null. */
  emptyLabel: string | null;
  children: ReactNode;
}) {
  return (
    <div
      className="tf-scroll"
      style={{
        ...scrollbarVars(),
        // Base `auto` : la taille du contenu si rien ne la borne (fenêtre
        // libre), sinon réduite à la place disponible.
        flex: "1 1 auto",
        minWidth: 0,
        minHeight: 0,
        overflowX,
        overflowY,
        scrollbarGutter: reserveX || reserveY ? "stable" : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: vertical ? "column" : "row",
          alignItems: "stretch",
          // Liste verticale : largeur de la zone ; horizontale : celle du contenu.
          width: vertical ? undefined : "max-content",
          minWidth: vertical ? undefined : "100%",
        }}
      >
        {children}
        {emptyLabel ? (
          <div
            style={{
              minHeight: 52,
              padding: 8,
              border: `1px dashed ${previewTheme.border}`,
              color: previewTheme.textMuted,
              fontSize: 12,
            }}
          >
            {emptyLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
