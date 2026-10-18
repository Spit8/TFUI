export const previewTheme = {
  bg: "#1a1f26",
  surface: "#2a3140",
  surfaceAlt: "#343c4d",
  border: "#4a5568",
  text: "#e8eef4",
  textMuted: "#9aa7b5",
  accent: "#3d8bfd",
  mapBg: "#12161c",
  mapGrid: "#1e2630",
  fallbackBg: "#3a3f48",
  selectedOutline: "#3d8bfd",
  hoveredOutline: "#7eb0ff",
  /** Survol d’un élément : remplissage bleu transparent. */
  hoverFill: "rgba(61, 139, 253, 0.22)",
  dropInvalid: "#e5484d",
  dropInvalidFill: "rgba(229, 72, 77, 0.22)",
  fontFamily: '"Segoe UI", Candara, Calibri, sans-serif',
  fontScale: {
    "font-scale-body": 14,
    "font-scale-title": 18,
    "font-scale-caption": 12,
    "font-scale-small": 11,
  } as Record<string, number>,
};

export type PreviewTheme = typeof previewTheme;
