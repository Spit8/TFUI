import luaparse from "luaparse";
import type { GeneratedFile, LuaSyntaxError } from "./types";

export function validateLuaContent(
  path: string,
  content: string,
): LuaSyntaxError[] {
  try {
    luaparse.parse(content, {
      luaVersion: "5.3",
      locations: true,
    });
    return [];
  } catch (e) {
    const err = e as { message?: string; line?: number };
    return [
      {
        path,
        message: err.message ?? String(e),
        line: typeof err.line === "number" ? err.line : undefined,
      },
    ];
  }
}

export function validateGeneratedFiles(
  files: GeneratedFile[],
): LuaSyntaxError[] {
  return files.flatMap((f) => validateLuaContent(f.path, f.content));
}
