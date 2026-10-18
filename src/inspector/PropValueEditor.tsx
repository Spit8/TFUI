import { useRef, useState } from "react";
import { getCommandContext } from "../app/commands";
import type { CatalogField } from "../catalog/types";
import type { PropValue, StateVar } from "../model/types";
import { MenuList } from "../ui/menu/MenuList";
import type { MenuItem } from "../ui/menu/types";
import { FieldEditor, LuaCodeEditor } from "./fieldEditors";
import {
  defaultForMode,
  modeIcon,
  modeLabel,
  modeOf,
  modesForField,
} from "./propMode";
import { t } from "../i18n";

export function PropValueEditor({
  field,
  value,
  enums,
  stateVars,
  onChange,
  onUnset,
  onError,
  hideMode,
}: {
  field: CatalogField;
  value: PropValue | undefined;
  enums: Record<string, string[]>;
  stateVars: StateVar[];
  onChange: (next: PropValue) => void;
  onUnset?: () => void;
  onError?: (message: string | null) => void;
  hideMode?: boolean;
}) {
  const mode = modeOf(value, field);
  const defined = value !== undefined;
  const modes = modesForField(field);
  const [menuOpen, setMenuOpen] = useState(false);
  const modeBtnRef = useRef<HTMLButtonElement>(null);
  const nonLiteral = mode !== "literal" && mode !== "enum";

  const modeItems: MenuItem[] = modes.map((m) => ({
    type: "label" as const,
    text: `${modeIcon(m)}  ${modeLabel(m)}`,
    onClick: () => {
      onChange(defaultForMode(m, field));
      onError?.(null);
    },
  }));

  return (
    <>
      <div className={`insp-prop-value${mode === "lua" ? " tall" : ""}`}>
        {mode === "state" ? (
          <select
            className="insp-enum"
            value={value?.kind === "state" ? value.stateVar : ""}
            onChange={(e) =>
              onChange({ kind: "state", stateVar: e.target.value })
            }
          >
            <option value="">{t("propEditor.noState")}</option>
            {stateVars.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}

        {mode === "lua" ? (
          <LuaCodeEditor
            value={value?.kind === "lua" ? value.code : ""}
            onChange={(code) => onChange({ kind: "lua", code })}
          />
        ) : null}

        {mode === "handler" && field.kind !== "handler" ? (
          <input
            type="text"
            value={value?.kind === "handler" ? value.fn : ""}
            onChange={(e) =>
              onChange({ kind: "handler", fn: e.target.value })
            }
            placeholder={t("propEditor.functionName")}
          />
        ) : null}

        {mode === "literal" ||
        mode === "enum" ||
        (mode === "handler" && field.kind === "handler") ? (
          <FieldEditor
            field={field}
            value={value}
            enums={enums}
            onChange={onChange}
            onError={onError}
            placeholder={!defined}
          />
        ) : null}
      </div>

      {!hideMode ? (
        <div className={`insp-prop-mode${nonLiteral ? " always" : ""}`}>
          {onUnset && defined ? (
            <button
              type="button"
              className="insp-unset"
              title={t("propEditor.unset")}
              aria-label={t("propEditor.unset")}
              onClick={() => {
                onUnset();
                onError?.(null);
              }}
            >
              ↺
            </button>
          ) : null}
          <button
            ref={modeBtnRef}
            type="button"
            className={`insp-mode-btn mode-${mode}`}
            title={t("propEditor.modeTitle", { mode: modeLabel(mode) })}
            aria-label={t("propEditor.modeAria", { mode: modeLabel(mode) })}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {modeIcon(mode)}
          </button>
          {menuOpen && modeBtnRef.current ? (
            <MenuList
              items={modeItems}
              anchor={{
                x: modeBtnRef.current.getBoundingClientRect().right,
                y: modeBtnRef.current.getBoundingClientRect().bottom,
              }}
              ctx={getCommandContext()}
              onClose={() => setMenuOpen(false)}
              mode="context"
            />
          ) : null}
        </div>
      ) : onUnset && defined ? (
        <div className="insp-prop-mode always">
          <button
            type="button"
            className="insp-unset"
            title={t("propEditor.unset")}
            onClick={() => {
              onUnset();
              onError?.(null);
            }}
          >
            ↺
          </button>
        </div>
      ) : (
        <div className="insp-prop-mode" />
      )}
    </>
  );
}
