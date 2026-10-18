/**
 * Fichier de handlers de l’utilisateur : `<fileBase>.handlers.lua`.
 *
 * Il appartient à l’utilisateur : l’éditeur le crée une seule fois (stubs ou
 * migration des anciennes régions `@tfui:user handlers`), puis ne l’écrit plus
 * jamais, sauf ajout de stubs demandé explicitement. Le `.script.lua` généré
 * le charge par `ug_require "<modId>::/<guiDir>/<fileBase>.handlers.lua"`
 * (chemin vérifié en jeu le 2026-10-17 ; sans le préfixe `<modId>::`, le jeu
 * ne trouve pas le fichier).
 */

const LUA_KEYWORDS = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
  "goto", "if", "in", "local", "nil", "not", "or", "repeat", "return", "then",
  "true", "until", "while",
]);

export function isLuaIdentifier(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !LUA_KEYWORDS.has(name);
}

export function handlersFileName(fileBase: string): string {
  return `${fileBase}.handlers.lua`;
}

/** Chemin de `ug_require`, même forme que le `filePath` des plugins (genRes). */
export function handlersModulePath(modId: string, guiDir: string, fileBase: string): string {
  const dir = guiDir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return `${modId}::/${dir}/${handlersFileName(fileBase)}`;
}

export function handlerStub(name: string): string {
  return `function handlers.${name}()\n\t-- votre code ici\nend\n`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Le fichier déclare-t-il ce handler ? (heuristique : avertissement seulement) */
export function declaresHandler(content: string, name: string): boolean {
  const n = escapeRe(name);
  return new RegExp(
    `function\\s+handlers\\.${n}\\s*\\(|handlers\\.${n}\\s*=|handlers\\[\\s*["']${n}["']\\s*\\]\\s*=|^\\s*${n}\\s*=`,
    "m",
  ).test(content);
}

export function missingHandlers(content: string, names: string[]): string[] {
  return names.filter((n) => !declaresHandler(content, n));
}

/** Modules du jeu que du code repris d’une ancienne région peut utiliser. */
function requiresFor(body: string): string[] {
  const lines: string[] = [];
  if (/\breact\./.test(body)) lines.push(`local react = ug_require "::/gui/main/react.lua"`);
  if (/\bbuiltin\./.test(body)) lines.push(`local builtin = ug_require "::/gui/main/builtin.lua"`);
  return lines;
}

/**
 * Contenu initial du fichier. `legacyRegion` : corps de l’ancienne région
 * `user:handlers` du `.script.lua`, repris tel quel ; ses fonctions sont
 * exposées dans la table `handlers`.
 */
export function genHandlersFile(opts: {
  fileBase: string;
  handlerNames: string[];
  legacyRegion?: string;
}): string {
  const legacy = (opts.legacyRegion ?? "").replace(/\r\n/g, "\n").trim();
  const hasLegacy = legacy.length > 0 && legacy !== "-- vos handlers ici";
  const out: string[] = [
    `-- Handlers de ${opts.fileBase} : ce fichier est à vous.`,
    `-- TFUI le crée une seule fois et ne le modifie jamais ensuite.`,
    `-- Chargé par ${opts.fileBase}.script.lua (généré) ; chaque handler choisi dans`,
    `-- l’éditeur doit exister ici sous la forme handlers.<nom>.`,
  ];
  const requires = hasLegacy ? requiresFor(legacy) : [];
  if (requires.length > 0) out.push(...requires);
  out.push(`local handlers = {}`, ``);

  const declared = new Set<string>();
  if (hasLegacy) {
    out.push(`-- Repris de ${opts.fileBase}.script.lua (ancienne région @tfui:user handlers)`);
    out.push(legacy, ``);
    for (const name of opts.handlerNames) {
      if (new RegExp(`(local\\s+)?function\\s+${escapeRe(name)}\\s*\\(`).test(legacy)) {
        out.push(`handlers.${name} = ${name}`);
        declared.add(name);
      }
    }
    if (declared.size > 0) out.push(``);
  }
  for (const name of opts.handlerNames) {
    if (!declared.has(name)) out.push(handlerStub(name));
  }
  out.push(`return handlers`, ``);
  return out.join("\n");
}

/**
 * Ajoute des stubs juste avant le dernier `return handlers` (ajout seulement,
 * le reste du fichier est inchangé). `null` si ce `return` est introuvable.
 */
export function appendHandlerStubs(content: string, names: string[]): string | null {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*return\s+handlers\s*$/.test(lines[i]!)) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const stubs = names.flatMap((n) => handlerStub(n).split("\n"));
  lines.splice(idx, 0, ...stubs);
  return lines.join(eol);
}
