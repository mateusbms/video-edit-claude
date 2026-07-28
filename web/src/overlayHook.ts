import type { Hook, Overlay } from "./types";

// Espelha a geração do backend (pipeline/recipe.py): título + subtítulo derivado.
export function hookToOverlays(hook: Hook): Overlay[] {
  const x = hook.x ?? 0.5;
  const y = hook.y ?? 0.16;
  const fontSize = hook.fontSize ?? 84;
  const fontFamily = hook.fontFamily ?? "";
  const color = hook.color ?? "";
  const anchor = hook.anchor ?? "center";
  const maxWidthPct = hook.maxWidthPct ?? 80;
  const dur = hook.duration_frames;
  const title: Overlay = {
    id: "ov_hook", type: "hook", text: hook.title,
    fromFrame: 0, durationInFrames: dur,
    x, y, anchor, fontSize, color, highlightColor: "", fontFamily,
    enter: "slide-up", exit: "fade", enterDurationInFrames: 12, exitDurationInFrames: 12,
    maxWidthPct,
  };
  const out: Overlay[] = [title];
  if (hook.subtitle) {
    out.push({
      id: "ov_hook_sub", type: "text", text: hook.subtitle,
      fromFrame: 6, durationInFrames: Math.max(1, dur - 6),
      x, y: y + 0.08, anchor, fontSize: Math.round(fontSize * 0.48),
      color, highlightColor: "", fontFamily,
      enter: "slide-up", exit: "fade", enterDurationInFrames: 12, exitDurationInFrames: 12,
      maxWidthPct,
    });
  }
  return out;
}
