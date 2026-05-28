import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { findActive } from "../timeline-utils";
import type { TOverlay } from "../schema";

export const OverlayLayer: React.FC<{ overlays: TOverlay[] }> = ({ overlays }) => {
  const frame = useCurrentFrame();
  const active = findActive(overlays, frame);
  if (!active) return null;

  const local = frame - active.fromFrame;
  const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", padding: 60 }}>
      <div
        style={{
          opacity,
          backgroundColor: theme.colors.card,
          color: theme.colors.foreground,
          fontFamily: theme.fonts.body,
          fontWeight: 600,
          fontSize: 28,
          padding: "14px 28px",
          borderRadius: 12,
          borderLeft: `4px solid ${theme.colors.accent}`,
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
};
