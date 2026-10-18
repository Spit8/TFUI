/**
 * Banc de test n° 2 de l’éditeur, centré sur ce que le n° 1 ne couvrait pas,
 * choisi d’après l’usage vanilla (relevé du 2026-10-18) :
 * A. FloatingLayout (118 + 296 usages) : positions h / v, défaut sans h / v,
 *    débordement (overflowMode), dans un bouton, comme layout d’un Component ;
 * B. états : :hover / :active / :disabled, meta.enabled = false, infobulles ;
 * C. classes courantes du jeu (primary, secondary, font-scale-*, negative) ;
 * D. TableLayout avec et sans columnWeights ;
 * E. variantes de fenêtre (dialog non étendue, sans croix + épinglable,
 *    en-tête `header` + compact), ouvertes par des boutons.
 * Voir `benchKit.ts`.
 *
 * Usage : npx tsx tools/dev/build-bench2-mod.ts <dossier du mod bac à sable>
 */
import { en, lit, lua, palette, startBench } from "./benchKit";

const { store, nodeOf, ins, props, meta, cls, addClass, style, text, box, button, main, addWindow, openWindowLua, finish } = startBench({
  script: "build-bench2-mod.ts",
  displayName: "TFUI Bench 2",
  title: "TFUI Bench 2 — Floating, états, classes, tables, fenêtres",
  size: [1100, 720],
});
const root = main.root;
style(root, { innerSpacing: [8, 10] });

function section(title: string): string {
  const t = text(root, title);
  cls(t, "font-scale-title-4");
  style(t, { color: palette("Highlight") });
  const row = box(root, "Horizontal");
  style(row, { innerSpacing: [12, 0] });
  return row;
}

/** Cadre de démonstration : Component de taille fixe, fond léger, légende dessous. */
function frame(parent: string, caption: string): string {
  const col = box(parent, "Vertical");
  style(col, { innerSpacing: [0, 4] });
  const comp = ins(col, "Component");
  style(comp, { size: [150, 90], backgroundColor: palette("BaseLight", 0.25) });
  const label = text(col, caption);
  cls(label, "font-scale-annotation");
  return comp;
}

function floatingChild(floating: string, h: number | null, v: number | null): string {
  const child = ins(floating, "FloatingLayoutChild");
  if (h !== null) props(child, { h: lit(h) });
  if (v !== null) props(child, { v: lit(v) });
  return child;
}

// ── A. FloatingLayout ────────────────────────────────────────────────────
const a = section("A. FloatingLayout");

// A1 : grille de 9 positions (h, v ∈ {0, 0.5, 1}).
const a1 = ins(frame(a, "A1 · 9 positions h/v"), "FloatingLayout", { slot: "layout" });
for (const v of [0, 0.5, 1]) {
  for (const h of [0, 0.5, 1]) text(floatingChild(a1, h, v), `${h}/${v}`, { slot: "item" });
}

// A2 : fond étiré (-1/-1) + enfant sans h/v (défaut à observer).
const a2 = ins(frame(a, "A2 · fond -1/-1 + sans h/v"), "FloatingLayout", { slot: "layout" });
const bg = ins(floatingChild(a2, -1, -1), "Component", { slot: "item" });
style(bg, { backgroundColor: palette("AccentDark", 0.6) });
props(ins(bg, "BoxLayout", { slot: "layout" }), { orientation: en("Orientation.Vertical") });
text(floatingChild(a2, null, null), "sans h/v", { slot: "item" });

// A3 : image + badge en haut à droite qui déborde (overflowMode = Overflow).
const a3 = ins(frame(a, "A3 · badge Overflow"), "FloatingLayout", { slot: "layout" });
const a3Img = ins(floatingChild(a3, 0.5, 0.5), "ImageView", { slot: "item" });
props(a3Img, { path: lit("::/gui/construction/menu/filter_categories/train.tga") });
style(a3Img, { size: [48, 48] });
const badgeChild = floatingChild(a3, 1, 0);
props(badgeChild, { overflowMode: en("FloatingLayoutOverflowMode.Overflow") });
const badge = text(badgeChild, "12", { slot: "item" });
style(badge, { backgroundColor: palette("Negative"), padding: [2, 6, 2, 6] });

// A4 : bouton dont le contenu est un FloatingLayout (texte centré + coin).
const a4Frame = frame(a, "A4 · bouton > Floating");
const a4Box = ins(a4Frame, "BoxLayout", { slot: "layout" });
const a4Button = ins(a4Box, "Button");
if (a4Button) {
  // Libellé « Bouton » créé avec le bouton : remplacé par le FloatingLayout.
  store.getState().deleteNode(nodeOf(a4Button).slots.content![0]!.id);
  const fl = ins(a4Button, "FloatingLayout", { slot: "content" });
  text(floatingChild(fl, 0.5, 0.5), "Centre", { slot: "item" });
  const corner = text(floatingChild(fl, 1, 1), "•", { slot: "item" });
  style(corner, { color: palette("Warning") });
  style(a4Button, { size: [120, 60] });
}

