import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);

export const BrandKitSchema = z.object({
  name: z.string().min(1),
  colors: z.object({
    bg: hex, card: hex, border: hex,
    foreground: hex, muted: hex,
    accent: hex, accentLight: z.string(),
  }),
  fonts: z.object({ body: z.string(), headline: z.string() }),
});
export type BrandKitInput = z.infer<typeof BrandKitSchema>;
