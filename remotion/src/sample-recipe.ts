import type { TEditRecipe } from "./schema";

export const sampleRecipe: TEditRecipe = {
  fps: 30,
  source: { width: 1280, height: 720, trimmedFrames: 180 },
  segments: [
    { type: "card", durationInFrames: 90, title: "O segredo", subtitle: "em 60s" },
    { type: "clip", source: "trimmed.mp4", inFrame: 0, outFrame: 180, reframe: { focusX: 0.5 } },
  ],
  captions: [
    {
      fromFrame: 90,
      durationInFrames: 30,
      text: "ola pessoal",
      words: [
        { word: "ola", fromFrame: 90, durationInFrames: 15 },
        { word: "pessoal", fromFrame: 105, durationInFrames: 15 },
      ],
    },
  ],
  overlays: [{ type: "lowerThird", fromFrame: 0, durationInFrames: 90, text: "O segredo" }],
  formats: { main16x9: { width: 1920, height: 1080 }, vertical9x16: { width: 1080, height: 1920 } },
};
