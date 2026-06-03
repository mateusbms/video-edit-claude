import { describe, it, expect } from "vitest";
import { BrandKitSchema } from "../schemas/brandKit";

describe("BrandKitSchema", () => {
  it("rejects bad hex", () => {
    const r = BrandKitSchema.safeParse({
      name: "X",
      colors: { bg: "not-a-hex", card: "#fff", border: "#000",
        foreground: "#000", muted: "#888", accent: "#0f0",
        accentLight: "rgba(0,255,0,0.1)" },
      fonts: { body: "Inter", headline: "Serif" },
    });
    expect(r.success).toBe(false);
  });
  it("accepts valid kit", () => {
    const r = BrandKitSchema.safeParse({
      name: "X",
      colors: { bg: "#fff", card: "#fff", border: "#000",
        foreground: "#000", muted: "#888", accent: "#0f0",
        accentLight: "rgba(0,255,0,0.1)" },
      fonts: { body: "Inter", headline: "Serif" },
    });
    expect(r.success).toBe(true);
  });
});
