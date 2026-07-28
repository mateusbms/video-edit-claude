import { describe, it, expect } from "vitest";
import { suggestionToOverlay } from "../suggestions";
import type { Suggestion, SuggestDefaults } from "../suggestions";

const sug: Suggestion = {
  id: "sug_01", text: "R$ 6-15 mil / ano",
  fromFrame: 810, durationInFrames: 60, kind: "short", angle: "urgency", source: "...",
};
const defs: SuggestDefaults = {
  x: 0.4, y: 0.8, anchor: "left", fontSize: 90, fontFamily: "Poppins", color: "#ff0000",
  enter: "pop", exit: "slide-down", durationInFrames: 90, maxWidthPct: 70,
};

describe("suggestionToOverlay", () => {
  it("aplica o estilo padrão e copia texto/tempo", () => {
    const o = suggestionToOverlay(sug, defs, "ov_x");
    expect(o.id).toBe("ov_x");
    expect(o.type).toBe("text");
    expect(o.text).toBe("R$ 6-15 mil / ano");
    expect(o.fromFrame).toBe(810);
    expect(o.durationInFrames).toBe(60);
    expect(o.x).toBe(0.4);
    expect(o.y).toBe(0.8);
    expect(o.anchor).toBe("left");
    expect(o.fontSize).toBe(90);
    expect(o.fontFamily).toBe("Poppins");
    expect(o.color).toBe("#ff0000");
    expect(o.enter).toBe("pop");
    expect(o.exit).toBe("slide-down");
    expect(o.maxWidthPct).toBe(70);
    expect(o.durationInFrames).toBe(sug.durationInFrames);
  });
});
