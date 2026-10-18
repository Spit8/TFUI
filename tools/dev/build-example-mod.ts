/**
 * Mod d’exemple de l’éditeur : un tableau de bord « Aperçu du réseau »
 * construit par les actions du store (comme l’interface), qui montre un
 * maximum de fonctionnalités dans une mise en page soignée : barre d’outils,
 * cartes d’indicateurs, onglets (liste + détail, recherche + liste défilante,
 * formulaire de réglages), badge flottant, tableaux, barres de progression,
 * espaceurs, classes du jeu, fenêtre « À propos ». Interface seule : aucun
 * handler, les données affichées sont fictives.
 * Règles appliquées : celles vérifiées en jeu par les bancs 1 à 3 (PLAN.md §1.4).
 *
 * Usage : npx tsx tools/dev/build-example-mod.ts <dossier du mod> <fr|en>
 */
import process from "node:process";
import { lit, lua, palette, startBench } from "./benchKit";

const lang = process.argv[3] === "en" ? "en" : "fr";

const TEXT = {
  fr: {
    displayName: "TFUI — Exemple",
    description: "Mod d’exemple créé avec TFUI : interface seule, données fictives.",
    summary: "Exemple d’interface TFUI",
    title: "Aperçu du réseau",
    period: "Période :",
    periods: ["Ce mois", "Cette année", "Depuis le début"],
    refresh: "Actualiser",
    about: "À propos",
    kpis: [
      ["Lignes actives", "12", "+2 ce mois", "positive"],
      ["Véhicules", "86", "+5 ce mois", "positive"],
      ["Passagers / mois", "48 210", "+12 %", "positive"],
      ["Rentabilité", "72 %", "−3 %", "negative"],
    ],
    tabs: ["Lignes", "Véhicules", "Réglages"],
    lines: [
      ["Ligne 1 — Centre ⇄ Gare", "14 arrêts · 8 véhicules", "68 %", "positive", "bus", 0],
      ["Ligne 2 — Port ⇄ Zone industrielle", "9 arrêts · 6 véhicules", "92 %", "warning", "bus", 2],
      ["Ligne 3 — Aéroport express", "4 arrêts · 5 véhicules", "104 %", "negative", "train", 5],
      ["Ligne 4 — Navette maritime", "3 arrêts · 2 véhicules", "41 %", "info", "ship", 0],
      ["Ligne 5 — Vols régionaux", "2 arrêts · 3 véhicules", "77 %", "positive", "airplane", 0],
    ],
    detailTitle: "Ligne 1 — Centre ⇄ Gare",
    details: [
      ["Fréquence", "toutes les 6 min"],
      ["Temps de parcours", "24 min"],
      ["Capacité", "1 240 passagers / h"],
      ["Revenus annuels", "1,2 M$"],
    ],
    occupancy: "Taux d’occupation",
    punctuality: "Ponctualité",
    showOnMap: "Voir sur la carte",
    editLine: "Modifier la ligne",
    search: "Rechercher un véhicule…",
    filters: ["En service", "Au dépôt", "En panne"],
    vehicleStates: [
      ["En service", "positive"],
      ["En service", "positive"],
      ["Au dépôt", "info"],
      ["En panne", "negative"],
      ["En service", "positive"],
      ["Entretien prévu", "warning"],
    ],
    vehicle: "Véhicule",
    condition: "État",
    vehicleNames: { bus: "Bus", tram: "Tram", train: "Train", ship: "Navire", airplane: "Avion" } as Record<string, string>,
    settings: [
      ["Rafraîchissement", "30 s"],
      ["Seuil d’alerte (%)", ""],
      ["Devise", ""],
    ],
    currencies: ["Dollar ($)", "Euro (€)"],
    notifications: "Afficher les notifications",
    paused: "Inclure les lignes en pause",
    reset: "Réinitialiser",
    save: "Enregistrer",
    status: "Dernière mise à jour : il y a 2 min",
    credit: "Interface d’exemple — TFUI",
    aboutTitle: "À propos",
    aboutText:
      "Cette fenêtre est un exemple créé avec TFUI, l’éditeur d’interface pour Transport Fever 3.\n\nToutes les valeurs affichées sont fictives : aucune logique n’est branchée.",
    ok: "OK",
  },
  en: {
    displayName: "TFUI — Example",
    description: "Example mod made with TFUI: interface only, sample data.",
    summary: "TFUI interface example",
    title: "Network overview",
    period: "Period:",
    periods: ["This month", "This year", "All time"],
    refresh: "Refresh",
    about: "About",
    kpis: [
      ["Active lines", "12", "+2 this month", "positive"],
      ["Vehicles", "86", "+5 this month", "positive"],
      ["Passengers / month", "48,210", "+12%", "positive"],
      ["Profitability", "72%", "−3%", "negative"],
    ],
    tabs: ["Lines", "Vehicles", "Settings"],
    lines: [
      ["Line 1 — Downtown ⇄ Station", "14 stops · 8 vehicles", "68%", "positive", "bus", 0],
      ["Line 2 — Harbour ⇄ Industrial park", "9 stops · 6 vehicles", "92%", "warning", "bus", 2],
      ["Line 3 — Airport express", "4 stops · 5 vehicles", "104%", "negative", "train", 5],
      ["Line 4 — Ferry shuttle", "3 stops · 2 vehicles", "41%", "info", "ship", 0],
      ["Line 5 — Regional flights", "2 stops · 3 vehicles", "77%", "positive", "airplane", 0],
    ],
    detailTitle: "Line 1 — Downtown ⇄ Station",
    details: [
      ["Frequency", "every 6 min"],
      ["Travel time", "24 min"],
      ["Capacity", "1,240 passengers / h"],
      ["Annual revenue", "$1.2M"],
    ],
    occupancy: "Occupancy",
    punctuality: "Punctuality",
    showOnMap: "Show on map",
    editLine: "Edit line",
    search: "Search a vehicle…",
    filters: ["In service", "In depot", "Broken down"],
    vehicleStates: [
      ["In service", "positive"],
      ["In service", "positive"],
      ["In depot", "info"],
      ["Broken down", "negative"],
      ["In service", "positive"],
      ["Service due", "warning"],
    ],
    vehicle: "Vehicle",
    condition: "Condition",
    vehicleNames: { bus: "Bus", tram: "Tram", train: "Train", ship: "Ship", airplane: "Plane" } as Record<string, string>,
    settings: [
      ["Refresh rate", "30 s"],
      ["Alert threshold (%)", ""],
      ["Currency", ""],
    ],
    currencies: ["Dollar ($)", "Euro (€)"],
    notifications: "Show notifications",
    paused: "Include paused lines",
    reset: "Reset",
    save: "Save",
    status: "Last update: 2 min ago",
    credit: "Example interface — TFUI",
    aboutTitle: "About",
    aboutText:
      "This window is an example made with TFUI, the interface editor for Transport Fever 3.\n\nAll values shown are sample data: no logic is attached.",
    ok: "OK",
  },
}[lang];

