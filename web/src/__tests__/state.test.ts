import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState, defaultState } from "../state";

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
