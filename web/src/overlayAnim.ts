export type OverlayAnim = "fade" | "slide-up" | "slide-down" | "pop" | "none";

export interface OverlayTiming {
  fromFrame: number;
  durationInFrames: number;
  enter: OverlayAnim;
  exit: OverlayAnim;
  enterDurationInFrames: number;
  exitDurationInFrames: number;
}

export interface OverlayTransform {
  opacity: number;
  translateY: number;
  scale: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// Cópia pura de remotion/src/overlay-utils.ts (§3.4): fonte única da animação;
// paridade travada pelo teste-espelho. Fidelidade de render validada por /still.
export function overlayProgress(frame: number, o: OverlayTiming): OverlayTransform {
  const local = frame - o.fromFrame;
  const dur = o.durationInFrames;

  const enterP = o.enterDurationInFrames > 0 ? clamp01(local / o.enterDurationInFrames) : 1;
  const exitP = o.exitDurationInFrames > 0 ? clamp01((dur - local) / o.exitDurationInFrames) : 1;

  let opacity = 1;
  let translateY = 0;
  let scale = 1;

  switch (o.enter) {
    case "fade": opacity = Math.min(opacity, enterP); break;
    case "slide-up": opacity = Math.min(opacity, enterP); translateY += (1 - enterP) * 40; break;
    case "slide-down": opacity = Math.min(opacity, enterP); translateY += (1 - enterP) * -40; break;
    case "pop": {
      opacity = Math.min(opacity, enterP);
      const eased = 1 - Math.pow(1 - enterP, 3);
      scale = 0.7 + eased * 0.3;
      break;
    }
    case "none":
    default: break;
  }

  switch (o.exit) {
    case "fade": opacity = Math.min(opacity, exitP); break;
    case "slide-up": opacity = Math.min(opacity, exitP); translateY += (1 - exitP) * -40; break;
    case "slide-down": opacity = Math.min(opacity, exitP); translateY += (1 - exitP) * 40; break;
    case "pop": opacity = Math.min(opacity, exitP); scale = Math.min(scale, 0.7 + exitP * 0.3); break;
    case "none":
    default: break;
  }

  return { opacity, translateY, scale };
}
