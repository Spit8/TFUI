import { useContext, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useTintedImage, type GameImage } from "../../gamestyle/gameAssets";
import { PreviewExportContext } from "./layoutContext";
import type { NinePatchSpec } from "./ninePatchSpec";

/** Bords d’un 9-patch à l’échelle 1 : haut, droite, bas, gauche. */
function sliceEdges(spec: NinePatchSpec): [number, number, number, number] {
  const [h0, h1, h2, h3] = spec.horizontal as [number, number, number, number];
  const [v0, v1, v2, v3] = spec.vertical as [number, number, number, number];
  return [v1 - v0, h3 - h2, v3 - v2, h1 - h0];
}

/**
 * Dessine une image 9-patch du jeu, teintée par la couleur du style, sous le
 * contenu de l’élément (comme `backgroundImage1` / `borderImage` en jeu) :
 * coins à taille fixe, bords et centre étirés. Ne change pas la mise en page.
 *
 * Aperçu : `border-image` (net à tout zoom, source `@2x`). Export PNG : image
 * calculée sur canevas à la taille exacte de l’élément, car la conversion
 * DOM → PNG perd le centre (`fill`) d’un `border-image`.
 */
export function NinePatch({
  spec,
  color,
  outset,
}: {
  spec: NinePatchSpec;
  color: number[];
  /** Débord hors de l’élément (haut, droite, bas, gauche), ex. ombre portée. */
  outset?: number[];
}) {
  const exporting = useContext(PreviewExportContext);
  const img = useTintedImage(spec.fileName, color);
  const base: CSSProperties = {
    position: "absolute",
    inset: outset ? outset.map((n) => `${-n}px`).join(" ") : 0,
    // Ombre (débord) sous la surface, surface sous le contenu.
    zIndex: outset ? -2 : -1,
    pointerEvents: "none",
    boxSizing: "border-box",
  };
  if (exporting) return <CanvasNinePatch spec={spec} img={img} style={base} />;
  if (!img) return null;
  const [top, right, bottom, left] = sliceEdges(spec);
  const s = img.scale;
  const style: CSSProperties = {
    ...base,
    borderStyle: "solid",
    borderColor: "transparent",
    borderWidth: `${top}px ${right}px ${bottom}px ${left}px`,
    borderImageSource: `url(${img.url})`,
    borderImageSlice: `${top * s} ${right * s} ${bottom * s} ${left * s} fill`,
    borderImageRepeat: "stretch",
  };
  return <span style={style} />;
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });
}

/** 9-patch rendu sur canevas à la taille de l’élément (export PNG). */
function CanvasNinePatch({
  spec,
  img,
  style,
}: {
  spec: NinePatchSpec;
  img: GameImage | null;
  style: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !img) return;
    let alive = true;
    const w = Math.max(1, Math.round(el.offsetWidth));
    const h = Math.max(1, Math.round(el.offsetHeight));
    void loadImageElement(img.url).then((src) => {
      if (!alive) return;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingQuality = "high";
      const s = img.scale;
      const [t, r, b, l] = sliceEdges(spec);
      const sw = src.naturalWidth;
      const sh = src.naturalHeight;
      // Colonnes / lignes source (pixels de l’image) et cible (pixels d’interface).
      const sx = [0, l * s, sw - r * s, sw];
      const sy = [0, t * s, sh - b * s, sh];
      const dx = [0, l, w - r, w];
      const dy = [0, t, h - b, h];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const sW = sx[j + 1]! - sx[j]!;
          const sH = sy[i + 1]! - sy[i]!;
          const dW = dx[j + 1]! - dx[j]!;
          const dH = dy[i + 1]! - dy[i]!;
          if (sW > 0 && sH > 0 && dW > 0 && dH > 0) {
            ctx.drawImage(src, sx[j]!, sy[i]!, sW, sH, dx[j]!, dy[i]!, dW, dH);
          }
        }
      }
      setUrl(canvas.toDataURL("image/png"));
    });
    return () => {
      alive = false;
    };
  }, [img, spec]);
  return (
    <span
      ref={ref}
      data-ninepatch={url ? "ready" : "pending"}
      style={{ ...style, backgroundImage: url ? `url(${url})` : undefined, backgroundSize: "100% 100%" }}
    />
  );
}
