import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 130,  // past phase 2 transition + the slide-up text trigger
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 194 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[output.length - 1],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
}));

import { Scene03Pain } from "../Scene03Pain";

describe("Scene03Pain", () => {
  it("renders the pain phrase", () => {
    const { getByText } = render(
      <Scene03Pain text="They signed up" durationInFrames={194} audioSrc="" />
    );
    expect(getByText(/forgot you exist/)).toBeTruthy();
  });
});
