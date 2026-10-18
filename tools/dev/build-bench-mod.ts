/**
 * Banc de test n° 1 de l’éditeur : une fenêtre qui combine un maximum de
 * composants et d’imbrications inhabituelles (onglets, FlowLayout,
 * TableLayout, AbsoluteLayout, List horizontale, ScrollArea, contrôles,
 * espaceurs, Component imbriqués). Voir `benchKit.ts`.
 *
 * Usage : npx tsx tools/dev/build-bench-mod.ts <dossier du mod bac à sable>
 */
import { lit, en, palette, startBench } from "./benchKit";

const { store, nodeOf, ins, props, cls, style, text, box, button, main, finish } = startBench({
  script: "build-bench-mod.ts",
  displayName: "TFUI Bench",
  title: "TFUI Bench — tous les composants",
  size: [1000, 680],
});
const root = main.root;
style(root, { innerSpacing: [8, 8] });

// 1. En-tête : icône (Vec2i), titre, espaceur, bascule, bouton à contenu composé.
const header = box(root, "Horizontal", { name: "Header" });
style(header, { innerSpacing: [6, 0], gravity: [-1, 0] });
const icon = ins(header, "ImageView", { name: "HeaderIcon" });
props(icon, { path: lit("::/gui/construction/menu/filter_categories/bus.tga") });
style(icon, { size: [24, 24] });
const title = text(header, "Banc de test", { name: "Title" });
cls(title, "font-scale-title-2");
style(title, { color: palette("Highlight") });
ins(header, "Component", { preset: "HorizontalSpacer" });
const toggle = ins(header, "ToggleButton", { name: "Toggle" });
const toggleLabel = toggle ? nodeOf(toggle).slots.content?.[0] : undefined;
if (toggleLabel) props(toggleLabel.id, { text: lit("Mode") });
props(toggle, { initialValue: lit(1) });
// Bouton dont le contenu est une BoxLayout (icône + deux lignes de texte).
const richButton = ins(header, "Button", { name: "RichButton" });
if (richButton) {
  store.getState().deleteNode(nodeOf(richButton).slots.content![0]!.id);
  const inner = box(richButton, "Horizontal", { slot: "content" });
  const ic = ins(inner, "ImageView");
  props(ic, { path: lit("::/gui/construction/menu/filter_categories/train.tga") });
  style(ic, { size: [18, 18] });
  const lines = box(inner, "Vertical");
  text(lines, "Action");
  const sub = text(lines, "sous-titre");
  cls(sub, "font-scale-caption");
  style(richButton, { backgroundColor1: palette("AccentDark") });
  style(richButton, { backgroundColor1: palette("AccentMedium") }, "hover");
}

// 2. Corps : colonne gauche (onglets) | colonne droite (liste + défilement).
const body = box(root, "Horizontal", { name: "Body" });
style(body, { gravity: [-1, -1], innerSpacing: [10, 0] });

// 2a. Onglets
const tabs = ins(body, "TabWidget", { name: "Tabs" });
style(tabs, { gravity: [-1, -1] });
function tab(label: string): string {
  const child = ins(tabs, "TabWidgetChild", { slot: "tabs" });
  if (!child) return "";
  text(child, label, { slot: "indicator" });
  return child;
}

// Onglet « Layouts » : FlowLayout de boutons, TableLayout, AbsoluteLayout superposé.
const tabLayouts = tab("Layouts");
const layoutsBody = tabLayouts ? box(tabLayouts, "Vertical", { slot: "item" }) : "";
const flow = ins(layoutsBody, "FlowLayout", { name: "Flow" });
style(flow, { innerSpacing: [4, 4], gravity: [-1, 0] });
for (let i = 1; i <= 9; i++) button(flow, `F${i}${"·".repeat(i % 3)}`);
const table = ins(layoutsBody, "TableLayout", { name: "Table" });
for (let r = 0; r < 3; r++) {
  const row = ins(table, "Row", { slot: "rows" });
  text(row, `Ligne ${r + 1}`, { slot: "cells" });
  const bar = ins(row, "ProgressBar", { slot: "cells" });
  props(bar, { value: lit((r + 1) / 4), label: lit(`${(r + 1) * 25} %`) });
  const check = ins(row, "CheckBox", { slot: "cells" });
  props(check, { label: lit(`Option ${r + 1}`), initialValue: lit(r % 2) });
}
// Pas de style : AbsoluteLayout n’accepte ni meta ni classe (absolute_layout_params).
const abs = ins(layoutsBody, "AbsoluteLayout", { name: "Absolute" });
// AbsoluteLayoutChildParam n’a que localKey + item (builtin.d.tl) : aucune
// position en prop. Trois enfants superposés, sans réglage.
for (const kind of ["text", "image", "button"] as const) {
  const child = ins(abs, "AbsoluteLayoutChild");
  if (kind === "text") text(child, "Superposé (0,0)", { slot: "item" });
  if (kind === "image") {
    const img = ins(child, "ImageView", { slot: "item" });
    props(img, { path: lit("::/gui/construction/menu/filter_categories/truck.tga") });
    style(img, { size: [32, 32] });
  }
  if (kind === "button") button(child, "Bouton (120,40)", { slot: "item" });
}

