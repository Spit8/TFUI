/** Normalize Lua source for stable comparison. */
export function normalizeLua(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n+$/g, "\n");
}
