import { useLayoutEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from "react";

/**
 * Champ d’édition en place dans l’aperçu (double-clic) : reprend la police
 * de l’élément, Entrée / clic ailleurs valide, Échap annule.
 */
export function InlineInput({
  initial,
  onCommit,
  onCancel,
  style,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const done = useRef(false);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit && value !== initial) onCommit(value);
    else onCancel();
  };
  // Les événements restent dans le champ : ni glisser, ni sélection, ni raccourcis.
  const stop = (e: SyntheticEvent) => e.stopPropagation();

  return (
    <input
      ref={ref}
      value={value}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") finish(false);
      }}
      onPointerDown={stop}
      onMouseDown={stop}
      onClick={stop}
      onDoubleClick={stop}
      onContextMenu={stop}
      style={{
        font: "inherit",
        color: "inherit",
        lineHeight: "inherit",
        padding: 0,
        margin: 0,
        border: "none",
        outline: "1px solid #3d8bfd",
        background: "rgba(0, 0, 0, 0.45)",
        width: `${Math.max(2, value.length + 1)}ch`,
        minWidth: 24,
        boxSizing: "content-box",
        ...style,
      }}
    />
  );
}
