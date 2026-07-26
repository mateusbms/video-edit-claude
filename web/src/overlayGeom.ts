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
