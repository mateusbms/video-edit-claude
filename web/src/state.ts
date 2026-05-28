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
