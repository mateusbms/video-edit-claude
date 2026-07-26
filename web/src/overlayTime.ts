// Conversões tempo(s)↔frame para editar o intervalo de um overlay.
// Puras e testáveis (a lógica mais delicada do editor).

// Ajusta o INÍCIO mantendo o FIM fixo. Clampa o início em >=0 e deriva a
// duração do início já clampado (senão um início negativo empurra o fim).
export function applyStartSec(
  fromFrame: number,
  durationInFrames: number,
  s: number,
  fps: number,
): { fromFrame: number; durationInFrames: number } {
  const end = fromFrame + durationInFrames;
  const f = Math.max(0, Math.round(s * fps));
  return { fromFrame: f, durationInFrames: Math.max(1, end - f) };
}

// Ajusta o FIM mantendo o início fixo. Duração mínima de 1 frame.
export function applyEndSec(
  fromFrame: number,
  s: number,
  fps: number,
): { durationInFrames: number } {
  return { durationInFrames: Math.max(1, Math.round(s * fps) - fromFrame) };
}
