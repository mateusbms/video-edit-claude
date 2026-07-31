import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("remotion", () => {
  const Series = ({ children }: any) => <div>{children}</div>;
  (Series as any).Sequence = ({ children }: any) => <div>{children}</div>;
  return {
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 1000,
    }),
    spring: () => 1,
    interpolate: (_frame: number, _input: number[], output: number[]) =>
      output[output.length - 1],
    AbsoluteFill: ({ children, style }: any) => <div style={style}>{children}</div>,
    Audio: () => null,
    Img: (props: any) => <img {...props} alt="" />,
    staticFile: (path: string) => path,
    Series,
  };
});

import { AnimatedRoot } from "../AnimatedRoot";
import { defaultAnimatedRecipe16x9 } from "../../sample-recipe";

describe("AnimatedRoot", () => {
  it("renders without throwing", () => {
    const { container } = render(<AnimatedRoot {...defaultAnimatedRecipe16x9} />);
    expect(container).toBeTruthy();
  });
});
