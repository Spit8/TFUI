import type { CSSProperties } from "react";
import { getActiveBaseStyles } from "../gamestyle/activeBaseStyles";
import { colorToRgba } from "../model/paletteColor";
import type { StyleProps } from "../model/types";
import { previewTheme } from "./theme";

function numbers(value: unknown, len: number): number[] | undefined {
  return Array.isArray(value) &&
    value.length >= len &&
    value.every((n) => typeof n === "number")
    ? (value as number[]).slice(0, len)
    : undefined;
}

/** Couleur d’une palette active, par nom (`default_colors.gres`). */
export function paletteLookup(name: string): number[] | undefined {
  return getActiveBaseStyles()?.palette?.colors.find((c) => c.name === name)?.rgba;
}

/** Repli d’une couleur de palette inconnue (palette non extraite). */
const UNKNOWN_PALETTE_RGBA = [0.5, 0.5, 0.5, 1];

function resolveColor(value: unknown): number[] | undefined {
  const rgba = colorToRgba(value, paletteLookup);
  if (rgba) return rgba;
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "palette"
    ? UNKNOWN_PALETTE_RGBA
    : undefined;
}

/** `{r, g, b[, a]}` en 0..1 ou couleur de palette → `rgba(…)`, sinon undefined. */
function rgba(value: unknown): string | undefined {
  const c = resolveColor(value);
  if (!c) return undefined;
  const [r, g, b, a = 1] = c;
  return `rgba(${Math.round(r! * 255)}, ${Math.round(g! * 255)}, ${Math.round(b! * 255)}, ${a})`;
}

/** Longueur TF3 : nombre de pixels, ou chaîne relative à l’écran (`"75vw"`). */
function length(value: unknown): number | string | undefined {
  if (typeof value === "number") return value >= 0 ? value : undefined;
  if (typeof value === "string" && /^\d+(\.\d+)?(vw|vh|px|%)$/.test(value)) return value;
  return undefined;
}

function alpha(value: unknown): number {
  return resolveColor(value)?.[3] ?? 1;
}

/** `fontWeight` des feuilles du jeu (font_scaling.css.lua). */
const FONT_WEIGHTS: Record<string, CSSProperties["fontWeight"]> = {
  Regular: 400,
  Medium: 500,
  Bold: 700,
};

export function stylePropsToCss(style: StyleProps): CSSProperties {
  const css: CSSProperties = {};
  const extra = style as Record<string, unknown>;
  if (Array.isArray(extra.size) && extra.size.length >= 2) {
    // `-1` = taille libre (étirement ou contenu).
    const w = length(extra.size[0]);
    const h = length(extra.size[1]);
    if (w !== undefined) css.width = w;
    if (h !== undefined) css.height = h;
  }
  if (Array.isArray(style.innerSpacing) && style.innerSpacing.length >= 2) {
    // TF3: {x,y} → row-gap / column-gap approximation
    css.gap = `${style.innerSpacing[1]}px ${style.innerSpacing[0]}px`;
  }
  if (Array.isArray(style.outerSpacing) && style.outerSpacing.length >= 2) {
    css.margin = `${style.outerSpacing[1]}px ${style.outerSpacing[0]}px`;
  }
  if (Array.isArray(style.padding) && style.padding.length >= 4) {
    const [t, r, b, l] = style.padding;
    css.padding = `${t}px ${r}px ${b}px ${l}px`;
  }
  const margin = numbers(extra.margin, 4);
  if (margin) css.margin = margin.map((n) => `${n}px`).join(" ");
  const minSize = numbers(extra.minSize, 2);
  if (minSize) {
    if (minSize[0]! > 0) css.minWidth = minSize[0];
    if (minSize[1]! > 0) css.minHeight = minSize[1];
  }
  const maxSize = numbers(extra.maxSize, 2);
  if (maxSize) {
    if (maxSize[0]! >= 0) css.maxWidth = maxSize[0];
    if (maxSize[1]! >= 0) css.maxHeight = maxSize[1];
  }
  // Dans les .css.lua du jeu, `color` est la couleur du texte (vanilla :
  // `TextView { color = … }`) ; le fond est `backgroundColor` /
  // `backgroundColor1`.
  const text = rgba(style.color);
  if (text) css.color = text;
  // Les surfaces du jeu sont des images 9-patch (`backgroundImage1`,
  // `borderImage`) que l’aperçu ne dessine pas : une couleur totalement
  // transparente posée avec une image laisse le rendu du thème.
  const bgValue = extra.backgroundColor ?? extra.backgroundColor1;
  const background = rgba(bgValue);
  if (background && !(extra.backgroundImage1 && alpha(bgValue) === 0)) {
    css.backgroundColor = background;
  }
  const border = rgba(extra.borderColor);
  if (border && alpha(extra.borderColor) > 0) {
    // Contour sans effet sur la mise en page.
    css.boxShadow = `inset 0 0 0 1px ${border}`;
  }
  if (typeof extra.fontSize === "number") css.fontSize = extra.fontSize;
  if (typeof extra.fontWeight === "string") {
    if (extra.fontWeight.startsWith("Mono")) css.fontFamily = "Consolas, monospace";
    const weight = FONT_WEIGHTS[extra.fontWeight.replace(/^Mono/, "")];
    if (weight !== undefined) css.fontWeight = weight;
  }
  const align = numbers(extra.textAlignment, 1);
  if (align) css.textAlign = align[0]! >= 0.75 ? "right" : align[0]! >= 0.25 ? "center" : "left";
  return css;
}

export function fontSizeForClasses(classes: string[] | undefined): number {
  if (!classes) return previewTheme.fontScale["font-scale-body"] ?? 14;
  for (const c of classes) {
    if (previewTheme.fontScale[c] !== undefined) {
      return previewTheme.fontScale[c];
    }
  }
  return previewTheme.fontScale["font-scale-body"] ?? 14;
}
