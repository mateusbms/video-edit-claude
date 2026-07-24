import { describe, it, expect } from "vitest";
import { formatSeconds, percentage, activeLineIndex } from "../util";

describe("util", () => {
  it("formatSeconds mostra mm:ss", () => {
    expect(formatSeconds(75)).toBe("01:15");
    expect(formatSeconds(3)).toBe("00:03");
  });
  it("percentage clamp 0-100 e arredonda", () => {
    expect(percentage(50, 100)).toBe(50);
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(150, 100)).toBe(100);
  });
});

const _lines = [
  { text: "um", start: 0.0, end: 1.0, words: [] },
  { text: "dois", start: 1.0, end: 2.0, words: [] },
];

describe("activeLineIndex", () => {
  it("acha a linha pelo tempo", () => {
    expect(activeLineIndex(_lines as any, 0.5)).toBe(0);
    expect(activeLineIndex(_lines as any, 1.5)).toBe(1);
  });
  it("retorna -1 fora de qualquer linha", () => {
    expect(activeLineIndex(_lines as any, 5.0)).toBe(-1);
  });
  it("usa limite inferior inclusivo", () => {
    expect(activeLineIndex(_lines as any, 1.0)).toBe(1);
  });
});
