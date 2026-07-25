import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";

try {
  loadInter();
} catch {}
try {
  loadPoppins();
} catch {}
try {
  loadMontserrat();
} catch {}
try {
  loadRoboto();
} catch {}

export const SUPPORTED_FONTS = ["Inter", "Poppins", "Montserrat", "Roboto"] as const;

export function resolveFont(name: string): string {
  return (SUPPORTED_FONTS as readonly string[]).includes(name) ? name : "Inter";
}
