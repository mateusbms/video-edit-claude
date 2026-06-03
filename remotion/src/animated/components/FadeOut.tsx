import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export const FadeOut: React.FC<{
  startFrame: number;
  duration?: number;
  children: React.ReactNode;
}> = ({ startFrame, duration = 12, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame, [startFrame, startFrame + duration], [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const scale = interpolate(
    frame, [startFrame, startFrame + duration], [1, 0.96],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div style={{ opacity, transform: `scale(${scale})` }}>
      {children}
    </div>
  );
};
