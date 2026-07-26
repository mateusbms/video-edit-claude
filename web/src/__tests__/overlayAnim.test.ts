import { describe, it, expect } from "vitest";
import { overlayProgress, type OverlayTiming } from "../overlayAnim";

const base: OverlayTiming = {
  fromFrame: 0, durationInFrames: 90,
  enter: "slide-up", exit: "fade",
  enterDurationInFrames: 12, exitDurationInFrames: 12,
};

describe("overlayProgress (web, paridade com remotion/overlay-utils)", () => {
  it("entrada local=0 invisível, translateY +40", () => {
    const p = overlayProgress(0, base);
    expect(p.opacity).toBe(0);
    expect(p.translateY).toBeCloseTo(40, 5);
  });
  it("meio totalmente visível", () => {
    const p = overlayProgress(45, base);
    expect(p.opacity).toBe(1);
    expect(p.translateY).toBeCloseTo(0, 5);
    expect(p.scale).toBeCloseTo(1, 5);
  });
  it("fim faz fade-out", () => {
    expect(overlayProgress(89, base).opacity).toBeLessThan(0.2);
    expect(overlayProgress(90, base).opacity).toBe(0);
  });
  it("none = hard cut", () => {
    const p = overlayProgress(0, { ...base, enter: "none", exit: "none" });
    expect(p.opacity).toBe(1);
    expect(p.translateY).toBe(0);
  });
});
