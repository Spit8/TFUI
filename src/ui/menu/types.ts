export type MenuItem =
  | { type: "command"; id: string }
  | { type: "separator" }
  | { type: "submenu"; label: string; children: MenuItem[]; icon?: string }
  | { type: "label"; text: string; danger?: boolean; onClick?: () => void }
  /** Action locale hors registre (ex. Couper / Coller d’un champ texte). */
  | {
      type: "action";
      label: string;
      onClick: () => void;
      disabled?: boolean;
      /** Infobulle (ex. raison de la désactivation). */
      title?: string;
      shortcut?: string;
      icon?: string;
    }
  | {
      type: "checkbox";
      id: string;
      checked: boolean;
      label?: string;
    };

export interface MenuAnchor {
  x: number;
  y: number;
}