const ICON = (vehicle: string) => `::/gui/game_bar/icons/vehicle_${vehicle}_30.tga`;

const { ins, props, cls, addClass, style, text, box, button, main, addWindow, openWindowLua, finish } =
  startBench({
    script: "build-example-mod.ts",
    displayName: TEXT.displayName,
    title: TEXT.title,
    size: [1040, 660],
    description: TEXT.description,
    summary: TEXT.summary,
  });
const root = main.root;
style(root, { innerSpacing: [0, 10] });

function image(parent: string, path: string, size: number, o: { slot?: string } = {}): string {
  const id = ins(parent, "ImageView", o);
  props(id, { path: lit(path) });
  style(id, { size: [size, size] });
  return id;
}
function caption(parent: string, value: string): string {
  const id = text(parent, value);
  cls(id, "font-scale-annotation");
  return id;
}
function primary(parent: string, label: string): string {
  const id = button(parent, label);
  cls(id, "primary");
  return id;
}
function secondary(parent: string, label: string): string {
  const id = button(parent, label);
  cls(id, "secondary");
  return id;
}
/** ComboBox dont la valeur affichée est le premier élément. */
function combo(parent: string, labels: string[]): string {
  const id = ins(parent, "ComboBox");
  for (const label of labels) text(ins(id, "ComboBoxItem", { slot: "items" }), label, { slot: "content" });
  props(id, { value: lit(1) });
  return id;
}
/** Carte : Component à fond léger et marge intérieure, contenu vertical. */
function card(parent: string, o: { name?: string } = {}): { card: string; body: string } {
  const c = ins(parent, "Component", o);
  style(c, { backgroundColor: palette("BaseLight", 0.18), padding: [10, 12, 10, 12] });
  const body = box(c, "Vertical", { slot: "layout" });
  style(body, { innerSpacing: [0, 4] });
  return { card: c, body };
}
/** Barre de progression de largeur fixe, précédée de son libellé. */
function meter(parent: string, label: string, value: number): void {
  const row = box(parent, "Horizontal");
  // Gravity posée : la ProgressBar (gravity -1/-1 du jeu) n’étire pas la ligne.
  style(row, { innerSpacing: [10, 0], gravity: [0, 0.5] });
  const l = text(row, label);
  style(l, { size: [150, -1] });
  const bar = ins(row, "ProgressBar");
  props(bar, { value: lit(value) });
  style(bar, { size: [260, 10], gravity: [0, 0.5] });
  caption(row, `${Math.round(value * 100)} %`);
}

