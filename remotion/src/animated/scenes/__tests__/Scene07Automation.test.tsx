import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 120,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 161 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[output.length - 1],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
}));

import { Scene07Automation } from "../Scene07Automation";

describe("Scene07Automation", () => {
  it("renders Automation live badge", () => {
    const { getByText } = render(
      <Scene07Automation
        text="Your automation goes live."
        durationInFrames={161}
        audioSrc=""
      />
    );
    expect(getByText(/Automation live/)).toBeTruthy();
  });

  it("renders New signup card", () => {
    const { getByText } = render(
      <Scene07Automation
        text="Your automation goes live."
        durationInFrames={161}
        audioSrc=""
      />
    );
    expect(getByText(/New signup/)).toBeTruthy();
  });

  it("renders all 5 flow cards", () => {
    const { getByText } = render(
      <Scene07Automation
        text="Your automation goes live."
        durationInFrames={161}
        audioSrc=""
      />
    );
    expect(getByText(/New signup/)).toBeTruthy();
    expect(getByText(/Welcome email/)).toBeTruthy();
    expect(getByText(/Wait 2 days/)).toBeTruthy();
    expect(getByText(/Getting started/)).toBeTruthy();
    expect(getByText(/Opened\?/)).toBeTruthy();
  });

  it("renders branch labels", () => {
    const { getByText } = render(
      <Scene07Automation
        text="Your automation goes live."
        durationInFrames={161}
        audioSrc=""
      />
    );
    expect(getByText(/Yes → nurture/)).toBeTruthy();
    expect(getByText(/No → re-engage/)).toBeTruthy();
  });
});
