import { existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

// Installation Steam par défaut ; sinon : pnpm link-game -- --root "<dossier du jeu>".
const DEFAULT_TF3_ROOT = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Transport Fever 3";
const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const FIXTURES = join(ROOT, "fixtures");

const LINKS: { name: string; relative: string }[] = [
  { name: "api-tealdef", relative: join("api", "tealdef") },
  { name: "base-tealdef", relative: join("base", "tealdef") },
  { name: "base-content", relative: join("base", "content") },
];

function parseRoot(argv: string[]): string {
  const idx = argv.indexOf("--root");
  if (idx >= 0 && argv[idx + 1]) {
    return resolve(argv[idx + 1]);
  }
  if (process.env.TF3_ROOT) {
    return resolve(process.env.TF3_ROOT);
  }
  return DEFAULT_TF3_ROOT;
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function createJunction(linkPath: string, target: string): void {
  if (existsSync(linkPath) || isLink(linkPath)) {
    rmSync(linkPath, { recursive: true, force: true });
  }
  if (process.platform === "win32") {
    const result = spawnSync(
      "cmd",
      ["/c", "mklink", "/J", linkPath, target],
      { encoding: "utf8" },
    );
    if (result.status !== 0) {
      throw new Error(
        `mklink a échoué pour ${linkPath}: ${result.stderr || result.stdout}`,
      );
    }
  } else {
    const result = spawnSync("ln", ["-s", target, linkPath], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(
        `ln -s a échoué pour ${linkPath}: ${result.stderr || result.stdout}`,
      );
    }
  }
}

function main(): void {
  const tf3Root = parseRoot(process.argv.slice(2));
  const builtin = join(tf3Root, "base", "tealdef", "scripts", "builtin.d.tl");
  const apiTealdef = join(tf3Root, "api", "tealdef");

  if (!existsSync(tf3Root)) {
    console.error(`TF3_ROOT introuvable : ${tf3Root}`);
    console.error("Passez --root \"<chemin>\" ou définissez TF3_ROOT.");
    process.exit(1);
  }
  if (!existsSync(apiTealdef)) {
    console.error(`Dossier manquant : ${apiTealdef}`);
    process.exit(1);
  }
  if (!existsSync(builtin)) {
    console.error(`Fichier manquant : ${builtin}`);
    process.exit(1);
  }

  mkdirSync(FIXTURES, { recursive: true });

  for (const link of LINKS) {
    const target = join(tf3Root, link.relative);
    if (!existsSync(target)) {
      console.error(`Cible manquante : ${target}`);
      process.exit(1);
    }
    const linkPath = join(FIXTURES, link.name);
    createJunction(linkPath, target);
    console.log(`OK  fixtures/${link.name} → ${target}`);
  }

  console.log("\nLien jeu créé. Lancez pnpm extract-catalog.");
}

main();
