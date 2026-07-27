import { describe, it, expect } from "vitest";
import { hookToOverlays } from "../overlayHook";
import type { Hook } from "../types";

const base: Hook = { title: "H", subtitle: "sub", duration_frames: 90,
  x: 0.3, y: 0.6, fontSize: 100, fontFamily: "Poppins", color: "#ff0000", anchor: "left" };

describe("hookToOverlays", () => {
  it("mapeia título com os campos do hook", () => {
    const [t] = hookToOverlays(base);
    expect(t.id).toBe("ov_hook");
    expect(t.type).toBe("hook");
    expect(t.x).toBe(0.3); expect(t.y).toBe(0.6); expect(t.fontSize).toBe(100);
    expect(t.fontFamily).toBe("Poppins"); expect(t.color).toBe("#ff0000"); expect(t.anchor).toBe("left");
    expect(t.durationInFrames).toBe(90);
  });
  it("deriva o subtítulo do título", () => {
    const ovs = hookToOverlays(base);
    expect(ovs).toHaveLength(2);
    const s = ovs[1];
    expect(s.text).toBe("sub"); expect(s.x).toBe(0.3); expect(s.anchor).toBe("left");
    expect(s.y).toBeCloseTo(0.68, 6); expect(s.fontSize).toBe(48); expect(s.fromFrame).toBe(6);
  });
  it("sem subtítulo -> só o título", () => {
    expect(hookToOverlays({ ...base, subtitle: "" })).toHaveLength(1);
  });
  it("aplica defaults quando campos opcionais ausentes", () => {
    const [t] = hookToOverlays({ title: "H", subtitle: "", duration_frames: 90 });
    expect(t.x).toBe(0.5); expect(t.y).toBe(0.16); expect(t.fontSize).toBe(84); expect(t.anchor).toBe("center");
  });
});
