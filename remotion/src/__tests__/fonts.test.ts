import { describe, it, expect } from "vitest";
import { SUPPORTED_FONTS, resolveFont } from "../fonts";

describe("resolveFont", () => {
  it("mantém uma fonte suportada", () => {
    expect(resolveFont(SUPPORTED_FONTS[1])).toBe(SUPPORTED_FONTS[1]);
  });
  it("cai no padrão para fonte desconhecida", () => {
    expect(resolveFont("Comic Sans XYZ")).toBe("Inter");
  });
  it("lista curada não vazia e inclui Inter", () => {
    expect(SUPPORTED_FONTS.length).toBeGreaterThan(2);
    expect(SUPPORTED_FONTS).toContain("Inter");
  });
});
