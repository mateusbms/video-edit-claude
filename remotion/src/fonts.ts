import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";
import { loadFont as loadDMSerifDisplay } from "@remotion/google-fonts/DMSerifDisplay";
import { loadFont as loadPlusJakartaSans } from "@remotion/google-fonts/PlusJakartaSans";

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
try {
  loadDMSerifDisplay();
} catch {}
try {
  loadPlusJakartaSans();
} catch {}

export const SUPPORTED_FONTS = [
  "Inter",
  "Poppins",
  "Montserrat",
  "Roboto",
  "DM Serif Display",
  "Plus Jakarta Sans",
] as const;

export function resolveFont(name: string): string {
  return (SUPPORTED_FONTS as readonly string[]).includes(name) ? name : "Inter";
}
