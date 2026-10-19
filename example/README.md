# Mods d’exemple / Example mods

Deux versions du même mod d’exemple, construites avec l’éditeur (actions du store, comme l’interface) par `tools/dev/build-example-mod.ts` :

- `tfui_example_fr/` — version française
- `tfui_example_en/` — English version

Chaque dossier contient le projet `*.tfui.json` (à ouvrir dans l’éditeur) et le mod dans `mod/` (prêt à déployer). Interface seule : aucun handler, données fictives.

## Contenu

Fenêtre « Aperçu du réseau » / “Network overview” (1040 × 660) :

- **barre d’outils** : filtre de période (ComboBox), espaceur, boutons `secondary` / `primary` ;
- **cartes d’indicateurs** : Component à fond léger, valeurs `font-scale-headline`, variations colorées par les classes du jeu (`positive`, `negative`) ;
- **onglets** :
  - *Lignes* : List de lignes (icône avec badge d’alertes flottant en `FloatingLayout`, taux coloré), carte de détail avec TableLayout à `columnWeights`, jauges, actions alignées à droite ;
  - *Véhicules* : recherche, filtres (CheckBox), en-têtes de colonnes, ScrollArea de 12 lignes avec état coloré et barre d’état ;
  - *Réglages* : formulaire à libellés alignés (Slider, DoubleSpinBox, ComboBox, CheckBox), espaceur vertical, actions en bas à droite ;
- **barre d’état** ;
- **fenêtre « À propos »** (classe `dialog`, taille du contenu), ouverte par le bouton de la barre d’outils et fermée par « OK ».

## Régénérer / Rebuild

```powershell
npx tsx tools/dev/build-example-mod.ts example/tfui_example_fr fr
npx tsx tools/dev/build-example-mod.ts example/tfui_example_en en
```