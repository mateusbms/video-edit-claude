import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { findActive, activeWordIndex } from "../timeline-utils";
import type { TCaption } from "../schema";

export const CaptionLayer: React.FC<{ captions: TCaption[]; fontSize: number; bottom: number }> = ({
  captions,
  fontSize,
  bottom,
}) => {
  const frame = useCurrentFrame();
  const active = findActive(captions, frame);
  if (!active) return null;
  const idx = activeWordIndex(active.words, frame);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: 0 }}>
      <div
        style={{
          marginBottom: bottom,
          maxWidth: "80%",
          textAlign: "center",
          fontFamily: theme.fonts.body,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.2,
          color: theme.colors.foreground,
          textShadow: "0 4px 16px rgba(0,0,0,0.6)",
        }}
      >
        {active.words.map((w, i) => (
          <span
            key={i}
            style={{
              color: i === idx ? theme.colors.accent : theme.colors.foreground,
              transform: i === idx ? "scale(1.08)" : "scale(1)",
              display: "inline-block",
              marginRight: 12,
              transition: "none",
            }}
          >
            {w.word}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
