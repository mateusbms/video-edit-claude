import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 60,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 104 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[output.length - 1],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
}));

import { Scene08Metrics } from "../Scene08Metrics";

describe("Scene08Metrics", () => {
  it("renders headline", () => {
    const { getByText } = render(
      <Scene08Metrics
        text="They engage. They convert. They pay."
        durationInFrames={104}
        audioSrc=""
      />
    );
    expect(getByText(/Turn signups into paying customers/)).toBeTruthy();
  });

  it("renders +32% conversion value", () => {
    const { getByText } = render(
      <Scene08Metrics
        text="They engage. They convert. They pay."
        durationInFrames={104}
        audioSrc=""
      />
    );
    expect(getByText(/\+32%/)).toBeTruthy();
  });

  it("renders metric card labels", () => {
    const { getByText } = render(
      <Scene08Metrics
        text="They engage. They convert. They pay."
        durationInFrames={104}
        audioSrc=""
      />
    );
    expect(getByText(/Conversions/)).toBeTruthy();
    expect(getByText(/Revenue/)).toBeTruthy();
    expect(getByText(/Customers/)).toBeTruthy();
  });

  it("renders revenue 'from email' sublabel", () => {
    const { getByText } = render(
      <Scene08Metrics
        text="They engage. They convert. They pay."
        durationInFrames={104}
        audioSrc=""
      />
    );
    expect(getByText(/from email/)).toBeTruthy();
  });

  it("renders 5 avatar circles for Customers card", () => {
    const { getAllByTestId } = render(
      <Scene08Metrics
        text="They engage. They convert. They pay."
        durationInFrames={104}
        audioSrc=""
      />
    );
    expect(getAllByTestId("avatar-circle").length).toBe(5);
  });
});
