export interface SourceMapEntry {
  nodeId: string;
  startLine: number;
  endLine: number;
}

export interface GeneratedFile {
  path: string;
  content: string;
  sourceMap: SourceMapEntry[];
  kind: "script" | "css" | "res";
  screenId?: string;
  /** Script : handlers attendus dans `<fileBase>.handlers.lua`. */
  handlers?: string[];
}

export interface LuaSyntaxError {
  path: string;
  message: string;
  line?: number;
}

/** Info codegen visible dans Problèmes / badge inspecteur (R19). */
export interface GenerationNotice {
  id: string;
  message: string;
  screenId?: string;
  nodeId?: string;
  propKey?: string;
}
