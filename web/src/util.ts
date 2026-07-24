import type { CaptionLine } from "./types";

export function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s - m * 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function percentage(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((n / total) * 100)));
}

export function activeLineIndex(lines: CaptionLine[], t: number): number {
  return lines.findIndex((l) => t >= l.start && t < l.end);
}
