import { describe, it, expect } from "vitest";
import { previewScaleFor, frameSize } from "../frame";

/**
 * Trava a regressão que motivou este plano: o preview escalava por 1920 fixo,
 * então no 9x16 (canvas de 1080) tudo saía 1920/1080 = 1,778x maior no render.
 *
 * ESCOPO: estes casos valem quando o vídeo-fonte tem o MESMO aspecto do formato
 * de saída — que é o caminho principal (a orientação é detectada do próprio
 * vídeo). O preview desenha o elemento <video> com o vídeo-fonte, então quando
 * os dois aspectos diferem o SourceClip do render cai no caminho "encaixa +
 * fundo desfocado" e o eixo VERTICAL do preview deixa de bater. Este arquivo
 * NÃO cobre esse caso de formatos cruzados; a mitigação hoje é o aviso do
 * UploadStep, não uma garantia de paridade.
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
    // supõe fonte 9x16 (mesmo aspecto do alvo) — ver ESCOPO no topo do arquivo:
    // com formatos cruzados o <video> do preview tem OUTRO aspecto e esta
    // relação deixa de valer.
    const clientHeight = clientWidth * (1920 / 1080);
    const scale = previewScaleFor(clientWidth, "9x16");
    const noPreview = (327 * scale) / clientHeight;
    expect(noPreview).toBeCloseTo(327 / 1920, 10);
  });
});
