export type FieldKind =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "slot-single"
  | "slot-multi"
  | "handler"
  | "enum"
  | "vec2f"
  | "vec3f"
  | "vec4f"
  | "vec2i"
  /** Union de scalaires (`integer|number|string`) : `ComboBoxItem.value`, `TabWidgetChild.value`… */
  | "scalar"
  /** Liste de nombres (`{number}`) : `TableLayout.columnWeights = { 10, -1, 80 }`. */
  | "number-list"
  | "unsupported";

export interface CatalogField {
  name: string;
  tealType: string;
  kind: FieldKind;
  enumName?: string;
  comment?: string;
}

export interface CatalogComponent {
  name: string;
  paramRecord: string;
  fields: CatalogField[];
  source: "builtin" | "helper";
}

export interface Catalog {
  generatedAt: string;
  sourceHash: string;
  /** Version du parseur qui a produit le catalogue (absente : ancien cache). */
  parserVersion?: number;
  enums: Record<string, string[]>;
  components: CatalogComponent[];
}

export type ComponentStatus = "stable" | "experimental" | "unsafe";

export interface ComponentOverride {
  category: string;
  status?: ComponentStatus;
  notes?: string[];
  icon?: string;
  defaults?: Record<string, unknown>;
  ugRequire?: string;
  helperExport?: string;
  /**
   * Propriétés de style vérifiées en jeu pour ce composant, en plus de celles
   * que le vanilla lui pose et du socle commun (voir model/styleKeys.ts).
   */
  styleKeys?: string[];
  /** When set, this override describes a helper not present in builtin.d.tl */
  manual?: {
    paramRecord: string;
    fields: CatalogField[];
  };
}

export interface ResolvedComponent extends CatalogComponent {
  category: string;
  status: ComponentStatus;
  notes: string[];
  icon?: string;
  defaults: Record<string, unknown>;
  ugRequire?: string;
  helperExport?: string;
  inWhitelist: boolean;
}

export interface StyleVocabulary {
  generatedAt: string;
  /** Version de l’extracteur (absente : ancien cache, reconstruit au démarrage). */
  extractorVersion?: number;
  styleKeys: string[];
  /**
   * Clés de premier niveau posées par le vanilla, par élément visé (dernier
   * niveau du sélecteur : `TextView`, `Window::Content`…). Absent d’un cache
   * antérieur : un re-scan le remplit.
   */
  keysByElement?: Record<string, string[]>;
  classes: string[];
  fontScaleClasses: string[];
  scannedFiles: number;
}
