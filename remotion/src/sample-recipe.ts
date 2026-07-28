import type { TEditRecipe, TAnimatedRecipe } from "./schema";

export const sampleRecipe: TEditRecipe = {
  fps: 30,
  source: { width: 1280, height: 720, trimmedFrames: 180 },
  segments: [
    // Fase B: sem card — a composição de produção começa no clip em frame 0
    // e o hook é overlay animado sobre ele (ver overlays abaixo).
    { type: "clip", source: "trimmed.mp4", inFrame: 0, outFrame: 180, reframe: { focusX: 0.5 } },
  ],
  captions: [
    {
      fromFrame: 0,
      durationInFrames: 30,
      text: "ola pessoal",
      words: [
        { word: "ola", fromFrame: 0, durationInFrames: 15 },
        { word: "pessoal", fromFrame: 15, durationInFrames: 15 },
      ],
    },
  ],
  overlays: [
    {
      id: "ov_sample",
      type: "hook",
      text: "O segredo",
      fromFrame: 0,
      durationInFrames: 90,
      x: 0.5,
      y: 0.16,
      anchor: "center",
      fontSize: 84,
      maxWidthPct: 80,
      color: "",
      highlightColor: "",
      fontFamily: "",
      enter: "slide-up",
      exit: "fade",
      enterDurationInFrames: 12,
      exitDurationInFrames: 12,
    },
  ],
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

// 11 scenes × 65 frames each = 715 total frames (~23.8s @ 30fps)
// fromFrames: 0, 65, 130, 195, 260, 325, 390, 455, 520, 585, 650
const sampleScenes = [
  {
    id: "s01",
    fromFrame: 0,
    durationInFrames: 65,
    audio: "",
    text: "AI-native email infrastructure",
  },
  {
    id: "s02",
    fromFrame: 65,
    durationInFrames: 65,
    audio: "",
    text: "Your signup form is leaking leads — 40% never verify their email.",
  },
  {
    id: "s03",
    fromFrame: 130,
    durationInFrames: 65,
    audio: "",
    text: "Dead addresses, spam traps, and typos poison your sender reputation.",
  },
  {
    id: "s04",
    fromFrame: 195,
    durationInFrames: 65,
    audio: "",
    text: "Every bounced email damages your domain — and Gmail may block you permanently.",
  },
  {
    id: "s05",
    fromFrame: 260,
    durationInFrames: 65,
    audio: "",
    text: "Sendkit validates every address at the point of capture — before it reaches your list.",
  },
  {
    id: "s06",
    fromFrame: 325,
    durationInFrames: 65,
    audio: "",
    text: "Drop in one of our battle-tested templates: welcome, onboarding, re-engagement.",
  },
  {
    id: "s06b",
    fromFrame: 390,
    durationInFrames: 65,
    audio: "",
    text: "Every email renders pixel-perfect across Gmail, Outlook, and Apple Mail.",
  },
  {
    id: "s07",
    fromFrame: 455,
    durationInFrames: 65,
    audio: "",
    text: "Build multi-step flows with a visual editor — no code required.",
  },
  {
    id: "s08",
    fromFrame: 520,
    durationInFrames: 65,
    audio: "",
    text: "99.2% delivery rate. 2.1× open rate vs industry average.",
  },
  {
    id: "s09",
    fromFrame: 585,
    durationInFrames: 65,
    audio: "",
    text: "Ship your first email campaign in under 10 minutes.",
  },
  {
    id: "s10",
    fromFrame: 650,
    durationInFrames: 65,
    audio: "",
    text: "sendkit.dev",
  },
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
