const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Converte um ponto de tela (clientX/Y) em fração [0,1] relativa ao rect do container.
export function clientToFraction(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

// Zona (fração da altura) onde a legenda fica, para desenhar como guia de colisão.
// Aproximação: legenda ancorada no rodapé, altura ~1.6x o fontSize.
// refHeight é a altura do frame-alvo, que vem de frameSize(orientation) — sem
// default aqui, para não guardar um tamanho canônico fora de frame.ts.
export function captionZone(
  style: { bottom: number; fontSize: number },
  refHeight: number,
): { top: number; bottom: number } {
  const hPx = style.fontSize * 1.6;
  const bottom = clamp01(1 - style.bottom / refHeight);
  const top = clamp01(1 - (style.bottom + hPx) / refHeight);
  return { top, bottom };
}

// true se o centro vertical do overlay cai dentro da faixa da legenda.
export function overlapsCaption(o: { y: number }, zone: { top: number; bottom: number }): boolean {
  return o.y >= zone.top && o.y <= zone.bottom;
}

// true se as janelas de tempo [fromFrame, fromFrame+durationInFrames) de dois overlays se cruzam.
export function overlapsInTime(
  a: { fromFrame: number; durationInFrames: number },
  b: { fromFrame: number; durationInFrames: number },
): boolean {
  return a.fromFrame < b.fromFrame + b.durationInFrames &&
         b.fromFrame < a.fromFrame + a.durationInFrames;
}

// Snapping de alinhamento durante drag: encaixa x/y no alvo mais próximo dentro do limiar
// e reporta as guias (linhas) resultantes para desenho.
export function snapPosition(
  x: number, y: number, targetsX: number[], targetsY: number[], threshold = 0.012,
): { x: number; y: number; guideX: number | null; guideY: number | null } {
  const nearest = (v: number, ts: number[]) => {
    let best: number | null = null;
    let bestD = threshold;
    for (const t of ts) {
      const d = Math.abs(v - t);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  };
  const gx = nearest(x, targetsX);
  const gy = nearest(y, targetsY);
  return { x: gx ?? x, y: gy ?? y, guideX: gx, guideY: gy };
}
