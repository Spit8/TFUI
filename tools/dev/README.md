# Outils de développement

Scripts de développement de l’éditeur, lancés avec `npx tsx`. Ils ne font pas partie du build de l’application et lisent le jeu via `fixtures/` (`pnpm link-game`).

## Banc de test de l’éditeur

`build-bench-mod.ts` construit, par les actions du store (insertion depuis la palette, props, classes, styles par élément), un mod **bac à sable** dont la fenêtre combine un maximum de composants et d’imbrications : onglets, FlowLayout, TableLayout, AbsoluteLayout, List horizontale, ScrollArea, sliders, saisie, liste déroulante, espaceurs, Component imbriqués sur 4 niveaux, bouton à contenu composé. Il écrit le projet `.tfui.json` et le mod (`mod.json`, `modinfo.json`, fichiers GUI générés, fichier handlers), puis affiche les insertions refusées, les problèmes du validateur, la syntaxe Lua et le rapport du banc Lua (runtime React du jeu, via `fixtures/`).

```powershell
npx tsx tools/dev/build-bench-mod.ts ../tfui_bench
```

Le banc n° 2 (`build-bench2-mod.ts`) couvre FloatingLayout, états (`:hover`/`:active`/`:disabled`, `enabled = false`, infobulles), classes courantes du jeu, TableLayout avec et sans `columnWeights` et trois fenêtres secondaires (dialog non étendue, sans croix + épinglable, en-tête + compact) ouvertes par des boutons. Les deux scripts partagent `benchKit.ts` (mise en place, actions du store, écriture du mod, contrôles).

Le nom du dossier donne l’identifiant du mod. Ne jamais viser un vrai mod : le script réécrit les fichiers GUI et le projet (le fichier handlers existant est conservé). Ensuite : ouvrir le projet dans l’éditeur, comparer l’aperçu, déployer, comparer en jeu.

## Mods d’exemple

`build-example-mod.ts <dossier> <fr|en>` construit le mod d’exemple du dossier `example/` (tableau de bord « Aperçu du réseau », interface seule) avec la même boîte à outils. Voir `example/README.md`.

