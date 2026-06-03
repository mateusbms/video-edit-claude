export const SENDKIT_DEFAULTS = {
  bg: "#f5f5f0",
  card: "#ffffff",
  border: "#e2e2dc",
  foreground: "#262622",
  muted: "#757568",
  accent: "#16a34a",
  accentLight: "rgba(22,163,74,0.12)",
  accentGlow: "rgba(22,163,74,0.25)",
  fontBody: "Inter",
  fontHeadline: "Instrument Serif",
};

export type Theme = typeof SENDKIT_DEFAULTS;

type Kit = {
  colors?: Partial<Record<keyof Theme, string>>;
  fonts?: { body?: string; headline?: string };
};

export function brandKitToTheme(kit: Kit): Theme {
  const c = kit.colors ?? {};
  const f = kit.fonts ?? {};
  return {
    ...SENDKIT_DEFAULTS,
    ...(c as object),
    fontBody: f.body ?? SENDKIT_DEFAULTS.fontBody,
    fontHeadline: f.headline ?? SENDKIT_DEFAULTS.fontHeadline,
  };
}
