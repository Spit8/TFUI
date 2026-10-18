/** Minimal path helpers (browser + Tauri Windows). */

export function dirname(path: string): string {
  const normalized = path.replace(/\//g, "\\");
  const i = normalized.lastIndexOf("\\");
  if (i <= 0) return normalized;
  return normalized.slice(0, i);
}

export function join(...parts: string[]): string {
  const sep = "\\";
  const cleaned = parts
    .filter((p) => p.length > 0)
    .map((p, i) => {
      let s = p.replace(/\//g, "\\");
      if (i > 0) s = s.replace(/^\\+/, "");
      s = s.replace(/\\+$/, "");
      return s;
    });
  return cleaned.join(sep);
}

export function basename(path: string): string {
  const normalized = path.replace(/\//g, "\\");
  const i = normalized.lastIndexOf("\\");
  return i >= 0 ? normalized.slice(i + 1) : normalized;
}
