import type { Overlay } from "./types";

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
    enter: "slide-up",
    exit: "fade",
    enterDurationInFrames: 12,
    exitDurationInFrames: 12,
  };
}
