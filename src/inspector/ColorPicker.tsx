import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useCatalog } from "../catalog/CatalogContext";
import { PALETTE_GROUPS } from "../gamestyle/extractBaseStyles";
import type { GamePalette, PaletteEntry } from "../gamestyle/types";
import { colorToRgba, isPaletteColor } from "../model/paletteColor";
import type { PaletteColor } from "../model/types";
import { hexToRgba, hsvToRgb, rgbaToHex, rgbToHsv } from "./colorVec";
import "./ColorPicker.css";
import { t, useT } from "../i18n";
import { Rich } from "../i18n/Rich";

/** Valeur produite : RGBA 0..1 (longueur `len`) ou couleur nommée du jeu. */
export type ColorValue = number[] | PaletteColor;

const GROUP_LABELS: Record<string, "color.groupNeutral" | "color.groupBase" | "color.groupAccent" | "color.groupOther"> = {
  Neutral: "color.groupNeutral",
  Base: "color.groupBase",
  Accent: "color.groupAccent",
  other: "color.groupOther",
};

function lookupIn(palette: GamePalette | undefined) {
  return (name: string) => palette?.colors.find((c) => c.name === name)?.rgba;
}

function css(rgba: number[]): string {
  const [r = 0, g = 0, b = 0, a = 1] = rgba;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

/**
 * Sélecteur de couleurs : n’importe quel RVB + transparence (le jeu accepte
 * tout RGBA en 0..1), et en raccourcis les couleurs nommées de la palette du
 * jeu (`default_colors.gres`, émises `colorDefault.<Nom>` dans un `.css.lua`).
 */
export function ColorPicker({
  value,
  onChange,
  len = 4,
  allowPaletteRef = true,
  title,
}: {
  value: unknown;
  onChange: (next: ColorValue) => void;
  /** 3 = RVB sans transparence. */
  len?: 3 | 4;
  /** false : une couleur de palette est copiée en valeurs (props de composant). */
  allowPaletteRef?: boolean;
  title?: string;
}) {
  useT();
  const label = title ?? t("color.choose");
  const { baseStyles } = useCatalog();
  const palette = baseStyles?.palette;
  const lookup = lookupIn(palette);
  const current = colorToRgba(value, lookup) ?? [0.5, 0.5, 0.5, 1];
  const paletteName = isPaletteColor(value) ? value.name : null;
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className="cp-swatch"
        title={paletteName ? t("color.swatchPalette", { title: label, name: paletteName }) : label}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ background: css(current) }} />
      </button>
      {open && anchor.current
        ? createPortal(
            <ColorPopover
              anchor={anchor.current}
              rgba={current}
              paletteName={paletteName}
              palette={palette}
              len={len}
              onClose={() => setOpen(false)}
              onLiteral={(rgba) => onChange(rgba.slice(0, len))}
              onPalette={(entry, alpha) => {
                if (allowPaletteRef) {
                  onChange(alpha === undefined ? { kind: "palette", name: entry.name } : { kind: "palette", name: entry.name, alpha });
                } else {
                  const rgba = [...entry.rgba.slice(0, 3), alpha ?? entry.rgba[3] ?? 1];
                  onChange(rgba.slice(0, len));
                }
              }}
              paletteAlpha={isPaletteColor(value) ? value.alpha : undefined}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function ColorPopover({
  anchor,
  rgba,
  paletteName,
  paletteAlpha,
  palette,
  len,
  onClose,
  onLiteral,
  onPalette,
}: {
  anchor: HTMLElement;
  rgba: number[];
  paletteName: string | null;
  paletteAlpha: number | undefined;
  palette: GamePalette | undefined;
  len: 3 | 4;
  onClose: () => void;
  onLiteral: (rgba: number[]) => void;
  onPalette: (entry: PaletteEntry, alpha: number | undefined) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  // Brouillon TSV + alpha : l’aperçu suit le glisser, l’écriture se fait au relâchement.
  const [hsv, setHsv] = useState(() => rgbToHsv(rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0));
  const [alpha, setAlpha] = useState(rgba[3] ?? 1);
  const key = rgba.join(",");
  useEffect(() => {
    setHsv(rgbToHsv(rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0));
    setAlpha(rgba[3] ?? 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resynchronise sur la valeur
  }, [key]);

  const draft = [...hsvToRgb(hsv[0], hsv[1], hsv[2]), len === 4 ? alpha : 1];
  const commit = (next = draft) => onLiteral(next);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const el = ref.current;
    const w = el?.offsetWidth ?? 260;
    const h = el?.offsetHeight ?? 360;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 4;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : below;
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  /** Glisser dans une zone : `apply(x, y)` en 0..1, écriture au relâchement. */
  const drag =
    (apply: (x: number, y: number) => number[]) => (e: ReactPointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      let last = draft;
      const at = (ev: { clientX: number; clientY: number }) => {
        const r = el.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
        last = apply(x, y);
      };
      at(e);
      const move = (ev: PointerEvent) => at(ev);
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        commit(last);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    };

  const withHsv = (h: number, s: number, v: number) => {
    setHsv([h, s, v]);
    return [...hsvToRgb(h, s, v), len === 4 ? alpha : 1];
  };

  const groups = new Map<string, PaletteEntry[]>();
  for (const c of palette?.colors ?? []) {
    const g = PALETTE_GROUPS.find((p) => c.name.startsWith(p)) ?? "other";
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }

  const rgb255 = draft.slice(0, 3).map((n) => Math.round(n * 255));

  return (
    <div ref={ref} className="cp-popover" style={{ left: pos.left, top: pos.top }} role="dialog" aria-label={t("color.picker")}>
      <div
        className="cp-sv"
        style={{ background: `hsl(${hsv[0]}, 100%, 50%)` }}
        onPointerDown={drag((x, y) => withHsv(hsv[0], x, 1 - y))}
      >
        <div className="cp-sv-white" />
        <div className="cp-sv-black" />
        <span className="cp-thumb" style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }} />
      </div>
      <div className="cp-slider cp-hue" onPointerDown={drag((x) => withHsv(x * 359.9, hsv[1], hsv[2]))}>
        <span className="cp-thumb-bar" style={{ left: `${(hsv[0] / 360) * 100}%` }} />
      </div>
      {len === 4 ? (
        <div
          className="cp-slider cp-alpha"
          title={t("color.alpha")}
          onPointerDown={drag((x) => {
            const a = Math.round(x * 100) / 100;
            setAlpha(a);
            return [...draft.slice(0, 3), a];
          })}
        >
          <span style={{ background: `linear-gradient(to right, transparent, ${css([...draft.slice(0, 3), 1])})` }} />
          <span className="cp-thumb-bar" style={{ left: `${alpha * 100}%` }} />
        </div>
      ) : null}

      <div className="cp-fields">
        <span className="cp-preview" style={{ background: css(draft) }} />
        <HexField hex={rgbaToHex(draft)} onCommit={(hex) => commit([...hexToRgba(hex, alpha).slice(0, 3), alpha])} />
        {rgb255.map((n, i) => (
          <ByteField
            key={i}
            label={t((["color.r", "color.g", "color.b"] as const)[i]!)}
            value={n}
            onCommit={(b) => {
              const next = [...draft];
              next[i] = b / 255;
              commit(next);
            }}
          />
        ))}
        {len === 4 ? (
          <ByteField
            label={t("color.a")}
            value={Math.round(alpha * 100)}
            max={100}
            title={t("color.opacityPercent")}
            onCommit={(p) => commit([...draft.slice(0, 3), p / 100])}
          />
        ) : null}
      </div>

      {paletteName ? (
        <div className="cp-current">
          <Rich
            k="color.currentPalette"
            params={{
              name: paletteName,
              alpha: paletteAlpha !== undefined ? t("color.currentAlpha", { alpha: paletteAlpha }) : "",
            }}
          />
        </div>
      ) : null}

      {palette ? (
        <div className="cp-palette">
          {[...PALETTE_GROUPS, "other"].map((g) =>
            groups.get(g)?.length ? (
              <div key={g} className="cp-group">
                <span className="cp-group-label">{t(GROUP_LABELS[g] ?? "color.groupOther")}</span>
                <div className="cp-group-swatches">
                  {groups.get(g)!.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className={`cp-pal${paletteName === c.name ? " active" : ""}`}
                      title={t("color.paletteEntry", { name: c.name })}
                      onClick={() => onPalette(c, undefined)}
                    >
                      <span style={{ background: css(c.rgba) }} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null,
          )}
          {len === 4 && palette.transparency.length > 0 ? (
            <div className="cp-group">
              <span className="cp-group-label">{t("color.transparencies")}</span>
              <div className="cp-group-swatches">
                {palette.transparency.map((tr) => (
                  <button
                    key={tr.name}
                    type="button"
                    className="cp-alpha-btn"
                    title={`${tr.name} = ${tr.alpha} (transparency.gres)`}
                    onClick={() => {
                      const entry = paletteName ? palette.colors.find((c) => c.name === paletteName) : undefined;
                      if (entry) onPalette(entry, tr.alpha);
                      else commit([...draft.slice(0, 3), tr.alpha]);
                    }}
                  >
                    {tr.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="cp-current">{t("color.noPalette")}</div>
      )}
    </div>
  );
}

function HexField({ hex, onCommit }: { hex: string; onCommit: (hex: string) => void }) {
  const [draft, setDraft] = useState(hex);
  useEffect(() => setDraft(hex), [hex]);
  const done = () => {
    const v = draft.trim().startsWith("#") ? draft.trim() : `#${draft.trim()}`;
    if (/^#[0-9a-f]{6}$/i.test(v)) onCommit(v);
    else setDraft(hex);
  };
  return (
    <input
      className="cp-hex"
      value={draft}
      title={t("color.hex")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => e.key === "Enter" && done()}
    />
  );
}

function ByteField({
  label,
  value,
  max = 255,
  title,
  onCommit,
}: {
  label: string;
  value: number;
  max?: number;
  title?: string;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const done = () => {
    const n = Number(draft);
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(0, Math.round(n))));
    else setDraft(String(value));
  };
  return (
    <label className="cp-byte" title={title ?? `${label} (0..${max})`}>
      <span>{label}</span>
      <input
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={done}
        onKeyDown={(e) => e.key === "Enter" && done()}
      />
    </label>
  );
}
