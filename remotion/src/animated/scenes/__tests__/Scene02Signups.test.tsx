import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 30,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 95 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[output.length - 1],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
}));

import { Scene02Signups } from "../Scene02Signups";

describe("Scene02Signups", () => {
  it("renders the dashboard URL", () => {
    const { getByText } = render(
      <Scene02Signups text="Users signing up" durationInFrames={95} audioSrc="" />
    );
    expect(getByText(/yourapp.com\/dashboard/)).toBeTruthy();
  });
});
