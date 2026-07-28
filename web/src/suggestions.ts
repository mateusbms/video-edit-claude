import type { Overlay, OverlayAnim } from "./types";

export type Suggestion = {
  id: string;
  text: string;
  fromFrame: number;
  durationInFrames: number;
  kind: "short" | "dense";
  angle: string;
  source: string;
};

export type SuggestDefaults = {
  x: number;
  y: number;
  anchor: "center" | "left" | "right";
  fontSize: number;
  fontFamily: string;
  color: string;
  enter: OverlayAnim;
  exit: OverlayAnim;
  durationInFrames: number;
  maxWidthPct: number;
};

export function suggestionToOverlay(s: Suggestion, d: SuggestDefaults, id: string): Overlay {
  return {
    id,
    type: "text",
    text: s.text,
    fromFrame: s.fromFrame,
    durationInFrames: s.durationInFrames,
    x: d.x,
    y: d.y,
    anchor: d.anchor,
    fontSize: d.fontSize,
    color: d.color,
    highlightColor: "",
    fontFamily: d.fontFamily,
    maxWidthPct: d.maxWidthPct,
    enter: d.enter,
    exit: d.exit,
    enterDurationInFrames: 12,
    exitDurationInFrames: 12,
  };
}
