import { describe, expect, it } from "vitest";
import { estimateRemainingMs, formatRemaining, overallRatio } from "./importProgressModel";
import { loadingMessages, nextMessageAt, pickLoadingMessage } from "./loadingMessages";

describe("barre d’import du contenu du jeu", () => {
  it("avancement global pondéré par phase", () => {
    expect(overallRatio({ phase: "catalog", phaseRatio: 0, detail: "" })).toBe(0);
    expect(overallRatio({ phase: "fonts", phaseRatio: 0, detail: "" })).toBeCloseTo(0.15);
    expect(overallRatio({ phase: "images", phaseRatio: 0.5, detail: "" })).toBeCloseTo(0.6);
    expect(overallRatio({ phase: "images", phaseRatio: 1, detail: "" })).toBeCloseTo(1);
  });

  it("temps restant d’après le débit récent", () => {
    expect(estimateRemainingMs([{ t: 0, ratio: 0 }])).toBeNull();
    // 10 % par seconde → 60 % restants ≈ 6 s.
    const samples = [0, 1000, 2000, 3000, 4000].map((t) => ({ t, ratio: t / 10000 }));
    expect(estimateRemainingMs(samples)).toBeCloseTo(6000);
    expect(formatRemaining(6000)).toBe("environ 6 s");
    expect(formatRemaining(80000)).toBe("environ 1 min 20 s");
    expect(formatRemaining(null)).toBe("estimation en cours…");
  });

  it("messages au hasard, jamais deux fois de suite le même", () => {
    const first = pickLoadingMessage(null, () => 0);
    expect(loadingMessages()).toContain(first);
    expect(loadingMessages().length).toBeGreaterThan(10);
    for (let i = 0; i < 50; i++) expect(pickLoadingMessage(first)).not.toBe(first);
  });

  it("changement de message tous les 5 à 8 % d’avancement", () => {
    expect(nextMessageAt(10, () => 0)).toBe(15);
    expect(nextMessageAt(10, () => 0.999)).toBeCloseTo(18, 1);
    for (let i = 0; i < 20; i++) {
      const at = nextMessageAt(40);
      expect(at).toBeGreaterThanOrEqual(45);
      expect(at).toBeLessThanOrEqual(48);
    }
  });
});
