export type Probe = { width: number; height: number; fps: number; duration: number };

export type CutParams = {
  silence_threshold_db: number;
  padding: number;
  min_silence: number;
};

export type Word = { word: string; start: number; end: number };
export type CaptionLine = { text: string; start: number; end: number; words: Word[] };

export type Hook = {
  title: string;
  subtitle: string;
  duration_frames: number;
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  anchor?: "center" | "left" | "right";
  maxWidthPct?: number;
};

export type OverlayAnim = "fade" | "slide-up" | "slide-down" | "pop" | "none";

export type Overlay = {
  id: string;
  type: string;
  text: string;
  fromFrame: number;
  durationInFrames: number;
  x: number;
  y: number;
  anchor: "center" | "left" | "right";
  fontSize: number;
  color: string;
  highlightColor: string;
  fontFamily: string;
  enter: OverlayAnim;
  exit: OverlayAnim;
  enterDurationInFrames: number;
  exitDurationInFrames: number;
  maxWidthPct?: number;
};

export type { CaptionStyle } from "./captionStyle";
import type { CaptionStyle } from "./captionStyle";

export type CutSegment = { start: number; end: number };

export type CutResult = {
  original_duration: number;
  trimmed_duration: number;
  segments: CutSegment[];
  // mtime do trimmed.mp4, usado como `?v=` no preview: corte e refino reescrevem
  // o arquivo no mesmo caminho, e sem isso o navegador reusa o vídeo antigo.
  trimmed_mtime?: number;
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
  has_source?: boolean;
  has_overlays?: boolean;
  has_suggestions?: boolean;
  orientation: "16x9" | "9x16";
  // cru (do job.config; "" = segue a marca) e resolvido (com o brand kit
  // aplicado, que é o que o render vai usar)
  captionStyle?: CaptionStyle;
  captionStyleResolved?: CaptionStyle;
  brandKitSlug?: string;
  papel: "normal" | "matriz";
  origem_matriz: string;
};

// Espelho de api/models.py::JobSummary.
export type JobSummary = {
  slug: string;
  title: string;
  updated_at: number;
  orientation: "16x9" | "9x16";
  has_source: boolean;
  has_trimmed: boolean;
  has_transcript: boolean;
  has_hook: boolean;
  has_recipe: boolean;
  // overlays.json e suggestions.json são arquivos independentes da recipe
  // (update_orientation apaga edit-recipe.json ao trocar de formato, mas
  // mantém os dois) — a tela de exclusão precisa nomeá-los separadamente.
  has_overlays: boolean;
  has_suggestions: boolean;
  has_render_16x9: boolean;
  has_render_9x16: boolean;
  bytes_source: number;
  bytes_total: number;
  // renders exportados; sobrevivem a apagar o projeto
  bytes_render: number;
  // cópias de upload do slug em input/, já somadas em bytes_total
  bytes_parts: number;
  papel: "normal" | "matriz";
  origem_matriz: string;
};

export type SSEEvent =
  | { event: "progress"; data: { stage?: string; format?: string; n?: number; total?: number; kind?: string } }
  | { event: "done"; data: { ok: true } }
  | { event: "error"; data: { detail: string } };

import type { TtsResult } from "./animatedApi";

export type AnimatedState = {
  brandKitSlug: string | null;
  scripts: Record<string, string>;
  audioResults: TtsResult[] | null;
  orientation: "16x9" | "9x16";
  jobId: string | null;
  previewJobId: string | null;
};

export const SCRIPT_KEYS = ["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"] as const;
