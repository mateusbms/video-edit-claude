import { describe, it, expect } from "vitest";
import { zOverlay } from "../schema";

describe("zOverlay defaults (retrocompat)", () => {
  it("aplica defaults a um overlay legado (só type/text/frames)", () => {
    const o = zOverlay.parse({
      type: "lowerThird",
      text: "x",
      fromFrame: 0,
      durationInFrames: 90,
    });
    expect(o.id).toBe("");
    expect(o.x).toBe(0.5);
    expect(o.y).toBe(0.18);
    expect(o.anchor).toBe("center");
    expect(o.fontSize).toBe(64);
    expect(o.color).toBe("");
    expect(o.enter).toBe("slide-up");
    expect(o.exit).toBe("fade");
    expect(o.enterDurationInFrames).toBe(12);
    expect(o.exitDurationInFrames).toBe(12);
  });

  it("preserva campos ricos fornecidos", () => {
    const o = zOverlay.parse({
      id: "ov_hook",
      type: "hook",
      text: "T",
      fromFrame: 0,
      durationInFrames: 90,
      x: 0.5,
      y: 0.16,
      fontSize: 84,
      enter: "pop",
      exit: "none",
    });
    expect(o.id).toBe("ov_hook");
    expect(o.type).toBe("hook");
    expect(o.fontSize).toBe(84);
    expect(o.enter).toBe("pop");
    expect(o.exit).toBe("none");
  });
});
