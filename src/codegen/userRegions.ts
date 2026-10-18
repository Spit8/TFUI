const BEGIN_RE = /^\s*--\s*@tfui:begin\s+user:([A-Za-z0-9_-]+)\s*$/;
const END_RE = /^\s*--\s*@tfui:end\s+user:([A-Za-z0-9_-]+)\s*$/;

export function extractUserRegions(content: string): Map<string, string> {
  const regions = new Map<string, string>();
  const lines = content.split(/\r?\n/);
  let currentId: string | null = null;
  let buf: string[] = [];

  for (const line of lines) {
    const begin = line.match(BEGIN_RE);
    if (begin) {
      currentId = begin[1];
      buf = [];
      continue;
    }
    const end = line.match(END_RE);
    if (end && currentId && end[1] === currentId) {
      regions.set(currentId, buf.join("\n"));
      currentId = null;
      buf = [];
      continue;
    }
    if (currentId !== null) {
      buf.push(line);
    }
  }
  return regions;
}

export function wrapUserRegion(id: string, body: string): string {
  const trimmed = body.replace(/^\n+/, "").replace(/\n+$/, "");
  const inner = trimmed.length > 0 ? `${trimmed}\n` : "";
  return `-- @tfui:begin user:${id}\n${inner}-- @tfui:end user:${id}`;
}

/** Replace region bodies in generated content with previous user bodies when present. */
export function mergeUserRegions(
  generated: string,
  previous: string | undefined,
): string {
  if (!previous) return generated;
  const prev = extractUserRegions(previous);
  if (prev.size === 0) return generated;

  const lines = generated.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const begin = lines[i].match(BEGIN_RE);
    if (!begin) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const id = begin[1];
    let j = i + 1;
    while (j < lines.length && !lines[j].match(END_RE)) {
      j++;
    }
    if (j >= lines.length) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const endMatch = lines[j].match(END_RE);
    if (!endMatch || endMatch[1] !== id) {
      out.push(lines[i]);
      i++;
      continue;
    }
    if (prev.has(id)) {
      out.push(lines[i]);
      const body = prev.get(id)!;
      if (body.length > 0) {
        out.push(...body.split(/\r?\n/));
      }
      out.push(lines[j]);
    } else {
      for (let k = i; k <= j; k++) out.push(lines[k]);
    }
    i = j + 1;
  }
  return out.join("\n");
}
