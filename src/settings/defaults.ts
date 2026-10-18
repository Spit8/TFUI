/** Default paths from PLAN.md §0 — no per-user home paths. */
export type UiDensity = "compact" | "normal";

export interface AppSettings {
  tf3Root: string;
  stagingArea: string;
  /** Affichage › Taille du texte (§3.9). */
  density: UiDensity;
  /** 8 derniers chemins `.tfui.json`. */
  recentProjects: string[];
  /** Projet actif à la fermeture de l’app, rouvert (et activé) au démarrage. */
  lastOpenProject: string | null;
  /** Tous les projets ouverts à la fermeture (multi-projets), dans l’ordre. */
  openProjects: string[];
  /** Aperçu : contour fin de chaque élément (« Box »), mémorisé. */
  previewShowBoxes: boolean;
  /** Aperçu : fond de l’écran simulé (uni, masqué ou image), mémorisé. */
  previewBackground: PreviewBackgroundMode;
  /** Aperçu : dernière image de fond choisie (repli pour un format sans image). */
  previewBackgroundImage: string | null;
  /** Aperçu : image de fond par format d’écran (« 16:9 », « 21:9 »…). */
  previewBackgroundImages: Record<string, string>;
  /** Aperçu : couleurs du survol, des contours « Box » et de la sélection. */
  previewAppearance: PreviewAppearance;
  /** Aperçu : option du jeu Interface › Text Scaling simulée (« game » : celle du joueur). */
  previewTextScale: PreviewFontScale;
  /** Dernier mode d’import du contenu du jeu (proposé par défaut). */
  gameImportMode: GameImportMode;
  /** Langue de l’interface : code (`fr`, `en`…) ou `system`. */
  language: string;
}

/** Import du contenu graphique : minimum, toutes les images UI, toutes les images. */
export type GameImportMode = "minimum" | "ui" | "all";

export type PreviewFontScale = "game" | "small" | "medium" | "large";

/** Couleurs RGBA en 0..1. */
export interface PreviewAppearance {
  /** Remplissage de l’élément survolé. */
  hoverFill: number[];
  /** Contour de l’élément survolé. */
  hoverOutline: number[];
  /** Contour fin de chaque élément (option « Box »). */
  boxOutline: number[];
  /** Contour de l’élément sélectionné. */
  selectedOutline: number[];
  /** Épaisseur du contour de sélection (px). */
  selectedWidth: number;
}

export const DEFAULT_PREVIEW_APPEARANCE: PreviewAppearance = {
  hoverFill: [0.239, 0.545, 0.992, 0.22],
  hoverOutline: [0.494, 0.69, 1, 1],
  boxOutline: [0.494, 0.69, 1, 0.55],
  selectedOutline: [0.239, 0.545, 0.992, 1],
  selectedWidth: 2,
};

export type PreviewBackgroundMode = "solid" | "hidden" | "image";

export const DEFAULT_SETTINGS: AppSettings = {
  // Installation Steam par défaut ; l’écran de liaison détecte ou demande le dossier.
  tf3Root: "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Transport Fever 3",
  // Dossier des mods locaux du jeu (`…\local\staging_area`) : propre à chaque
  // installation, à renseigner dans les Paramètres avant le premier déploiement.
  stagingArea: "",
  density: "compact",
  recentProjects: [],
  lastOpenProject: null,
  openProjects: [],
  previewShowBoxes: false,
  previewBackground: "solid",
  previewBackgroundImage: null,
  previewBackgroundImages: {},
  previewAppearance: DEFAULT_PREVIEW_APPEARANCE,
  previewTextScale: "game",
  gameImportMode: "ui",
  language: "system",
};

export const SETTINGS_STORE_FILE = "settings.json";
/** Ancienne clé localStorage (migration seulement). */
export const LAYOUT_STORAGE_KEY = "tf3-ui-designer.dockview-layout.v2";
export const LAYOUT_STORE_FILE = "layout.json";
