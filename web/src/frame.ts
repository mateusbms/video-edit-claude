// Espelho de pipeline/orientation.py. O render e o preview têm que concordar
// sobre a largura do canvas, senão o texto sai com tamanho diferente do previsto.
export type Orientation = "16x9" | "9x16";

export const FRAME_SIZES: Record<Orientation, { width: number; height: number }> = {
  "16x9": { width: 1920, height: 1080 },
  "9x16": { width: 1080, height: 1920 },
};

const DEFAULT: Orientation = "16x9";

export function frameSize(o?: string): { width: number; height: number } {
  return FRAME_SIZES[o as Orientation] ?? FRAME_SIZES[DEFAULT];
}

// Converte px do canvas de render em px de tela. Os estilos da recipe estão
// em px do frame-alvo; o elemento <video> do preview é menor.
export function previewScaleFor(clientWidth: number, o?: string): number {
  if (clientWidth <= 0) return 1;
  return clientWidth / frameSize(o).width;
}
