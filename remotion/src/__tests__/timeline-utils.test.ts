import { describe, it, expect } from "vitest";
import {
  segmentDuration,
  totalDuration,
  findActive,
  activeWordIndex,
} from "../timeline-utils";

describe("segmentDuration", () => {
  it("usa outFrame-inFrame para clip", () => {
    expect(segmentDuration({ type: "clip", inFrame: 0, outFrame: 60, source: "x", reframe: { focusX: 0.5 } })).toBe(60);
  });
  it("usa durationInFrames para card", () => {
    expect(segmentDuration({ type: "card", durationInFrames: 90, title: "t", subtitle: "s" })).toBe(90);
  });
});

describe("totalDuration", () => {
  it("soma todos os segmentos", () => {
    expect(
      totalDuration([
        { type: "card", durationInFrames: 90, title: "t", subtitle: "s" },
        { type: "clip", inFrame: 0, outFrame: 60, source: "x", reframe: { focusX: 0.5 } },
      ])
    ).toBe(150);
  });
});

describe("findActive", () => {
  const items = [
    { fromFrame: 0, durationInFrames: 10 },
    { fromFrame: 10, durationInFrames: 10 },
  ];
  it("acha o item cujo intervalo contém o frame", () => {
    expect(findActive(items, 5)).toBe(items[0]);
    expect(findActive(items, 10)).toBe(items[1]);
  });
  it("retorna null fora de qualquer intervalo", () => {
    expect(findActive(items, 25)).toBeNull();
  });
});

describe("activeWordIndex", () => {
  const words = [
    { word: "a", fromFrame: 0, durationInFrames: 5 },
    { word: "b", fromFrame: 5, durationInFrames: 5 },
  ];
  it("retorna o índice da palavra ativa", () => {
    expect(activeWordIndex(words, 3)).toBe(0);
    expect(activeWordIndex(words, 7)).toBe(1);
  });
  it("retorna -1 antes da primeira palavra", () => {
    expect(activeWordIndex(words, -1)).toBe(-1);
  });
});