// ── Barre d’outils ───────────────────────────────────────────────────────
const toolbar = box(root, "Horizontal", { name: "Toolbar" });
style(toolbar, { innerSpacing: [10, 0] });
// Le titre est celui de la fenêtre : la barre porte le filtre et les actions.
text(toolbar, TEXT.period);
combo(toolbar, TEXT.periods);
ins(toolbar, "Component", { preset: "HorizontalSpacer" });
secondary(toolbar, TEXT.refresh);
const aboutButton = primary(toolbar, TEXT.about);

// ── Indicateurs ──────────────────────────────────────────────────────────
const kpis = box(root, "Horizontal", { name: "Kpis" });
style(kpis, { innerSpacing: [10, 0] });
for (const [label, value, delta, tone] of TEXT.kpis) {
  const { card: c, body } = card(kpis);
  style(c, { gravity: [-1, 0] });
  caption(body, label);
  cls(text(body, value), "font-scale-headline");
  cls(text(body, delta), "font-scale-annotation", tone);
}

// ── Onglets ──────────────────────────────────────────────────────────────
const tabs = ins(root, "TabWidget", { name: "Tabs" });
style(tabs, { gravity: [-1, -1] });
function tab(label: string): string {
  const child = ins(tabs, "TabWidgetChild", { slot: "tabs" });
  text(child, label, { slot: "indicator" });
  return child;
}

