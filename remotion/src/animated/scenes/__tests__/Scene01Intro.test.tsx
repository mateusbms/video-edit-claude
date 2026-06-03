import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 30,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 138 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[0],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
  Img: (props: any) => <img {...props} alt="" />,
}));

import { Scene01Intro } from "../Scene01Intro";

describe("Scene01Intro", () => {
  it("renders product name from props", () => {
    const { getByText } = render(
      <Scene01Intro
        text="AI-native email infrastructure."
        durationInFrames={138}
        audioSrc=""
        productName="Sendkit"
        logoSrc="/logo.png"
      />
    );
    expect(getByText(/Sendkit/)).toBeTruthy();
  });
});