// A5 : FloatingLayout comme layout d’un Component, avec ProgressBar étirée.
const a5 = ins(frame(a, "A5 · ProgressBar -1/-1"), "FloatingLayout", { slot: "layout" });
props(ins(floatingChild(a5, -1, 1), "ProgressBar", { slot: "item" }), { value: lit(0.4) });
text(floatingChild(a5, 0, 0), "ProgressBar en bas", { slot: "item" });

// ── B. États ─────────────────────────────────────────────────────────────
const b = section("B. États (:hover, :active, :disabled, enabled, infobulles)");
const hoverBtn = button(b, "Survol / clic");
style(hoverBtn, { backgroundColor1: palette("AccentDark") });
style(hoverBtn, { backgroundColor1: palette("Positive") }, "hover");
style(hoverBtn, { backgroundColor1: palette("Negative") }, "active");
const disabledBtn = button(b, "Désactivé");
meta(disabledBtn, { enabled: lit(false) });
style(disabledBtn, { backgroundColor1: palette("NeutralDark") }, "disabled");
const tipBtn = button(b, "Infobulle");
meta(tipBtn, { tooltip: "Infobulle d’un bouton" });
const tipText = text(b, "Texte avec infobulle");
meta(tipText, { tooltip: "Infobulle d’un texte" });
const disabledCheck = ins(b, "CheckBox");
props(disabledCheck, { label: lit("Case désactivée"), initialValue: lit(1) });
meta(disabledCheck, { enabled: lit(false) });
const disabledInput = ins(b, "TextInputField");
props(disabledInput, { placeholderText: lit("Champ désactivé") });
meta(disabledInput, { enabled: lit(false) });
style(disabledInput, { size: [160, 28] });

// ── C. Classes courantes ─────────────────────────────────────────────────
const c = section("C. Classes du jeu");
cls(button(c, "primary"), "primary");
cls(button(c, "secondary"), "secondary");
for (const k of ["font-scale-title-1", "font-scale-title-3", "font-scale-headline", "font-scale-body", "font-scale-annotation"]) {
  cls(text(c, k.replace("font-scale-", "")), k);
}
cls(text(c, "negative"), "negative");

// ── D. TableLayout ───────────────────────────────────────────────────────
const d = section("D. TableLayout");
function table(caption: string, weights: number[] | null, cells: string[][]): void {
  const col = box(d, "Vertical");
  style(col, { gravity: [-1, 0], innerSpacing: [0, 4] });
  const t = ins(col, "TableLayout");
  if (weights) props(t, { columnWeights: lit(weights) });
  style(t, { gravity: [-1, 0] });
  for (const rowCells of cells) {
    const row = ins(t, "Row", { slot: "rows" });
    for (const cell of rowCells) text(row, cell, { slot: "cells" });
  }
  cls(text(col, caption), "font-scale-annotation");
}
const sample = [
  ["Nom", "Valeur longue de cellule", "x"],
  ["Ligne plus longue", "1", "yy"],
];
table("sans columnWeights", null, sample);
table("columnWeights { -1, 50, -1 }", [-1, 50, -1], sample);
table("columnWeights { 1, 1, 1 }", [1, 1, 1], sample);

// ── E. Variantes de fenêtre ──────────────────────────────────────────────
const e = section("E. Fenêtres");
const dialog = addWindow("TfuiBench2Dialog", "Dialog (non étendue)", null);
props(dialog.win, { expanded: lit(false) });
addClass(dialog.win, "dialog");
text(dialog.root, "Fenêtre de classe dialog, sans taille fixée :");
text(dialog.root, "sa taille suit son contenu.");

const pinned = addWindow("TfuiBench2Pinnable", "Sans croix, épinglable", [420, 200]);
props(pinned.win, { pinnable: lit(true) });
addClass(pinned.win, "no-close-button");
text(pinned.root, "Classe no-close-button + pinnable = true.");
const closePinned = button(pinned.root, "Fermer");
props(closePinned, {
  onClick: lua(`function()
					pcall(function()
						api.gui.byId.setVisible("${pinned.windowId}", false)
					end)
				end`),
});

const headed = addWindow("TfuiBench2Header", "En-tête + compact", [420, 220]);
props(headed.win, { compact: lit(true) });
const headerBox = box(headed.win, "Horizontal", { slot: "header" });
text(headerBox, "En-tête :");
button(headerBox, "Action d’en-tête");
text(headed.root, "Slot header + compact = true.");

for (const [label, w] of [
  ["Ouvrir : dialog", dialog],
  ["Ouvrir : sans croix", pinned],
  ["Ouvrir : en-tête", headed],
] as const) {
  props(button(e, label), { onClick: openWindowLua(w) });
}

await finish();
