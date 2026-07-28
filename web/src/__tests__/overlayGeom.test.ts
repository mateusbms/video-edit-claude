import { describe, it, expect } from "vitest";
import { captionRefHeight, clientToFraction, captionZone, overlapsCaption, overlapsInTime, snapPosition } from "../overlayGeom";

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

describe("captionRefHeight", () => {
  it("16:9 dá 1080 (canvas do render)", () => {
    expect(captionRefHeight({ width: 1920, height: 1080 })).toBeCloseTo(1080, 6);
    expect(captionRefHeight({ width: 1280, height: 720 })).toBeCloseTo(1080, 6);
  });
  it("vertical 9:16 dá a altura proporcional, não 1080", () => {
    expect(captionRefHeight({ width: 2160, height: 3840 })).toBeCloseTo(3413.333, 3);
  });
  it("sem probe (ou dimensão inválida) cai no fallback 1080", () => {
    expect(captionRefHeight(undefined)).toBe(1080);
    expect(captionRefHeight({ width: 0, height: 1080 })).toBe(1080);
  });
});

describe("captionZone com refHeight do vídeo", () => {
  // A faixa tem que cair onde o CaptionOverlay desenha a legenda:
  // marginBottom = bottom * (larguraPreview / 1920), como fração da altura do preview.
  const overlayBottomFraction = (bottom: number, w: number, h: number) =>
    1 - (bottom * (w / 1920)) / (w * (h / w));

  it("bate com o CaptionOverlay num vídeo vertical", () => {
    const probe = { width: 2160, height: 3840 };
    const z = captionZone({ bottom: 327, fontSize: 92 }, captionRefHeight(probe));
    expect(z.bottom).toBeCloseTo(overlayBottomFraction(327, probe.width, probe.height), 6);
  });

  it("continua batendo em 16:9", () => {
    const probe = { width: 1280, height: 720 };
    const z = captionZone({ bottom: 120, fontSize: 48 }, captionRefHeight(probe));
    expect(z.bottom).toBeCloseTo(overlayBottomFraction(120, probe.width, probe.height), 6);
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

const seg = (fromFrame: number, durationInFrames: number) => ({ fromFrame, durationInFrames });

describe("overlapsInTime", () => {
  it("cruzam", () => expect(overlapsInTime(seg(0, 60), seg(30, 60))).toBe(true));
  it("disjuntos", () => expect(overlapsInTime(seg(0, 60), seg(60, 60))).toBe(false));
  it("um dentro do outro", () => expect(overlapsInTime(seg(0, 120), seg(30, 10))).toBe(true));
});

describe("snapPosition", () => {
  const tx = [0.5], ty = [0.5];
  it("snap no centro X", () => {
    const r = snapPosition(0.505, 0.2, tx, ty, 0.012);
    expect(r.x).toBe(0.5); expect(r.guideX).toBe(0.5); expect(r.guideY).toBeNull();
  });
  it("snap em X e Y", () => {
    const r = snapPosition(0.5, 0.5, tx, ty, 0.012);
    expect(r.guideX).toBe(0.5); expect(r.guideY).toBe(0.5);
  });
  it("sem snap fora do limiar", () => {
    const r = snapPosition(0.2, 0.2, tx, ty, 0.012);
    expect(r.x).toBe(0.2); expect(r.guideX).toBeNull();
  });
  it("escolhe alvo mais próximo", () => {
    const r = snapPosition(0.31, 0.2, [0.3, 0.7], ty, 0.02);
    expect(r.x).toBe(0.3);
  });
});