// Onglet 1 : liste des lignes | détail de la ligne sélectionnée.
const linesTab = box(tab(TEXT.tabs[0]), "Horizontal", { slot: "item" });
style(linesTab, { innerSpacing: [12, 0] });
const list = ins(linesTab, "List", { name: "Lines" });
props(list, { selectionIndex: lit(1) });
style(list, { size: [400, -1] });
for (const [name, sub, rate, tone, vehicle, alerts] of TEXT.lines) {
  const row = box(list, "Horizontal");
  style(row, { innerSpacing: [10, 0], padding: [6, 8, 6, 8] });
  // Icône du mode, avec un badge d’alertes flottant (débordant) si besoin.
  const iconHolder = ins(row, "FloatingLayout");
  const iconChild = ins(iconHolder, "FloatingLayoutChild");
  props(iconChild, { h: lit(0.5), v: lit(0.5) });
  image(iconChild, ICON(vehicle as string), 30, { slot: "item" });
  if ((alerts as number) > 0) {
    const badgeChild = ins(iconHolder, "FloatingLayoutChild");
    props(badgeChild, { h: lit(1), v: lit(0), overflowMode: { kind: "enum", value: "FloatingLayoutOverflowMode.Overflow" } });
    const badge = text(badgeChild, String(alerts), { slot: "item" });
    cls(badge, "font-scale-annotation");
    style(badge, { backgroundColor: palette("Negative"), padding: [0, 4, 0, 4] });
  }
  const names = box(row, "Vertical");
  text(names, name as string);
  caption(names, sub as string);
  ins(row, "Component", { preset: "HorizontalSpacer" });
  cls(text(row, rate as string), tone as string);
}
const detail = card(linesTab, { name: "LineDetail" });
style(detail.card, { gravity: [-1, -1] });
style(detail.body, { innerSpacing: [0, 10] });
cls(text(detail.body, TEXT.detailTitle), "font-scale-title-4");
const facts = ins(detail.body, "TableLayout");
props(facts, { columnWeights: lit([-1, 1]) });
style(facts, { gravity: [-1, 0] });
for (const [label, value] of TEXT.details) {
  const row = ins(facts, "Row", { slot: "rows" });
  const l = text(row, label, { slot: "cells" });
  style(l, { padding: [2, 24, 2, 0] });
  text(row, value, { slot: "cells" });
}
meter(detail.body, TEXT.occupancy, 0.68);
meter(detail.body, TEXT.punctuality, 0.91);
ins(detail.body, "Component", { preset: "VerticalSpacer" });
const actions = box(detail.body, "Horizontal");
style(actions, { innerSpacing: [8, 0] });
ins(actions, "Component", { preset: "HorizontalSpacer" });
secondary(actions, TEXT.showOnMap);
primary(actions, TEXT.editLine);

// Onglet 2 : recherche + filtres, liste défilante des véhicules.
const vehiclesTab = box(tab(TEXT.tabs[1]), "Vertical", { slot: "item" });
style(vehiclesTab, { innerSpacing: [0, 8] });
const searchRow = box(vehiclesTab, "Horizontal");
style(searchRow, { innerSpacing: [16, 0] });
const search = ins(searchRow, "TextInputField");
props(search, { placeholderText: lit(TEXT.search) });
style(search, { size: [320, 30] });
ins(searchRow, "Component", { preset: "HorizontalSpacer" });
TEXT.filters.forEach((label, i) => {
  const check = ins(searchRow, "CheckBox");
  props(check, { label: lit(label), initialValue: lit(i < 2 ? 1 : 0) });
});
const head = box(vehiclesTab, "Horizontal");
style(head, { padding: [0, 8, 0, 8] });
caption(head, TEXT.vehicle);
ins(head, "Component", { preset: "HorizontalSpacer" });
const condHead = caption(head, TEXT.condition);
style(condHead, { size: [100, -1] });
const scroll = ins(vehiclesTab, "ScrollArea", { name: "Vehicles" });
props(scroll, { horizontalPolicy: { kind: "enum", value: "ScrollBarPolicy.AlwaysOff" } });
style(scroll, { gravity: [-1, -1] });
const rows = box(scroll, "Vertical", { slot: "content" });
style(rows, { innerSpacing: [0, 6] });
const fleet = ["bus", "bus", "train", "train", "ship", "airplane"];
for (let i = 0; i < 12; i++) {
  const vehicle = fleet[i % fleet.length]!;
  const [state, tone] = TEXT.vehicleStates[i % TEXT.vehicleStates.length]!;
  const row = box(rows, "Horizontal");
  // Gravity posée : la ProgressBar n’étire pas la ligne en hauteur.
  style(row, { innerSpacing: [10, 0], padding: [2, 8, 2, 8], gravity: [-1, 0.5] });
  image(row, ICON(vehicle), 24);
  text(row, `${TEXT.vehicleNames[vehicle]} #${(i + 1).toString().padStart(3, "0")}`);
  ins(row, "Component", { preset: "HorizontalSpacer" });
  cls(text(row, state), tone);
  const bar = ins(row, "ProgressBar");
  props(bar, { value: lit(0.35 + ((i * 37) % 60) / 100) });
  style(bar, { size: [100, 8], gravity: [0, 0.5] });
}

