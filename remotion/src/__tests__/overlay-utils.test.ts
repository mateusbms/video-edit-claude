import { describe, it, expect } from "vitest";
import { overlayProgress, type OverlayTiming } from "../overlay-utils";

const base: OverlayTiming = {
  fromFrame: 0,
  durationInFrames: 90,
  enter: "slide-up",
  exit: "fade",
  enterDurationInFrames: 12,
  exitDurationInFrames: 12,
};

describe("overlayProgress", () => {
  it("no frame de entrada (local=0) começa invisível", () => {
    const p = overlayProgress(0, base);
    expect(p.opacity).toBe(0);
    expect(p.translateY).toBeCloseTo(40, 5); // slide-up parte de +40px
  });

  it("no meio está totalmente visível e sem deslocamento", () => {
    const p = overlayProgress(45, base);
    expect(p.opacity).toBe(1);
    expect(p.translateY).toBeCloseTo(0, 5);
    expect(p.scale).toBeCloseTo(1, 5);
  });

  it("nos últimos frames faz fade-out", () => {
    const near = overlayProgress(89, base); // 1 frame antes do fim
    expect(near.opacity).toBeGreaterThan(0);
    expect(near.opacity).toBeLessThan(0.2);
    const end = overlayProgress(90, base); // fim exato
    expect(end.opacity).toBe(0);
  });

  it("respeita enter/exit 'none' (hard cut, sempre visível no range)", () => {
    const p = overlayProgress(0, { ...base, enter: "none", exit: "none" });
    expect(p.opacity).toBe(1);
    expect(p.translateY).toBe(0);
  });

  it("slide-down entra de cima (translateY negativo no início)", () => {
    const p = overlayProgress(0, { ...base, enter: "slide-down" });
    expect(p.translateY).toBeCloseTo(-40, 5);
  });
});
