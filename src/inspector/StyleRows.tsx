import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { isPaletteColor } from "../model/paletteColor";
import type { AllowedStyleKeys } from "../model/styleKeys";
import type { StyleProps } from "../model/types";
import { NumberInput } from "../ui/NumberInput";
import {
  asVector,
  formatStyleValue,
  initialStyleValue,
  isColorSpec,
  isPreviewedStyleKey,
  parseStyleValue,
  SCALAR_STYLE_SPECS,
  STYLE_KEY_SPECS,
  styleKeyHint,
  styleKeyLabel,
} from "./styleValue";
import { ColorPicker } from "./ColorPicker";
import { usePendingKeys } from "./usePendingKeys";
import "./StyleRows.css";
import { t } from "../i18n";

/** Éditeur d’une valeur : vecteur numérique pour les clés connues, texte sinon. */
export function StyleValueEditor({
  styleKey,
  value,
  onCommit,
}: {
  styleKey: string;
  value: unknown;
  onCommit: (next: unknown) => void;
}) {
  const scalar = SCALAR_STYLE_SPECS[styleKey];
  if (scalar) return <ScalarEditor styleKey={styleKey} value={value} onCommit={onCommit} />;
  const spec = STYLE_KEY_SPECS[styleKey];
  const isColor = spec ? isColorSpec(spec) : false;
  if (isColor && isPaletteColor(value)) {
    return (
      <div className="style-vec" title={spec!.hint}>
        <ColorPicker value={value} onChange={onCommit} />
        <span
          className="style-palette-name"
          title={t("styleRows.paletteName")}
        >
          {value.name}
          {value.alpha !== undefined ? ` · ${value.alpha}` : ""}
        </span>
      </div>
    );
  }
  const vec = spec ? asVector(value, spec.len) : null;
  if (spec && vec && isColor) {
    // Couleur : le sélecteur suffit (RGB + alpha + palette), pas de cases numériques.
    return (
      <div className="style-vec" title={spec.hint}>
        <ColorPicker value={vec} onChange={onCommit} />
      </div>
    );
  }
  if (spec && vec) {
    return (
      <div className="style-vec" title={spec.hint}>
        {vec.map((n, i) => (
          <NumberInput
            key={i}
            value={n}
            title={spec.parts[i]}
            onCommit={(raw) => {
              let v = raw;
              if (spec.min !== undefined) v = Math.max(spec.min, v);
              if (spec.max !== undefined) v = Math.min(spec.max, v);
              const next = [...vec];
              next[i] = v;
              onCommit(next);
            }}
          />
        ))}
      </div>
    );
  }
  return <StyleTextInput value={value} onCommit={onCommit} />;
}

/** Nombre, booléen ou valeur parmi une liste (SCALAR_STYLE_SPECS). */
function ScalarEditor({
  styleKey,
  value,
  onCommit,
}: {
  styleKey: string;
  value: unknown;
  onCommit: (next: unknown) => void;
}) {
  const spec = SCALAR_STYLE_SPECS[styleKey]!;
  if (spec.kind === "number" && (value === undefined || typeof value === "number")) {
    return (
      <div className="style-vec" title={spec.hint}>
        <NumberInput
          value={typeof value === "number" ? value : spec.initial}
          onCommit={(n) => onCommit(spec.min !== undefined ? Math.max(spec.min, n) : n)}
        />
      </div>
    );
  }
  if (spec.kind === "boolean" && (value === undefined || typeof value === "boolean")) {
    return (
      <label className="style-vec style-bool" title={spec.hint}>
        <input
          type="checkbox"
          checked={typeof value === "boolean" ? value : spec.initial}
          onChange={(e) => onCommit(e.target.checked)}
        />
      </label>
    );
  }
  if (spec.kind === "enum" && (value === undefined || typeof value === "string")) {
    const current = typeof value === "string" ? value : spec.initial;
    // Valeur d’un ancien projet hors liste : gardée visible.
    const values = spec.values.includes(current) ? spec.values : [current, ...spec.values];
    return (
      <select
        className="style-text"
        title={spec.hint}
        value={current}
        onChange={(e) => onCommit(e.target.value)}
      >
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }
  // Valeur d’une autre forme (projet antérieur) : saisie libre.
  return <StyleTextInput value={value} onCommit={onCommit} />;
}

function StyleTextInput({
  value,
  onCommit,
}: {
  value: unknown;
  onCommit: (next: unknown) => void;
}) {
  const [draft, setDraft] = useState(formatStyleValue(value));
  useEffect(() => setDraft(formatStyleValue(value)), [value]);
  const commit = () => {
    const parsed = parseStyleValue(draft);
    if (parsed === undefined) setDraft(formatStyleValue(value));
    else onCommit(parsed);
  };
  return (
    <input
      type="text"
      className="style-text"
      value={draft}
      title={t("styleRows.textHint")}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setDraft(formatStyleValue(value));
        }
      }}
    />
  );
}

/** Ordre proposé : clés à éditeur dédié (ordre des specs), puis les autres. */
const DEDICATED_ORDER = [...Object.keys(STYLE_KEY_SPECS), ...Object.keys(SCALAR_STYLE_SPECS)];

