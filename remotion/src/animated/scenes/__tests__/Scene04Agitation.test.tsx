import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 60,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 152 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[output.length - 1],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
}));

import { Scene04Agitation } from "../Scene04Agitation";

describe("Scene04Agitation", () => {
  it("renders 'Days of setup' header text", () => {
    const { getByText } = render(
      <Scene04Agitation
        text="Multiple tools. Endless configuration."
        durationInFrames={152}
        audioSrc=""
      />
    );
    expect(getByText("Days of setup")).toBeTruthy();
  });
});
