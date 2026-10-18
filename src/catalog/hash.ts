/** FNV-1a 64-bit hex — pure JS, usable in Node and browser. */
export function hashText(source: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < source.length; i++) {
    h ^= BigInt(source.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}
