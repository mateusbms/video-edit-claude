import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => ({
  useCurrentFrame: () => 80,
  useVideoConfig: () => ({ fps: 30, width: 1920, height: 1080, durationInFrames: 124 }),
  spring: () => 1,
  interpolate: (frame: number, input: number[], output: number[]) => output[output.length - 1],
  AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
  Audio: () => null,
  Img: (props: any) => <img {...props} alt="" />,
}));

import { Scene06bEmailPreview } from "../Scene06bEmailPreview";

describe("Scene06bEmailPreview", () => {
  it("renders the welcome heading", () => {
    const { getByText } = render(
      <Scene06bEmailPreview
        text="Pixel-perfect. Personalized. Ready to send."
        durationInFrames={124}
        audioSrc=""
        productName="Sendkit"
        logoSrc="/images/sendkit-logo-dark.png"
      />
    );
    expect(getByText(/Welcome to/)).toBeTruthy();
  });

  it("renders the CTA button", () => {
    const { getByText } = render(
      <Scene06bEmailPreview
        text="Pixel-perfect. Personalized. Ready to send."
        durationInFrames={124}
        audioSrc=""
        productName="Sendkit"
        logoSrc="/images/sendkit-logo-dark.png"
      />
    );
    expect(getByText(/Set up my domain/)).toBeTruthy();
  });

  it("renders the three setup steps", () => {
    const { getByText } = render(
      <Scene06bEmailPreview
        text="Pixel-perfect. Personalized. Ready to send."
        durationInFrames={124}
        audioSrc=""
        productName="Sendkit"
        logoSrc="/images/sendkit-logo-dark.png"
      />
    );
    expect(getByText(/Add your sending domain/)).toBeTruthy();
    expect(getByText(/Create an API key/)).toBeTruthy();
    expect(getByText(/Send your first email/)).toBeTruthy();
  });

  it("renders the signature", () => {
    const { getByText } = render(
      <Scene06bEmailPreview
        text="Pixel-perfect. Personalized. Ready to send."
        durationInFrames={124}
        audioSrc=""
        productName="Sendkit"
        logoSrc="/images/sendkit-logo-dark.png"
      />
    );
    expect(getByText(/Paulo Castellano/)).toBeTruthy();
    expect(getByText(/Talk soon/)).toBeTruthy();
  });
});
