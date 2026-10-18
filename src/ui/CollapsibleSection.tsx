import { ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  getSectionOpen,
  notifySectionStorage,
  setSectionOpen,
  subscribeSectionStorage,
  toggleAllSections,
} from "./sectionCollapse";
import "./CollapsibleSection.css";

const knownIdsByKey = new Map<string, Set<string>>();

function registerKnownId(storageKey: string, id: string): void {
  let set = knownIdsByKey.get(storageKey);
  if (!set) {
    set = new Set();
    knownIdsByKey.set(storageKey, set);
  }
  set.add(id);
}

export interface CollapsibleSectionProps {
  id: string;
  title: string;
  storageKey: string;
  defaultOpen?: boolean;
  countLabel?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  id,
  title,
  storageKey,
  defaultOpen = true,
  countLabel,
  headerActions,
  children,
  className,
}: CollapsibleSectionProps) {
  registerKnownId(storageKey, id);
  const [open, setOpen] = useState(() =>
    getSectionOpen(storageKey, id, defaultOpen),
  );

  useEffect(() => {
    return subscribeSectionStorage(storageKey, () => {
      setOpen(getSectionOpen(storageKey, id, defaultOpen));
    });
  }, [storageKey, id, defaultOpen]);

  const applyOpen = useCallback(
    (next: boolean) => {
      setSectionOpen(storageKey, id, next);
      setOpen(next);
      notifySectionStorage(storageKey);
    },
    [storageKey, id],
  );

  function onHeaderClick(e: MouseEvent) {
    if (e.altKey) {
      const known = [...(knownIdsByKey.get(storageKey) ?? [])];
      const next = !open;
      toggleAllSections(storageKey, known, next);
      notifySectionStorage(storageKey);
      return;
    }
    applyOpen(!open);
  }

  function onHeaderKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      applyOpen(!open);
    }
  }

  return (
    <section
      className={`collapsible-section${className ? ` ${className}` : ""}`}
    >
      <div
        className="collapsible-section-header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onHeaderClick}
        onKeyDown={onHeaderKeyDown}
      >
        <ChevronRight
          size={14}
          className={`collapsible-chevron${open ? " open" : ""}`}
          aria-hidden
        />
        <span className="collapsible-title">{title}</span>
        {countLabel ? (
          <span className="collapsible-count">{countLabel}</span>
        ) : null}
        {headerActions ? (
          <span
            className="collapsible-actions"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {headerActions}
          </span>
        ) : null}
      </div>
      {open ? <div className="collapsible-body">{children}</div> : null}
    </section>
  );
}

export const INSP_SECTIONS_KEY = "tfui.insp.sections";
export const PALETTE_SECTIONS_KEY = "tfui.palette.sections";
export const STYLES_SECTIONS_KEY = "tfui.styles.sections";
export const TREE_SECTIONS_KEY = "tfui.tree.sections";
export const ICONS_SECTIONS_KEY = "tfui.icons.sections";
