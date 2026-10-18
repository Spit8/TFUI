import { afterEach, describe, expect, it } from "vitest";
import { backendMessage } from "./backend";
import { flattenMessages, formatMessage } from "./format";
import { availableLanguages, setLanguage, setUserLocales, t, translateKey } from "./index";

afterEach(() => {
  setUserLocales({});
  setLanguage("fr");
});

describe("formatMessage", () => {
  it("interpole les paramètres, garde les inconnus", () => {
    expect(formatMessage("{a} et {b}", { a: 1 })).toBe("1 et {b}");
  });

  it("pluriel selon la langue, =n prioritaire, # = nombre", () => {
    const tpl = "{n, plural, =0 {aucun fichier} one {# fichier} other {# fichiers}} de {who}";
    expect(formatMessage(tpl, { n: 0, who: "x" }, "fr")).toBe("aucun fichier de x");
    expect(formatMessage(tpl, { n: 1, who: "x" }, "fr")).toBe("1 fichier de x");
    // Français : 0 et 1 au singulier, sans =0 ; anglais : 0 au pluriel.
    expect(formatMessage("{n, plural, one {# a} other {# b}}", { n: 0 }, "fr")).toBe("0 a");
    expect(formatMessage("{n, plural, one {# a} other {# b}}", { n: 0 }, "en")).toBe("0 b");
    expect(formatMessage(tpl, { n: 1500, who: "x" }, "fr")).toMatch(/^1\s?500 fichiers de x$/);
  });

  it("aplatit les clés imbriquées", () => {
    expect(flattenMessages({ a: { b: "x", c: { d: "y" } }, e: 1 })).toEqual({ "a.b": "x", "a.c.d": "y" });
  });
});

describe("t()", () => {
  it("français par défaut", () => {
    expect(t("common.save")).toBe("Enregistrer");
  });

  it("langue utilisateur : complète, repli sur le français pour les clés absentes", () => {
    setUserLocales({ xx: JSON.stringify({ _meta: { name: "Test" }, common: { save: "Save" } }) });
    expect(availableLanguages().some((l) => l.code === "xx" && l.source === "user" && l.name === "Test")).toBe(true);
    setLanguage("xx");
    expect(t("common.save")).toBe("Save");
    expect(t("common.close")).toBe("Fermer");
  });

  it("un fr.json utilisateur corrige la base clé par clé", () => {
    setUserLocales({ fr: JSON.stringify({ common: { close: "Fermer la fenêtre" } }) });
    expect(t("common.close")).toBe("Fermer la fenêtre");
    expect(t("common.save")).toBe("Enregistrer");
  });

  it("langue inconnue → français ; clé absente → clé brute", () => {
    setLanguage("zz");
    expect(t("common.save")).toBe("Enregistrer");
    expect(translateKey("nope.missing")).toBe("nope.missing");
  });

  it("fichier utilisateur illisible : signalé, ignoré", () => {
    expect(setUserLocales({ bad: "{" })).toHaveLength(1);
  });
});

describe("backendMessage", () => {
  it("traduit les codes E:<clé>:<json>, laisse le texte brut", () => {
    setUserLocales({ fr: JSON.stringify({ backend: { test: { x: "Fichier {path} introuvable" } } }) });
    expect(backendMessage('E:test.x:{"path":"a.lua"}')).toBe("Fichier a.lua introuvable");
    expect(backendMessage('Erreur : E:test.x:{"path":"b"}')).toBe("Erreur : Fichier b introuvable");
    expect(backendMessage("Permission denied (os error 5)")).toBe("Permission denied (os error 5)");
    expect(backendMessage("E:inconnu.cle:{}")).toBe("E:inconnu.cle:{}");
    // Un chemin Windows sur le lecteur E: n’est pas un code.
    expect(backendMessage("Dossier manquant : D:\\Jeux\\TF3")).toBe("Dossier manquant : D:\\Jeux\\TF3");
    expect(backendMessage("E:test.x")).toBe("Fichier {path} introuvable");
    // Paramètre qui est lui-même un code (détail imbriqué).
    expect(backendMessage('E:test.x:{"path":"E:test.x:{\\"path\\":\\"y\\"}"}')).toBe("Fichier Fichier y introuvable introuvable");
    // Ligne du contrôle Teal : préfixe de sévérité conservé.
    expect(backendMessage('info: E:test.x:{"path":"z"}')).toBe("info: Fichier z introuvable");
  });
});
