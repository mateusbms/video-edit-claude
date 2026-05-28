import type { TSegment } from "./schema";

export function segmentDuration(seg: TSegment): number {
  if (seg.type === "clip") return seg.outFrame - seg.inFrame;
  return seg.durationInFrames;
}

export function totalDuration(segments: TSegment[]): number {
  return segments.reduce((acc, s) => acc + segmentDuration(s), 0);
}

type Timed = { fromFrame: number; durationInFrames: number };

export function findActive<T extends Timed>(items: T[], frame: number): T | null {
  for (const item of items) {
    if (frame >= item.fromFrame && frame < item.fromFrame + item.durationInFrames) {
      return item;
    }
  }
  return null;
}

export function activeWordIndex(words: Timed[], frame: number): number {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (frame >= w.fromFrame && frame < w.fromFrame + w.durationInFrames) return i;
  }
  // se já passou da última palavra mas ainda na linha, destaca a última
  if (words.length && frame >= words[words.length - 1].fromFrame) return words.length - 1;
  return -1;
}
