import type { TEditRecipe, TAnimatedRecipe } from "./schema";

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

const sampleBrand = {
  slug: "sample",
  name: "Sample Brand",
  logo: "logo.png",
  colors: {
    bg: "#0e0e10",
    card: "#1a1a1e",
    border: "#27272a",
    foreground: "#ffffff",
    muted: "#a1a1aa",
    accent: "#22c55e",
    accentLight: "#86efac",
  },
  fonts: { body: "Inter", headline: "Instrument Serif" },
};

const sampleScenes = [
  { id: "scene-1", fromFrame: 0, durationInFrames: 90, audio: "", text: "Cena 1: introdução do conteúdo principal aqui." },
  { id: "scene-2", fromFrame: 90, durationInFrames: 90, audio: "", text: "Cena 2: desenvolvimento e conclusão do vídeo." },
];

export const defaultAnimatedRecipe16x9: TAnimatedRecipe = {
  recipeVersion: 1,
  kind: "animated",
  fps: 30,
  width: 1920,
  height: 1080,
  orientation: "16x9",
  brand: sampleBrand,
  scenes: sampleScenes,
  musicStartFrame: 45,
  musicVolume: 0.15,
};

export const defaultAnimatedRecipe9x16: TAnimatedRecipe = {
  recipeVersion: 1,
  kind: "animated",
  fps: 30,
  width: 1080,
  height: 1920,
  orientation: "9x16",
  brand: sampleBrand,
  scenes: sampleScenes,
  musicStartFrame: 45,
  musicVolume: 0.15,
};
