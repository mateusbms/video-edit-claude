import { describe, it, expect } from "vitest";
import { applyStartSec, applyEndSec } from "../overlayTime";

describe("applyStartSec", () => {
  it("move o início mantendo o fim fixo", () => {
    // overlay 1s..3s (fromFrame 30, dur 60) @30fps; novo início 2s -> 60..90
    const r = applyStartSec(30, 60, 2, 30);
    expect(r.fromFrame).toBe(60);
    expect(r.durationInFrames).toBe(30); // fim continua em frame 90
  });
  it("clampa início negativo em 0 sem empurrar o fim", () => {
    // fim em frame 90 (30+60); início -1s -> 0, duração deriva do início clampado
    const r = applyStartSec(30, 60, -1, 30);
    expect(r.fromFrame).toBe(0);
    expect(r.durationInFrames).toBe(90); // fim segue em 90, não vira 120
  });
  it("garante duração mínima de 1 frame", () => {
    const r = applyStartSec(30, 60, 100, 30); // início além do fim
    expect(r.durationInFrames).toBe(1);
  });
});

describe("applyEndSec", () => {
  it("move o fim mantendo o início fixo", () => {
    const r = applyEndSec(30, 4, 30); // início frame 30, fim 4s -> 120
    expect(r.durationInFrames).toBe(90);
  });
  it("garante duração mínima de 1 frame quando fim <= início", () => {
    const r = applyEndSec(30, 0, 30);
    expect(r.durationInFrames).toBe(1);
  });
});
