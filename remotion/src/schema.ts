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

export const zOverlayAnim = z.enum(["fade", "slide-up", "slide-down", "pop", "none"]);

export const zOverlay = z.object({
  id: z.string().default(""), // estável p/ edição/react keys; "" só em overlays legados
  type: z.string().default("text"), // "text" | "hook" | "lowerThird" (legado)
  text: z.string(),
  fromFrame: z.number(),
  durationInFrames: z.number(),
  x: z.number().default(0.5),
  y: z.number().default(0.18),
  anchor: z.enum(["center", "left", "right"]).default("center"),
  fontSize: z.number().default(64),
  maxWidthPct: z.number().default(80),
  color: z.string().default(""), // "" => usa theme.colors.foreground
  highlightColor: z.string().default(""),
  fontFamily: z.string().default(""), // "" => usa theme.fonts.heading
  enter: zOverlayAnim.default("slide-up"),
  exit: zOverlayAnim.default("fade"),
  enterDurationInFrames: z.number().default(12),
  exitDurationInFrames: z.number().default(12),
});

export const zFormat = z.object({ width: z.number(), height: z.number() });

export const zCaptionStyle = z.object({
  fontSize: z.number(),
  bottom: z.number(),
  color: z.string(),
  highlightColor: z.string(),
  fontFamily: z.string(),
});

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
  // Um job tem uma orientação só, então a recipe nova traz UMA chave aqui.
  // Recipes antigas (geradas antes disso) trazem as duas e continuam válidas.
  // .partial() em vez de z.record: mantém os nomes das chaves no tipo, então
  // um typo vira erro de compilação e quem indexa é obrigado a tratar a
  // ausência — que é justamente o caso "recipe de outra orientação".
  formats: z.object({ main16x9: zFormat, vertical9x16: zFormat }).partial(),
  captionStyle: zCaptionStyle.optional(),
});

export type TEditRecipe = z.infer<typeof zEditRecipe>;
export type TSegment = z.infer<typeof zSegment>;
export type TCaption = z.infer<typeof zCaption>;
export type TOverlay = z.infer<typeof zOverlay>;
export type TCaptionStyle = z.infer<typeof zCaptionStyle>;

export const AnimatedRecipeSchema = z.object({
  recipeVersion: z.literal(1),
  kind: z.literal("animated"),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  orientation: z.enum(["16x9", "9x16"]),
  brand: z.object({
    slug: z.string(),
    name: z.string(),
    logo: z.string(),
    colors: z.object({
      bg: z.string(),
      card: z.string(),
      border: z.string(),
      foreground: z.string(),
      muted: z.string(),
      accent: z.string(),
      accentLight: z.string(),
    }),
    fonts: z.object({ body: z.string(), headline: z.string() }),
  }),
  scenes: z.array(
    z.object({
      id: z.string(),
      fromFrame: z.number(),
      durationInFrames: z.number(),
      audio: z.string(),
      text: z.string(),
    })
  ),
  musicSrc: z.string().optional(),
  musicStartFrame: z.number().default(45),
  musicVolume: z.number().default(0.15),
});

export type TAnimatedRecipe = z.infer<typeof AnimatedRecipeSchema>;
