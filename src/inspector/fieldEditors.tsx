import { useState } from "react";
import type { CatalogField } from "../catalog/types";
import type { PropValue } from "../model/types";
import { NumberInput } from "../ui/NumberInput";
import { axisPrefixesForField, isColorField, vecLen } from "./axisPrefixes";
import { ColorPicker } from "./ColorPicker";
import { focusPanel, isPanelOpen, togglePanel } from "../app/dockApi";
import { useTintedImage } from "../gamestyle/gameAssets";
import { clampInitialXY } from "./propFilters";
import { t } from "../i18n";

function asLiteralNumber(value: PropValue | undefined): number | undefined {
  if (value?.kind === "literal" && typeof value.value === "number") {
    return value.value;
  }
  return undefined;
}

function asLiteralBool(value: PropValue | undefined): boolean {
  return value?.kind === "literal" && value.value === true;
}

function asLiteralString(value: PropValue | undefined): string {
  if (value?.kind === "literal" && typeof value.value === "string") {
    return value.value;
  }
  if (value?.kind === "enum") return value.value;
  return "";
}

function asLiteralVec(value: PropValue | undefined, len: number): number[] {
  if (
    value?.kind === "literal" &&
    Array.isArray(value.value) &&
    value.value.every((n) => typeof n === "number")
  ) {
    const arr = value.value as number[];
    const out = [...arr];
    while (out.length < len) out.push(0);
    return out.slice(0, len);
  }
  return Array.from({ length: len }, () => 0);
}

export function FieldEditor({
  field,
  value,
  enums,
  onChange,
  onError,
  placeholder,
}: {
  field: CatalogField;
  value: PropValue | undefined;
  enums: Record<string, string[]>;
  onChange: (next: PropValue) => void;
  onError?: (message: string | null) => void;
  placeholder?: boolean;
}) {
  if (field.kind === "unsupported") {
    return (
      <span className="insp-readonly">{t("propEditor.notEditable", { type: field.tealType })}</span>
    );
  }

  if (field.kind === "number-list") {
    // `{ 10, -1, 80 }` saisi « 10, -1, 80 » (columnWeights : -1 = largeur naturelle).
    return (
      <NumberListField
        value={value?.kind === "literal" && Array.isArray(value.value) ? (value.value as number[]) : []}
        onChange={(list) => onChange({ kind: "literal", value: list })}
      />
    );
  }

  if (field.kind === "scalar") {
    // `integer|number|string` : un nombre saisi est émis comme nombre
    // (`value = 2`), le reste comme texte (`value = "Overview"`), comme le vanilla.
    const shown =
      value?.kind === "literal" && (typeof value.value === "number" || typeof value.value === "string")
        ? String(value.value)
        : "";
    return (
      <input
        type="text"
        className={placeholder && !value ? "insp-placeholder" : undefined}
        placeholder={placeholder && !value ? "—" : undefined}
        title={t("propEditor.scalarHint")}
        value={shown}
        onChange={(e) => {
          const raw = e.target.value;
          const n = Number(raw);
          onChange({ kind: "literal", value: raw.trim() !== "" && Number.isFinite(n) ? n : raw });
        }}
      />
    );
  }

  if (field.kind === "boolean") {
    return (
      <input
        type="checkbox"
        className="insp-checkbox"
        checked={asLiteralBool(value)}
        onChange={(e) =>
          onChange({ kind: "literal", value: e.target.checked })
        }
      />
    );
  }

  if (field.kind === "string" && field.name === "path") {
    return <GameImagePathField value={asLiteralString(value)} onChange={(v) => onChange({ kind: "literal", value: v })} />;
  }

  if (field.kind === "string") {
    return (
      <input
        type="text"
        className={placeholder && !value ? "insp-placeholder" : undefined}
        placeholder={placeholder && !value ? "—" : undefined}
        value={asLiteralString(value)}
        onChange={(e) =>
          onChange({ kind: "literal", value: e.target.value })
        }
      />
    );
  }

  if (field.kind === "number" || field.kind === "integer") {
    const current = asLiteralNumber(value) ?? 0;
    const integer = field.kind === "integer";
    return (
      <NumberInput
        integer={integer}
        step={integer ? 1 : "any"}
        value={Number.isFinite(current) ? current : 0}
        className="insp-num"
        onCommit={(n) => {
          const clamped = clampInitialXY(field.name, n);
          if (!clamped.ok) {
            onError?.(clamped.message);
            return;
          }
          onError?.(null);
          onChange({ kind: "literal", value: clamped.value });
        }}
      />
    );
  }

  if (field.kind === "enum") {
    const choices = field.enumName ? (enums[field.enumName] ?? []) : [];
    // Valeur stockée qualifiée (`Orientation.Vertical`) : le code émis est
    // `builtin.type.Orientation.Vertical` ; `builtin.type.Vertical` serait nil.
    const stored =
      value?.kind === "enum" ? value.value : asLiteralString(value) || "";
    const current = stored.split(".").pop() || choices[0] || "";
    return (
      <select
        className="insp-enum"
        value={current}
        onChange={(e) =>
          onChange({
            kind: "enum",
            value: field.enumName
              ? `${field.enumName}.${e.target.value}`
              : e.target.value,
          })
        }
      >
        {choices.length === 0 ? (
          <option value={current}>{current || "(vide)"}</option>
        ) : (
          choices.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))
        )}
      </select>
    );
  }

  const len = vecLen(field.kind);
  if (len > 0) {
    const vec = asLiteralVec(value, len);
    const int = field.kind === "vec2i";
    const prefixes = axisPrefixesForField(field);
    const color = isColorField(field) && len >= 3;
    // Couleur : le sélecteur suffit (RGB + alpha), pas de cases numériques.
    if (color) {
      return (
        <div className="insp-vec">
          <ColorPicker
            value={vec}
            len={len === 3 ? 3 : 4}
            allowPaletteRef={false}
            onChange={(next) => {
              // Props : la palette est copiée en valeurs (pas de .css.lua).
              if (Array.isArray(next)) onChange({ kind: "literal", value: next.slice(0, len) });
            }}
          />
        </div>
      );
    }
    return (
      <div className="insp-vec">
        {vec.map((n, i) => (
          <label key={i} className="insp-vec-cell" title={prefixes[i]}>
            <span className="insp-axis">{prefixes[i] ?? ""}</span>
            <NumberInput
              integer={int}
              step={int ? 1 : "any"}
              value={n}
              onCommit={(v) => {
                const next = [...vec];
                next[i] = v;
                onChange({ kind: "literal", value: next });
              }}
            />
          </label>
        ))}
      </div>
    );
  }

  if (field.kind === "handler") {
    const fn = value?.kind === "handler" ? value.fn : "";
    return (
      <input
        type="text"
        placeholder={t("propEditor.functionName")}
        value={fn}
        onChange={(e) => onChange({ kind: "handler", fn: e.target.value })}
      />
    );
  }

  return <span className="insp-readonly">{field.kind}</span>;
}

