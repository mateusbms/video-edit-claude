import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 30,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 117 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[output.length - 1],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
  Img: (props: any) => <img {...props} alt="" />,
}));

import { Scene05Relief } from "../Scene05Relief";

describe("Scene05Relief", () => {
  it("renders MCP badge", () => {
    const { getByText } = render(
      <Scene05Relief
        text="Or... you just tell Sendkit what you need."
        durationInFrames={117}
        audioSrc=""
        productName="Sendkit"
        logoSrc="/images/sendkit-logo-dark.png"
      />
    );
    expect(getByText(/MCP/)).toBeTruthy();
  });

  it("renders product name", () => {
    const { getByText } = render(
      <Scene05Relief
        text="Or... you just tell Sendkit what you need."
        durationInFrames={117}
        audioSrc=""
        productName="Sendkit"
        logoSrc="/images/sendkit-logo-dark.png"
      />
    );
    expect(getByText("Sendkit")).toBeTruthy();
  });
});
