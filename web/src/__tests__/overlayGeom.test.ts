import { describe, it, expect } from "vitest";
import { clientToFraction, captionZone, overlapsCaption } from "../overlayGeom";

describe("clientToFraction", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 } as DOMRect;
  it("converte ponto para fração [0,1] relativa ao rect", () => {
    expect(clientToFraction(300, 150, rect)).toEqual({ x: 0.5, y: 0.5 });
  });
  it("clampa fora dos limites", () => {
    expect(clientToFraction(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(clientToFraction(9999, 9999, rect)).toEqual({ x: 1, y: 1 });
  });
});

describe("captionZone", () => {
  it("faixa perto do rodapé para estilo típico", () => {
    const z = captionZone({ bottom: 120, fontSize: 48 }); // refHeight 1080
    expect(z.bottom).toBeCloseTo(1 - 120 / 1080, 6);
    expect(z.top).toBeCloseTo(1 - (120 + 48 * 1.6) / 1080, 6);
    expect(z.top).toBeLessThan(z.bottom);
  });
  it("clampa em [0,1]", () => {
    const z = captionZone({ bottom: 5000, fontSize: 48 });
    expect(z.top).toBe(0);
    expect(z.bottom).toBe(0);
  });
});

describe("overlapsCaption", () => {
  const zone = { top: 0.8, bottom: 0.9 };
  it("y dentro da faixa colide", () => {
    expect(overlapsCaption({ y: 0.85 }, zone)).toBe(true);
  });
  it("y fora não colide", () => {
    expect(overlapsCaption({ y: 0.2 }, zone)).toBe(false);
  });
});
