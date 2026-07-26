import { describe, it, expect } from "vitest";
import { clientToFraction } from "../overlayGeom";

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