/**
 * Champ « + Propriété » : seulement les propriétés autorisées pour ce que
 * vise la règle (model/styleKeys.ts) ; une saisie hors liste est refusée.
 */
export function StyleKeyAdder({
  allowed,
  exclude,
  onAdd,
}: {
  allowed: AllowedStyleKeys;
  exclude: string[];
  onAdd: (key: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  if (allowed.limitation === "helper") {
    return <div className="style-adder-note">{t("styleRows.helperNoStyle")}</div>;
  }
  const keys = [...allowed.keys.keys()];
  const options = [
    ...DEDICATED_ORDER.filter((k) => allowed.keys.has(k)),
    ...keys.filter((k) => !DEDICATED_ORDER.includes(k)).sort(),
  ].filter((k) => !exclude.includes(k));
  const key = draft.trim();
  const refused = key !== "" && !allowed.keys.has(key);
  const refusedText = t("styleRows.keyRefused", { key, elements: allowed.elements.join(", ") || "—" });
  const submit = () => {
    if (!key || refused || exclude.includes(key)) return;
    onAdd(key);
    setDraft("");
  };
  return (
    <>
      <div className="style-adder">
        <input
          type="text"
          list={listId}
          placeholder={t("styleRows.addProperty")}
          value={draft}
          aria-invalid={refused}
          title={refused ? refusedText : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" disabled={!key || refused} onClick={submit}>
          {t("nodeClasses.add")}
        </button>
        <datalist id={listId}>
          {options.map((k) => (
            <option
              key={k}
              value={k}
              label={allowed.keys.get(k) === "common" ? t("styleRows.evidenceCommon") : styleKeyLabel(k)}
            />
          ))}
        </datalist>
      </div>
      {refused ? <div className="style-adder-note warn">{refusedText}</div> : null}
      {allowed.limitation === "noVocabulary" ? (
        <div className="style-adder-note">{t("styleRows.rescanForKeys")}</div>
      ) : null}
    </>
  );
}

/** Une ligne « clé | valeur | badge | ✕ ». */
export function StyleRow({
  styleKey,
  value,
  onCommit,
  onRemove,
  badge,
  muted,
  notAllowed,
}: {
  styleKey: string;
  value: unknown;
  onCommit: (next: unknown) => void;
  onRemove?: () => void;
  badge?: React.ReactNode;
  muted?: boolean;
  /** Raison affichée quand la propriété n’est pas autorisée pour ce qu’elle vise. */
  notAllowed?: string;
}) {
  const label = styleKeyLabel(styleKey);
  return (
    <div className={`style-row${muted ? " inherited" : ""}${notAllowed ? " not-allowed" : ""}`}>
      <span className="style-key" title={notAllowed ?? styleKeyHint(styleKey) ?? styleKey}>
        {styleKey}
        {label ? <span className="style-key-role"> ({label})</span> : null}
        {!isPreviewedStyleKey(styleKey) ? (
          <span className="style-nopreview" title={t("styleRows.notPreviewed")}>
            ◌
          </span>
        ) : null}
      </span>
      <StyleValueEditor styleKey={styleKey} value={value} onCommit={onCommit} />
      <span className="style-origin">{badge}</span>
      {onRemove ? (
        <button
          type="button"
          className="style-remove"
          title={t("styleRows.remove")}
          onClick={onRemove}
        >
          <X size={12} />
        </button>
      ) : (
        <span className="style-remove-placeholder" />
      )}
    </div>
  );
}

/** Éditeur de toutes les propriétés d’une règle (classes partagées). */
export function StylePropsEditor({
  props,
  allowed,
  onSet,
}: {
  props: StyleProps;
  allowed: AllowedStyleKeys;
  onSet: (key: string, value: unknown) => void;
}) {
  const refusedHint = (k: string) =>
    allowed.keys.has(k)
      ? undefined
      : t("styleRows.notAllowed", { key: k, elements: allowed.elements.join(", ") || "—" });
  const values = props as Record<string, unknown>;
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  const pending = usePendingKeys(keys);
  return (
    <div className="style-rows">
      {keys.length === 0 && pending.keys.length === 0 ? (
        <div className="style-empty">{t("styleRows.empty")}</div>
      ) : null}
      {keys.map((k) => (
        <StyleRow
          key={k}
          styleKey={k}
          value={values[k]}
          notAllowed={refusedHint(k)}
          onCommit={(v) => onSet(k, v)}
          onRemove={() => onSet(k, undefined)}
        />
      ))}
      {pending.keys.map((k) => (
        <StyleRow
          key={k}
          styleKey={k}
          value={undefined}
          onCommit={(v) => onSet(k, v)}
          onRemove={() => pending.remove(k)}
        />
      ))}
      <StyleKeyAdder
        allowed={allowed}
        exclude={[...keys, ...pending.keys]}
        onAdd={(k) => {
          const v = initialStyleValue(k);
          if (v === undefined) pending.add(k);
          else onSet(k, v);
        }}
      />
    </div>
  );
}
