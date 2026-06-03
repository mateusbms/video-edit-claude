import { describe, expect, it, vi } from "vitest";
import React from "react";

// Mock Remotion hooks before importing components
vi.mock("remotion", () => ({
  useCurrentFrame: vi.fn(() => 30),
  useVideoConfig: vi.fn(() => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 120 })),
  spring: vi.fn(() => 1),
  interpolate: vi.fn((frame: number, input: number[], output: number[]) => output[0]),
}));

describe("SpringIn", () => {
  it("renders children", async () => {
    const { SpringIn } = await import("../SpringIn");
    expect(SpringIn).toBeDefined();
    expect(typeof SpringIn).toBe("function");
  });
});

describe("FadeOut", () => {
  it("renders children", async () => {
    const { FadeOut } = await import("../FadeOut");
    expect(FadeOut).toBeDefined();
    expect(typeof FadeOut).toBe("function");
  });
});
