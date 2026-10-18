import { useEffect, useState, type KeyboardEvent } from "react";

export interface NumberInputProps {
  value: number;
  onCommit: (value: number) => void;
  step?: number | "any";
  className?: string;
  title?: string;
  integer?: boolean;
}

/**
 * Champ nombre avec brouillon local — ne commit que blur / Entrée si fini.
 * Évite NaN pendant la saisie partielle (`-`, `0.`, vide).
 */
export function NumberInput({
  value,
  onCommit,
  step = "any",
  className,
  title,
  integer = false,
}: NumberInputProps) {
  const [draft, setDraft] = useState(() => format(value, integer));

  useEffect(() => {
    setDraft(format(value, integer));
  }, [value, integer]);

  function tryCommit(raw: string): boolean {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") {
      setDraft(format(value, integer));
      return false;
    }
    const n = integer ? Number.parseInt(trimmed, 10) : Number.parseFloat(trimmed);
    if (!Number.isFinite(n)) {
      setDraft(format(value, integer));
      return false;
    }
    onCommit(n);
    setDraft(format(n, integer));
    return true;
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      tryCommit(draft);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setDraft(format(value, integer));
      (e.target as HTMLInputElement).blur();
    }
  }

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      className={className}
      title={title ?? (step === "any" ? undefined : `step ${step}`)}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => tryCommit(draft)}
      onKeyDown={onKeyDown}
    />
  );
}

function format(n: number, integer: boolean): string {
  if (!Number.isFinite(n)) return "0";
  return integer ? String(Math.trunc(n)) : String(n);
}
