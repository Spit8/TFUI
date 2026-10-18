import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { open } from "yauzl-promise";

/**
 * Banc de rendu de développement (pas l’app, pas le bundle) : sert
 * `harness.html`, qui affiche un écran d’un projet .tfui.json avec les
 * styles, polices et images du jeu lus via `fixtures/base-content` (lien vers
 * l’installation, voir `pnpm link-game`). Rien n’est copié.
 *
 *   pnpm exec vite --config vite.harness.config.ts
 *   http://localhost:1430/harness.html?project=<chemin .tfui.json>
 */
function devGameFiles(): Plugin {
  const zipCache = new Map<string, Map<string, Buffer>>();
  async function readEntry(zipName: string, entry: string): Promise<Buffer | null> {
    if (!/^[\w.-]+\.zip$/.test(zipName)) return null;
    let entries = zipCache.get(zipName);
    if (!entries) {
      entries = new Map();
      const zip = await open(join(process.cwd(), "fixtures", "base-content", zipName));
      try {
        for await (const e of zip) {
          const name = e.filename.replace(/\\/g, "/");
          if (/\.(tga|ttf|otf|lua|tl)$/i.test(name)) {
            const chunks: Buffer[] = [];
            for await (const c of await e.openReadStream()) chunks.push(c as Buffer);
            entries.set(name, Buffer.concat(chunks));
          }
        }
      } finally {
        await zip.close();
      }
      zipCache.set(zipName, entries);
    }
    return entries.get(entry) ?? null;
  }
  return {
    name: "tfui-dev-game-files",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "", "http://x");
        try {
          if (url.pathname === "/__tfui-dev/zip") {
            const data = await readEntry(url.searchParams.get("zip") ?? "", url.searchParams.get("entry") ?? "");
            if (!data) {
              res.statusCode = 404;
              res.end();
              return;
            }
            res.setHeader("Content-Type", "application/octet-stream");
            res.end(data);
            return;
          }
          if (url.pathname === "/__tfui-dev/project") {
            const path = url.searchParams.get("path") ?? "";
            if (!path.endsWith(".tfui.json")) {
              res.statusCode = 400;
              res.end();
              return;
            }
            res.setHeader("Content-Type", "application/json");
            res.end(readFileSync(path, "utf8"));
            return;
          }
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devGameFiles()],
  clearScreen: false,
  server: { port: 1430, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
});
