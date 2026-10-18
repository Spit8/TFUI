/**
 * Banc de test n° 3 : trois questions restées ouvertes après le banc n° 2,
 * chacune déclinée en variantes qui ne diffèrent que par un réglage.
 * T1. ImageView dans un FloatingLayoutChild : invisible en 0.5/0.5 ? Taille
 *     par prop `size` ou par style, h/v, enveloppe Component. Chaque image a
 *     un fond : sa boîte reste visible même si l’image ne s’affiche pas.
 * T2. Fenêtre `compact` : contenu centré en hauteur ? compact seul, header
 *     seul, les deux (3 fenêtres ouvertes par des boutons).
 * T3. Component à `size` fixée : s’étire-t-il quand sa layout s’étire ?
 *     layout vide, BoxLayout + ProgressBar, FloatingLayout + ProgressBar
 *     -1/-1, et le même avec gravity { 0, 0 } posée sur le Component.
 * Voir `benchKit.ts`.
 *
 * Usage : npx tsx tools/dev/build-bench3-mod.ts <dossier du mod bac à sable>
 */
import { lit, palette, startBench } from "./benchKit";

const { ins, props, cls, style, text, box, button, main, addWindow, openWindowLua, finish } = startBench({
  script: "build-bench3-mod.ts",
  displayName: "TFUI Bench 3",
  title: "TFUI Bench 3 — 3 questions",
  size: [1100, 640],
});
const root = main.root;
style(root, { innerSpacing: [8, 10] });
const IMAGE = "::/gui/construction/menu/filter_categories/train.tga";

function section(title: string): string {
  const t = text(root, title);
  cls(t, "font-scale-title-4");
  style(t, { color: palette("Highlight") });
  const row = box(root, "Horizontal");
  style(row, { innerSpacing: [12, 0] });
  return row;
}
function caption(parent: string, value: string): void {
  cls(text(parent, value), "font-scale-annotation");
}

// ── T1. ImageView dans un FloatingLayoutChild ────────────────────────────
const t1 = section("T1. ImageView dans un FloatingLayoutChild (fond vert = boîte de l’image)");
function imageCase(label: string, h: number | null, v: number | null, how: "prop" | "style" | "component"): void {
  const col = box(t1, "Vertical");
  style(col, { innerSpacing: [0, 4] });
  const frame = ins(col, "Component");
  style(frame, { size: [110, 80], backgroundColor: palette("BaseLight", 0.25) });
  const fl = ins(frame, "FloatingLayout", { slot: "layout" });
  const child = ins(fl, "FloatingLayoutChild");
  if (h !== null) props(child, { h: lit(h) });
  if (v !== null) props(child, { v: lit(v) });
  let img: string;
  if (how === "component") {
    const wrapper = ins(child, "Component", { slot: "item" });
    const inner = box(wrapper, "Vertical", { slot: "layout" });
    img = ins(inner, "ImageView");
  } else {
    img = ins(child, "ImageView", { slot: "item" });
  }
  props(img, { path: lit(IMAGE) });
  if (how === "style") style(img, { size: [48, 48], backgroundColor: palette("Positive", 0.5) });
  else {
    props(img, { size: lit([48, 48]) });
    style(img, { backgroundColor: palette("Positive", 0.5) });
  }
  caption(col, label);
}
imageCase("0.5/0.5 · prop size", 0.5, 0.5, "prop");
imageCase("-1/-1 · prop size", -1, -1, "prop");
imageCase("sans h/v · prop", null, null, "prop");
imageCase("0/0 · prop size", 0, 0, "prop");
imageCase("0.5/0.5 · style size", 0.5, 0.5, "style");
imageCase("0.5/0.5 · dans Component", 0.5, 0.5, "component");
// Témoin : même image dans une BoxLayout (affichée au banc 1).
const ref = box(t1, "Vertical");
style(ref, { innerSpacing: [0, 4] });
const refImg = ins(ref, "ImageView");
props(refImg, { path: lit(IMAGE), size: lit([48, 48]) });
style(refImg, { backgroundColor: palette("Positive", 0.5) });
caption(ref, "témoin · BoxLayout");

// ── T3. Component à size fixée ──────────────────────────────────────────
const t3 = section("T3. Component size { 150, 90 } (fond bleu) : s’étire-t-il ?");
function componentCase(label: string, kind: "empty" | "box-bar" | "floating-bar", pinned: boolean): void {
  const col = box(t3, "Vertical");
  style(col, { innerSpacing: [0, 4] });
  const comp = ins(col, "Component");
  style(comp, { size: [150, 90], backgroundColor: palette("AccentDark", 0.6) });
  if (pinned) style(comp, { gravity: [0, 0] });
  if (kind === "empty") {
    text(box(comp, "Vertical", { slot: "layout" }), "texte seul");
  } else if (kind === "box-bar") {
    const b = box(comp, "Vertical", { slot: "layout" });
    text(b, "BoxLayout");
    props(ins(b, "ProgressBar"), { value: lit(0.5) });
  } else {
    const fl = ins(comp, "FloatingLayout", { slot: "layout" });
    text(ins(fl, "FloatingLayoutChild"), "Floating", { slot: "item" });
    const barChild = ins(fl, "FloatingLayoutChild");
    props(barChild, { h: lit(-1), v: lit(1) });
    props(ins(barChild, "ProgressBar", { slot: "item" }), { value: lit(0.5) });
  }
  caption(col, label);
}
componentCase("texte seul", "empty", false);
componentCase("BoxLayout + ProgressBar", "box-bar", false);
componentCase("Floating + ProgressBar -1/1", "floating-bar", false);
componentCase("BoxLayout + bar · gravity 0/0", "box-bar", true);
componentCase("Floating + bar · gravity 0/0", "floating-bar", true);

// ── T2. Fenêtres compact / header ───────────────────────────────────────
const t2 = section("T2. Fenêtres (contenu : deux lignes en haut ?)");
function windowCase(recipe: string, title: string, compact: boolean, header: boolean): void {
  const w = addWindow(recipe, title, [380, 200]);
  if (compact) props(w.win, { compact: lit(true) });
  if (header) {
    const hb = box(w.win, "Horizontal", { slot: "header" });
    text(hb, "En-tête");
  }
  text(w.root, "Ligne 1 du contenu");
  text(w.root, "Ligne 2 du contenu");
  props(button(t2, `Ouvrir : ${title}`), { onClick: openWindowLua(w) });
}
windowCase("TfuiBench3Compact", "compact seul", true, false);
windowCase("TfuiBench3Header", "header seul", false, true);
windowCase("TfuiBench3Both", "compact + header", true, true);
// Témoin : ni compact ni header.
windowCase("TfuiBench3Plain", "témoin", false, false);

await finish();
