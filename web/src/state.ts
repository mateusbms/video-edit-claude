import { create } from "zustand";
import type { AnimatedState } from "./types";

export type AppState = { slug: string; step: number };
export const defaultState: AppState = { slug: "", step: 0 };
const KEY = "edit-local:state";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...(JSON.parse(raw) as AppState) };
  } catch {
    return defaultState;
  }
}

export function saveState(s: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearState(): void {
  localStorage.removeItem(KEY);
}

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------

const defaultAnimatedState: AnimatedState = {
  brandKitSlug: null,
  scripts: {},
  audioResults: null,
  orientation: "16x9",
  jobId: null,
};

type StoreState = {
  mode: "recorded" | "animated" | null;
  setMode: (m: "recorded" | "animated" | null) => void;
  animatedState: AnimatedState;
  setAnimatedState: (updater: (s: AnimatedState) => AnimatedState) => void;
};

export const useAppStore = create<StoreState>((set) => ({
  mode: null,
  setMode: (m) => set({ mode: m }),
  animatedState: defaultAnimatedState,
  setAnimatedState: (updater) =>
    set((s) => ({ animatedState: updater(s.animatedState) })),
}));
