import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 80,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 126 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[output.length - 1],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
}));

import { Scene06Templates } from "../Scene06Templates";

describe("Scene06Templates", () => {
  it("renders Welcome aboard card", () => {
    const { getByText } = render(
      <Scene06Templates
        text="Here are your 7 templates"
        durationInFrames={126}
        audioSrc=""
      />
    );
    expect(getByText(/Welcome aboard/)).toBeTruthy();
  });

  it("renders all 7 template cards", () => {
    const { getByText } = render(
      <Scene06Templates
        text="Here are your 7 templates"
        durationInFrames={126}
        audioSrc=""
      />
    );
    expect(getByText(/Getting started/)).toBeTruthy();
    expect(getByText(/Tips for your first week/)).toBeTruthy();
    expect(getByText(/What others are building/)).toBeTruthy();
    expect(getByText(/A feature you'll love/)).toBeTruthy();
    expect(getByText(/Your journey so far/)).toBeTruthy();
    expect(getByText(/We'd love feedback/)).toBeTruthy();
  });

  it("renders green badge", () => {
    const { getByText } = render(
      <Scene06Templates
        text="Here are your 7 templates"
        durationInFrames={126}
        audioSrc=""
      />
    );
    expect(getByText(/7 templates/)).toBeTruthy();
  });
});
