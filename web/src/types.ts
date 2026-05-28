export type Probe = { width: number; height: number; fps: number; duration: number };

export type CutParams = {
  silence_threshold_db: number;
  padding: number;
  min_silence: number;
};

export type Word = { word: string; start: number; end: number };
export type CaptionLine = { text: string; start: number; end: number; words: Word[] };

export type Hook = { title: string; subtitle: string; duration_frames: number };

export type CutSegment = { start: number; end: number };

export type CutResult = {
  original_duration: number;
  trimmed_duration: number;
  segments: CutSegment[];
};

export type JobState = {
  slug: string;
  probe: Probe | null;
  config: CutParams;
  has_trimmed: boolean;
  has_transcript: boolean;
  has_hook: boolean;
  has_recipe: boolean;
  has_render_16x9: boolean;
  has_render_9x16: boolean;
};

export type SSEEvent =
  | { event: "progress"; data: { stage?: string; format?: string; n?: number; total?: number; kind?: string } }
  | { event: "done"; data: { ok: true } }
  | { event: "error"; data: { detail: string } };
