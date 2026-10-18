import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function projectRoot(): string {
  return ROOT;
}

export function fixturesBaseTealdef(): string {
  return join(ROOT, "fixtures", "base-tealdef");
}

export function fixturesBaseContent(): string {
  return join(ROOT, "fixtures", "base-content");
}

export function fixturesLinked(): boolean {
  return existsSync(join(fixturesBaseTealdef(), "scripts", "builtin.d.tl"));
}

export const FIXTURES_SKIP_MESSAGE =
  "fixtures/ non lié — lancer `pnpm link-game`";
