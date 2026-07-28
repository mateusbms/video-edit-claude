import { describe, it, expect } from "vitest";
import { FRAME_SIZES, frameSize, previewScaleFor } from "../frame";

describe("frameSize", () => {
  it("devolve os tamanhos canônicos", () => {
    expect(frameSize("16x9")).toEqual({ width: 1920, height: 1080 });
    expect(frameSize("9x16")).toEqual({ width: 1080, height: 1920 });
  });

  it("cai no 16x9 para valor ausente ou desconhecido", () => {
    expect(frameSize(undefined)).toEqual({ width: 1920, height: 1080 });
    expect(frameSize("")).toEqual({ width: 1920, height: 1080 });
    expect(frameSize("banana")).toEqual({ width: 1920, height: 1080 });
  });

  it("expõe exatamente as duas orientações", () => {
    expect(Object.keys(FRAME_SIZES).sort()).toEqual(["16x9", "9x16"]);
  });
});

describe("previewScaleFor", () => {
  it("escala pela largura do frame-alvo", () => {
    // preview de 304px de largura mostrando um frame 9x16 (1080 de largura)
    expect(previewScaleFor(304, "9x16")).toBeCloseTo(304 / 1080, 6);
    expect(previewScaleFor(960, "16x9")).toBeCloseTo(0.5, 6);
  });

  it("um texto de 158px ocupa a mesma fração da largura no preview e no render", () => {
    const clientWidth = 304;
    const scale = previewScaleFor(clientWidth, "9x16");
    const fracaoNoPreview = (158 * scale) / clientWidth;
    const fracaoNoRender = 158 / 1080;
    expect(fracaoNoPreview).toBeCloseTo(fracaoNoRender, 10);
  });

  it("devolve 1 para largura não positiva", () => {
    expect(previewScaleFor(0, "9x16")).toBe(1);
    expect(previewScaleFor(-5, "16x9")).toBe(1);
  });
});
