import { t } from "../i18n";
/**
 * Lecture du journal du jeu (`<données utilisateur>/crash_dump/stdout.txt`,
 * réécrit à chaque lancement). Format observé :
 *
 *   [2026-10-16 21:10:29Z - ERROR    - Main Thread      - Main           ]+ Wrapper recipe must return child
 *       | DetailMessage: expectedRecipeId=39, expectedName=Window
 *       +     ::/gui/main/react.lua(282): ?
 */

export interface GameLogEntry {
  time: string;
  level: string;
  message: string;
  details: string[];
}

const HEADER = /^\[(\S+ \S+) - (\w+)\s*- [^\]]*\]\+?\s?(.*)$/;

export function parseGameLog(text: string): GameLogEntry[] {
  const entries: GameLogEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(HEADER);
    if (m) {
      entries.push({ time: m[1]!, level: m[2]!, message: m[3]!.trim(), details: [] });
    } else if (entries.length > 0 && raw.trim() !== "") {
      entries[entries.length - 1]!.details.push(raw.replace(/^\s*[|+]\s?/, "").trimEnd());
    }
  }
  return entries;
}

export interface GameLogIssue {
  severity: "error" | "warning" | "info";
  message: string;
}

/**
 * Problèmes du journal qui concernent le mod : erreurs qui citent le mod ou
 * ses recettes, erreurs du runtime React, assertions, et le crash final.
 */
export function gameLogIssues(
  entries: GameLogEntry[],
  opts: { modId: string; recipeNames: string[] },
): GameLogIssue[] {
  const needles = [opts.modId, ...opts.recipeNames, "react.lua", "/gui/"].filter(Boolean);
  const relevant = (e: GameLogEntry) => {
    const all = `${e.message}\n${e.details.join("\n")}`;
    return needles.some((n) => all.includes(n));
  };
  const issues: GameLogIssue[] = [];
  let crashed = false;
  entries.forEach((e, i) => {
    if (/Calling HandleCrash|Ungraceful exit/.test(e.message)) {
      crashed = true;
      return;
    }
    if (e.level === "ERROR" && relevant(e)) {
      // Recette en cause, si le moteur l’a précisée juste après.
      const where = entries
        .slice(i + 1, i + 4)
        .map((x) => x.message.match(/happened inside .*name = ([\w.]+)/)?.[1])
        .find(Boolean);
      const detail = e.details.find((d) => d.startsWith("DetailMessage:"));
      issues.push({
        severity: "error",
        message: [
          where ? t("runtime.inRecipe", { message: e.message, where }) : e.message,
          detail ? detail.replace("DetailMessage: ", "") : null,
          `${e.time}`,
        ]
          .filter(Boolean)
          .join(" — "),
      });
    } else if (e.level === "WARNING" && /Assertion '/.test(e.message)) {
      issues.push({ severity: "error", message: `${e.message} — ${e.time}` });
    }
  });
  if (crashed) {
    issues.unshift({
      severity: "error",
      message: t("runtime.gameCrashed"),
    });
  }
  // Dédoublonne (une même erreur peut se répéter à chaque rendu).
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = i.message
      .replace(/ — \d{4}-\d\d-\d\d.*$/, "")
      .replace(/ \(dans [\w.]+\)/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
