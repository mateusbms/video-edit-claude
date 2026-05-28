import brand from "./brand.json";

export const theme = {
  logo: brand.logo,
  handle: brand.handle,
  colors: brand.colors,
  fonts: brand.fonts,
  spring: { damping: 12, stiffness: 150, mass: 0.8, overshootClamping: false },
} as const;
