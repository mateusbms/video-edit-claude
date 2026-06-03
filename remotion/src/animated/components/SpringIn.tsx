import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export const SpringIn: React.FC<{
  from: number;
  slide?: number;
  children: React.ReactNode;
}> = ({ from, slide = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({
    frame: frame - from,
    fps,
    config: { damping: 10, stiffness: 150, mass: 0.8 },
  });
  return (
    <div style={{
      transform: `translateY(${(1 - t) * slide}px) scale(${0.7 + 0.3 * t})`,
      opacity: t,
    }}>
      {children}
    </div>
  );
};