// Onglet 3 : formulaire de réglages (libellés alignés), actions en bas.
const settingsTab = box(tab(TEXT.tabs[2]), "Vertical", { slot: "item" });
style(settingsTab, { innerSpacing: [0, 12] });
function field(label: string): string {
  const row = box(settingsTab, "Horizontal");
  // Gravity posée : Slider et DoubleSpinBox (étirés par le jeu) n’agrandissent
  // pas la ligne ; libellés alignés sur une colonne de 220 px.
  style(row, { innerSpacing: [12, 0], gravity: [0, 0.5] });
  const l = text(row, label);
  style(l, { size: [220, -1] });
  return row;
}
const refreshRow = field(TEXT.settings[0]![0]!);
const slider = ins(refreshRow, "Slider");
props(slider, { min: lit(5), max: lit(120), step: lit(5), initialValue: lit(30) });
style(slider, { size: [300, 16] });
text(refreshRow, TEXT.settings[0]![1]!);
const thresholdRow = field(TEXT.settings[1]![0]!);
const spin = ins(thresholdRow, "DoubleSpinBox");
props(spin, { min: lit(0), max: lit(100), step: lit(5), value: lit(85) });
style(spin, { size: [120, 30] });
const currencyRow = field(TEXT.settings[2]![0]!);
combo(currencyRow, TEXT.currencies);
const options = box(settingsTab, "Vertical");
style(options, { innerSpacing: [0, 6] });
props(ins(options, "CheckBox"), { label: lit(TEXT.notifications), initialValue: lit(1) });
props(ins(options, "CheckBox"), { label: lit(TEXT.paused), initialValue: lit(0) });
ins(settingsTab, "Component", { preset: "VerticalSpacer" });
const settingsActions = box(settingsTab, "Horizontal");
style(settingsActions, { innerSpacing: [8, 0] });
ins(settingsActions, "Component", { preset: "HorizontalSpacer" });
secondary(settingsActions, TEXT.reset);
primary(settingsActions, TEXT.save);

// ── Barre d’état ─────────────────────────────────────────────────────────
const statusBar = box(root, "Horizontal", { name: "StatusBar" });
caption(statusBar, TEXT.status);
ins(statusBar, "Component", { preset: "HorizontalSpacer" });
caption(statusBar, TEXT.credit);

// ── Fenêtre « À propos » ─────────────────────────────────────────────────
const aboutWin = addWindow("TfuiExampleAbout", TEXT.aboutTitle, null);
props(aboutWin.win, { expanded: lit(false) });
addClass(aboutWin.win, "dialog");
style(aboutWin.root, { innerSpacing: [0, 12] });
const aboutText = ins(aboutWin.root, "RichTextView");
props(aboutText, { text: lit(TEXT.aboutText) });
style(aboutText, { size: [420, -1], textAutoWrap: true });
const aboutActions = box(aboutWin.root, "Horizontal");
ins(aboutActions, "Component", { preset: "HorizontalSpacer" });
const okButton = primary(aboutActions, TEXT.ok);
props(okButton, {
  onClick: lua(`function()
					pcall(function()
						api.gui.byId.setVisible("${aboutWin.windowId}", false)
					end)
				end`),
});
props(aboutButton, { onClick: openWindowLua(aboutWin) });

await finish();
