import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState, defaultState } from "../state";
import { useAppStore } from "../state";

beforeEach(() => localStorage.clear());

describe("state", () => {
  it("retorna defaults se nada salvo", () => {
    expect(loadState()).toEqual(defaultState);
  });
  it("salva e recarrega", () => {
    saveState({ slug: "abc", step: 3 });
    expect(loadState()).toEqual({ slug: "abc", step: 3 });
  });
});

describe("mode discriminator", () => {
  beforeEach(() => useAppStore.setState({ mode: null }));
  it("starts with no mode", () => {
    expect(useAppStore.getState().mode).toBeNull();
  });
  it("can set mode", () => {
    useAppStore.getState().setMode("animated");
    expect(useAppStore.getState().mode).toBe("animated");
  });
});
