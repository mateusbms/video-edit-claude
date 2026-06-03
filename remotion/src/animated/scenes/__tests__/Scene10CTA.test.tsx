import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 40,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 77 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[output.length - 1],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
  Img: (props: any) => <img {...props} alt="" />,
}));

import { Scene10CTA } from "../Scene10CTA";

describe("Scene10CTA", () => {
  it("renders CTA text with URL", () => {
    const { getByText } = render(
      <Scene10CTA
        text="sendkit.dev"
        durationInFrames={77}
        audioSrc=""
        productName="Sendkit"
        logoSrc="/logo.png"
      />
    );
    expect(getByText(/try free at/)).toBeTruthy();
  });
});