/** Textarea Lua agrandie au focus. */
export function LuaCodeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      className={`insp-lua${focused ? " focused" : ""}`}
      rows={focused ? 6 : 2}
      value={value}
      placeholder={t("propEditor.luaExpression")}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * `path` d’une image du jeu (ImageView, ColumnDesc) : vignette, saisie et
 * accès au panneau « Icônes du jeu » (glisser une icône crée un ImageView).
 */
function GameImagePathField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const img = useTintedImage(value || undefined, value ? [1, 1, 1, 1] : undefined);
  return (
    <div className="insp-image-path">
      <span className="insp-image-thumb" title={img ? `${img.width}×${img.height} px` : t("propEditor.imageNotFound")}>
        {img ? <img src={img.url} alt="" /> : "?"}
      </span>
      <input
        type="text"
        value={value}
        placeholder="::/gui/…/image.tga"
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        title={t("propEditor.pickIcon")}
        onClick={() => {
          if (!isPanelOpen("gameIcons")) togglePanel("gameIcons");
          focusPanel("gameIcons");
        }}
      >
        {t("propEditor.icons")}
      </button>
    </div>
  );
}

/** Liste de nombres séparés par des virgules ; validée à la sortie du champ. */
function NumberListField({ value, onChange }: { value: number[]; onChange: (list: number[]) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value.join(", ");
  return (
    <input
      type="text"
      title={t("propEditor.numberListHint")}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === null) return;
        const parts = draft.split(",").map((p) => p.trim()).filter(Boolean);
        const list = parts.map(Number);
        if (list.every((n) => Number.isFinite(n))) onChange(list);
        setDraft(null);
      }}
    />
  );
}
