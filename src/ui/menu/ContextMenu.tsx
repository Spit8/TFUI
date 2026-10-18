import {
  getCommandContext,
  type CommandContext,
} from "../../app/commands";
import { MenuList } from "./MenuList";
import type { MenuItem } from "./types";

export function ContextMenu({
  x,
  y,
  items,
  onClose,
  ctx,
  doc,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  ctx?: CommandContext;
  /** Document de l’élément cliqué ; voir `useContextMenu`. */
  doc?: Document;
}) {
  return (
    <MenuList
      items={items}
      anchor={{ x, y }}
      ctx={ctx ?? getCommandContext()}
      onClose={onClose}
      mode="context"
      doc={doc}
    />
  );
}
