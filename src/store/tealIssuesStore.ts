import { create } from "zustand";

interface TealIssuesState {
  lines: string[];
  setLines: (lines: string[]) => void;
  clear: () => void;
}

export const useTealIssuesStore = create<TealIssuesState>((set) => ({
  lines: [],
  setLines: (lines) => set({ lines }),
  clear: () => set({ lines: [] }),
}));
