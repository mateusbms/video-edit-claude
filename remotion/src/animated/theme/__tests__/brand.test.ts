import { describe, expect, it } from "vitest";
import { brandKitToTheme, SENDKIT_DEFAULTS } from "../brand";

describe("brandKitToTheme", () => {
  it("uses kit colors when present", () => {
    const theme = brandKitToTheme({
      colors: { bg: "#000", card: "#111", border: "#222",
        foreground: "#fff", muted: "#888",
        accent: "#0f0", accentLight: "rgba(0,255,0,0.1)" },
      fonts: { body: "Inter", headline: "Serif" },
    } as any);
    expect(theme.bg).toBe("#000");
    expect(theme.accent).toBe("#0f0");
  });
  it("falls back to Sendkit defaults for missing fields", () => {
    const theme = brandKitToTheme({ colors: {}, fonts: {} } as any);
    expect(theme.bg).toBe(SENDKIT_DEFAULTS.bg);
  });
});
