import { describe, it, expect } from "vitest";
import { previewScaleFor, frameSize } from "../frame";

/**
 * Trava a regressão que motivou este plano: o preview escalava por 1920 fixo,
 * então no 9x16 (canvas de 1080) tudo saía 1920/1080 = 1,778x maior no render.
 */
describe("paridade preview x render", () => {
  const casos = [
    { nome: "hook do job A1", px: 158, orientation: "9x16" as const },
    { nome: "legenda do job A1", px: 92, orientation: "9x16" as const },
    { nome: "texto padrão", px: 64, orientation: "9x16" as const },
    { nome: "legenda padrão 16x9", px: 48, orientation: "16x9" as const },
  ];

  it.each(casos)("$nome ocupa a mesma fração da largura nos dois", ({ px, orientation }) => {
    const clientWidth = 304; // <video> vertical típico em max-h-[60vh]
    const scale = previewScaleFor(clientWidth, orientation);
    const noPreview = (px * scale) / clientWidth;
    const noRender = px / frameSize(orientation).width;
    expect(noPreview).toBeCloseTo(noRender, 10);
  });

  it("a régua antiga errava por exatamente 1920/1080 no vertical", () => {
    const clientWidth = 304;
    const antiga = clientWidth / 1920;
    const nova = previewScaleFor(clientWidth, "9x16");
    expect(nova / antiga).toBeCloseTo(1920 / 1080, 10);
  });

  it("o offset vertical da legenda também bate", () => {
    // bottom 327 num frame 9x16: 327/1920 da altura
    const clientWidth = 304;
    const clientHeight = clientWidth * (1920 / 1080);
    const scale = previewScaleFor(clientWidth, "9x16");
    const noPreview = (327 * scale) / clientHeight;
    expect(noPreview).toBeCloseTo(327 / 1920, 10);
  });
});
