import { useSyncExternalStore } from "react";
import { getCommandContext } from "../../app/commands";
import { MenuList } from "./MenuList";
import {
  closeTextMenu,
  getTextMenuState,
  subscribeTextMenu,
  textMenuItems,
} from "./nativeMenu";

/** Affiche le menu Couper / Copier / Coller des champs texte ; monté une fois à la racine. */
export function TextFieldMenuHost() {
  const current = useSyncExternalStore(subscribeTextMenu, getTextMenuState);
  if (!current) return null;
  return (
    <MenuList
      items={textMenuItems(current.field)}
      anchor={{ x: current.x, y: current.y }}
      ctx={getCommandContext()}
      onClose={closeTextMenu}
      doc={current.doc}
    />
  );
}
