import type { SourceMapEntry } from "./types";

export type { SourceMapEntry };

export class SourceMapBuilder {
  private entries: SourceMapEntry[] = [];
  private line = 1;

  get currentLine(): number {
    return this.line;
  }

  /** Count newlines about to be appended (content without trailing accounting). */
  advance(text: string): void {
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "\n") this.line++;
    }
  }

  mark(nodeId: string, startLine: number, endLine: number): void {
    this.entries.push({ nodeId, startLine, endLine });
  }

  build(): SourceMapEntry[] {
    return [...this.entries];
  }
}

export function findNodeAtLine(
  map: SourceMapEntry[],
  line: number,
): string | null {
  let best: SourceMapEntry | null = null;
  for (const e of map) {
    if (line >= e.startLine && line <= e.endLine) {
      if (
        !best ||
        e.endLine - e.startLine < best.endLine - best.startLine
      ) {
        best = e;
      }
    }
  }
  return best?.nodeId ?? null;
}

/** First start line for a node id, or null if absent. */
export function findLineForNode(
  map: SourceMapEntry[],
  nodeId: string,
): number | null {
  let best: SourceMapEntry | null = null;
  for (const e of map) {
    if (e.nodeId !== nodeId) continue;
    if (
      !best ||
      e.endLine - e.startLine < best.endLine - best.startLine
    ) {
      best = e;
    }
  }
  return best?.startLine ?? null;
}
