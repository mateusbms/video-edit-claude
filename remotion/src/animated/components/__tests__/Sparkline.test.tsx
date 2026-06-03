import { describe, expect, it, vi } from "vitest";
import React from "react";

// Mock Remotion hooks before importing Sparkline
vi.mock("remotion", () => ({
  useCurrentFrame: vi.fn(() => 30),
  useVideoConfig: vi.fn(() => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 120 })),
  interpolate: vi.fn((_frame: number, _input: number[], output: number[]) => output[1]),
}));

describe("Sparkline", () => {
  it("renders an SVG element", async () => {
    const { render } = await import("@testing-library/react");
    const { Sparkline } = await import("../Sparkline");
    const { container } = render(
      <Sparkline
        points={[1, 2, 3, 4, 5]}
        color="#16a34a"
        fromFrame={0}
        drawDuration={30}
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("renders a polyline/path inside the SVG", async () => {
    const { render } = await import("@testing-library/react");
    const { Sparkline } = await import("../Sparkline");
    const { container } = render(
      <Sparkline
        points={[10, 40, 20, 60, 30]}
        color="#2563eb"
        fromFrame={0}
        drawDuration={45}
        width={120}
        height={40}
      />,
    );
    const path = container.querySelector("path");
    expect(path).not.toBeNull();
  });
});
