import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 30,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 101 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[0],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
}));

import { Scene09MicDrop } from "../Scene09MicDrop";

describe("Scene09MicDrop", () => {
  it("renders main text from props", () => {
    const { getByText } = render(
      <Scene09MicDrop
        text="from zero to a complete email stack"
        durationInFrames={101}
        audioSrc=""
      />
    );
    expect(getByText(/Under 5 minutes/)).toBeTruthy();
  });
});
