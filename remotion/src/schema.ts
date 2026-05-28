import { z } from "zod";

export const zWord = z.object({
  word: z.string(),
  fromFrame: z.number(),
  durationInFrames: z.number(),
});

export const zCaption = z.object({
  fromFrame: z.number(),
  durationInFrames: z.number(),
  text: z.string(),
  words: z.array(zWord),
});

export const zClipSegment = z.object({
  type: z.literal("clip"),
  source: z.string(),
  inFrame: z.number(),
  outFrame: z.number(),
  reframe: z.object({ focusX: z.number() }),
});

export const zCardSegment = z.object({
  type: z.literal("card"),
  durationInFrames: z.number(),
  title: z.string(),
  subtitle: z.string(),
});

// v2: cena 100% animada — reservada, aceita campos extras
export const zSceneSegment = z
  .object({ type: z.literal("scene"), durationInFrames: z.number() })
  .passthrough();

export const zSegment = z.discriminatedUnion("type", [
  zClipSegment,
  zCardSegment,
  zSceneSegment,
]);

export const zOverlay = z.object({
  type: z.string(),
  fromFrame: z.number(),
  durationInFrames: z.number(),
  text: z.string(),
});

export const zFormat = z.object({ width: z.number(), height: z.number() });

export const zEditRecipe = z.object({
  fps: z.number(),
  source: z.object({
    width: z.number(),
    height: z.number(),
    trimmedFrames: z.number(),
  }),
  segments: z.array(zSegment),
  captions: z.array(zCaption),
  overlays: z.array(zOverlay),
  formats: z.object({ main16x9: zFormat, vertical9x16: zFormat }),
});

export type TEditRecipe = z.infer<typeof zEditRecipe>;
export type TSegment = z.infer<typeof zSegment>;
export type TCaption = z.infer<typeof zCaption>;
export type TOverlay = z.infer<typeof zOverlay>;