// Onglet « Contrôles » : sliders (dont un vertical), saisie, nombres, liste déroulante.
const tabControls = tab("Contrôles");
const controls = tabControls ? box(tabControls, "Vertical", { slot: "item" }) : "";
style(controls, { innerSpacing: [0, 6] });
const sliderRow = box(controls, "Horizontal", { name: "SliderRow" });
const hSlider = ins(sliderRow, "Slider");
props(hSlider, { min: lit(0), max: lit(100), step: lit(5), initialValue: lit(40), withTicks: lit(true) });
const vSlider = ins(sliderRow, "Slider");
props(vSlider, { min: lit(0), max: lit(10), initialValue: lit(7), horizontal: lit(false) });
style(vSlider, { size: [16, 80] });
const sideBar = ins(sliderRow, "ProgressBar");
props(sideBar, { value: lit(0.66), applyGradient: lit(true) });
const input = ins(controls, "TextInputField", { name: "Search" });
props(input, { placeholderText: lit("Rechercher une ligne…"), maxLength: lit(32) });
const spinRow = box(controls, "Horizontal");
text(spinRow, "Capacité :");
const spin = ins(spinRow, "DoubleSpinBox");
props(spin, { min: lit(0), max: lit(500), step: lit(2.5), value: lit(42.5) });
ins(spinRow, "Component", { preset: "HorizontalSpacer" });
const check = ins(spinRow, "CheckBox");
props(check, { label: lit("Case à droite"), moveBoxRight: lit(true), triStateSupport: lit(true), initialValue: lit(-1) });
const combo = ins(controls, "ComboBox", { name: "Combo" });
for (const label of ["Bus", "Tram", "Train"]) {
  const item = ins(combo, "ComboBoxItem", { slot: "items" });
  text(item, label, { slot: "content" });
}
ins(controls, "Component", { preset: "VerticalSpacer" });
const bottomNote = text(controls, "Texte en bas (après un espaceur vertical)");
style(bottomNote, { textAlignment: [1, 0.5], gravity: [-1, 0] });

// Onglet « Texte » : RichTextView markdown, TextView étiré et centré.
const tabText = tab("Texte");
const textBody = tabText ? box(tabText, "Vertical", { slot: "item" }) : "";
const rich = ins(textBody, "RichTextView");
props(rich, { text: lit("**Gras**, *italique* et une liste :\n\n- un\n- deux"), isMarkdown: lit(true) });
const centered = text(textBody, "Centré sur les deux axes");
style(centered, { gravity: [-1, -1], textAlignment: [0.5, 0.5], backgroundColor: palette("BaseDark", 0.5) });

// 2b. Colonne droite : List horizontale de cartes, ScrollArea avec contenu haut.
const side = box(body, "Vertical", { name: "Side" });
style(side, { gravity: [0, -1], innerSpacing: [0, 6] });
const list = ins(side, "List", { name: "Cards" });
props(list, { orientation: en("Orientation.Horizontal"), horizontalScrollBarPolicy: en("ScrollBarPolicy.AlwaysOn") });
style(list, { size: [300, 90] });
for (const [label, iconPath] of [
  ["Bus", "::/gui/construction/menu/filter_categories/bus.tga"],
  ["Tram", "::/gui/construction/menu/filter_categories/tram.tga"],
  ["Train", "::/gui/construction/menu/filter_categories/train.tga"],
  ["Navire", "::/gui/construction/menu/filter_categories/ship.tga"],
  ["Avion", "::/gui/construction/menu/filter_categories/plane.tga"],
]) {
  const card = box(list, "Vertical");
  style(card, { padding: [4, 6, 4, 6] });
  const cardImg = ins(card, "ImageView");
  props(cardImg, { path: lit(iconPath) });
  style(cardImg, { size: [32, 32] });
  text(card, label);
}
const scroll = ins(side, "ScrollArea", { name: "Scroll" });
props(scroll, { verticalPolicy: en("ScrollBarPolicy.AlwaysOn"), horizontalPolicy: en("ScrollBarPolicy.AlwaysOff") });
style(scroll, { gravity: [-1, -1] });
const scrollBody = box(scroll, "Vertical", { slot: "content" });
for (let i = 1; i <= 14; i++) {
  const line = box(scrollBody, "Horizontal");
  text(line, `Élément ${i}`);
  ins(line, "Component", { preset: "HorizontalSpacer" });
  const bar = ins(line, "ProgressBar");
  props(bar, { value: lit(i / 14) });
  style(bar, { size: [80, 8] });
}

// 3. Pied : imbrication profonde Component > BoxLayout > Component > …, bouton fermer.
const footer = box(root, "Horizontal", { name: "Footer" });
style(footer, { gravity: [-1, 0] });
const card = ins(footer, "Component", { name: "DeepCard" });
style(card, { backgroundColor: palette("BaseLight", 0.4), padding: [6, 6, 6, 6] });
let parent = card ? box(card, "Horizontal", { slot: "layout" }) : "";
for (let depth = 1; depth <= 4; depth++) {
  const c = ins(parent, "Component");
  style(c, { padding: [2, 2, 2, 2], backgroundColor: palette("BaseMedium", 0.25 * depth) });
  parent = c ? box(c, "Horizontal", { slot: "layout" }) : "";
  text(parent, `n${depth}`);
}
ins(footer, "Component", { preset: "HorizontalSpacer" });
const close = button(footer, "Fermer", { name: "CloseButton" });
props(close, { onClick: { kind: "handler", fn: "onCloseClick" } });
style(close, { backgroundColor1: palette("Negative") });

await finish();
