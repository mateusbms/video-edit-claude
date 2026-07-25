import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { resolveFont } from "../fonts";
import { findActive, activeWordIndex } from "../timeline-utils";
import type { TCaption, TCaptionStyle } from "../schema";

export const CaptionLayer: React.FC<{ captions: TCaption[]; style?: TCaptionStyle }> = ({
  captions, style,
}) => {
  const frame = useCurrentFrame();
  const active = findActive(captions, frame);
  if (!active) return null;
  const idx = activeWordIndex(active.words, frame);

  const fontSize = style?.fontSize ?? 48;
  const bottom = style?.bottom ?? 120;
  const color = style?.color || theme.colors.foreground;
  const highlight = style?.highlightColor || theme.colors.accent;
  const fontFamily = resolveFont(style?.fontFamily || theme.fonts.body);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: 0 }}>
      <div style={{
        marginBottom: bottom, maxWidth: "80%", textAlign: "center",
        fontFamily, fontWeight: 800, fontSize, lineHeight: 1.2, color,
        textShadow: "0 4px 16px rgba(0,0,0,0.6)",
      }}>
        {active.words.map((w, i) => (
          <span key={i} style={{
            color: i === idx ? highlight : color,
            transform: i === idx ? "scale(1.08)" : "scale(1)",
            display: "inline-block", marginRight: 12,
          }}>{w.word}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
