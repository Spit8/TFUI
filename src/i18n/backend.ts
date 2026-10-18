import { hasKey, translateKey, type MessageParams } from "./index";

/**
 * Code de message du backend : `E:<clé>` ou `E:<clé>:<json plat>`, n’importe
 * où dans le texte (contexte avant, trace d’appels après). Doit suivre un
 * début de texte, un espace, `:` ou `(` : un chemin `E:\…` n’est jamais pris
 * pour un code.
 */
const CODE_RE =
  /(^|[\s:(])E:([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)(?::(\{(?:[^{}"]|"(?:[^"\\]|\\.)*")*\}))?/g;

function translateCode(key: string, json: string | undefined): string | null {
  if (!hasKey(`backend.${key}`)) return null;
  const params: MessageParams = {};
  if (json) {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== "object") return null;
      // Un paramètre peut lui-même être un message du backend (détail).
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        params[k] = typeof v === "string" ? backendMessage(v) : (v as MessageParams[string]);
      }
    } catch {
      return null;
    }
  }
  return translateKey(`backend.${key}`, params);
}

/**
 * Messages du backend Rust et du banc Lua : chaque code est traduit avec la
 * clé `backend.<clé>` ; le reste du texte (erreur système, trace) est gardé.
 */
export function backendMessage(raw: string): string {
  return raw.replace(CODE_RE, (whole, before: string, key: string, json: string | undefined) => {
    const text = translateCode(key, json);
    return text === null ? whole : before + text;
  });
}

/** Message d’une erreur quelconque (Error, chaîne du backend…). */
export function errorMessage(error: unknown): string {
  return backendMessage(error instanceof Error ? error.message : String(error));
}
