const COST_PER_1K_CHARS = 0.30; // ElevenLabs creator-tier ballpark; adjust later
export function estimateCostUsd(chars: number): number {
  return Math.round((chars / 1000) * COST_PER_1K_CHARS * 100) / 100;
}
