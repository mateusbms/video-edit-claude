import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

export const HookCard: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame: frame - 4, fps, config: theme.spring });
  const titleY = interpolate(titleSpring, [0, 1], [30, 0]);
  const subOpacity = interpolate(frame, [16, 28], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.colors.bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontFamily: theme.fonts.heading,
          fontSize: 96,
          color: theme.colors.foreground,
          margin: 0,
          transform: `translateY(${titleY}px)`,
          opacity: titleSpring,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontFamily: theme.fonts.body,
          fontSize: 34,
          color: theme.colors.muted,
          marginTop: 24,
          opacity: subOpacity,
        }}
      >
        {subtitle}
      </p>
    </AbsoluteFill>
  );
};
