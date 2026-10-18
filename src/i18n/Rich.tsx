import { Fragment, type ReactNode } from "react";
import { useT, type MessageParams, type TKey } from "./index";

/** Balises permises dans un texte traduit : `<b>…</b>`, `<em>…</em>`, `<code>…</code>`. */
const TAGS: Record<string, (children: ReactNode, key: number) => ReactNode> = {
  b: (c, key) => <strong key={key}>{c}</strong>,
  em: (c, key) => <em key={key}>{c}</em>,
  code: (c, key) => <code key={key}>{c}</code>,
};

/** Découpe un texte traduit en nœuds React (balises simples, non imbriquées). */
function richNodes(text: string, slots: Record<string, ReactNode> = {}): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<(b|em|code)>([\s\S]*?)<\/\1>|\[(\w+)\]/g;
  let last = 0;
  let key = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(TAGS[m[1]]!(m[2], key++));
    else out.push(<Fragment key={key++}>{slots[m[3]!] ?? m[0]}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Texte traduit avec mise en forme : `<b>`, `<em>`, `<code>`, et des
 * emplacements `[nom]` remplis par des éléments React (`slots`, ex. un bouton).
 */
export function Rich({
  k,
  params,
  slots,
}: {
  k: TKey;
  params?: MessageParams;
  slots?: Record<string, ReactNode>;
}) {
  const t = useT();
  return <>{richNodes(t(k, params), slots)}</>;
}
