import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { resolveFont } from "../fonts";
import { overlayProgress } from "../overlay-utils";
import type { TOverlay } from "../schema";

export const OverlayLayer: React.FC<{ overlays: TOverlay[] }> = ({ overlays }) => {
  const frame = useCurrentFrame();
  const active = overlays.filter(
    (o) => frame >= o.fromFrame && frame < o.fromFrame + o.durationInFrames
  );
  if (active.length === 0) return null;

  return (
    <AbsoluteFill>
      {active.map((ov, i) => {
        const { opacity, translateY, scale } = overlayProgress(frame, ov);
        const color = ov.color || theme.colors.foreground;
        const fontFamily = resolveFont(ov.fontFamily || theme.fonts.heading);
        const anchorTx =
          ov.anchor === "left"
            ? "translate(0, -50%)"
            : ov.anchor === "right"
              ? "translate(-100%, -50%)"
              : "translate(-50%, -50%)";
        const textAlign: "left" | "right" | "center" =
          ov.anchor === "left" ? "left" : ov.anchor === "right" ? "right" : "center";
        return (
          <div
            key={ov.id || i}
            style={{
              position: "absolute",
              left: `${ov.x * 100}%`,
              top: `${ov.y * 100}%`,
              transform: `${anchorTx} translateY(${translateY}px) scale(${scale})`,
              opacity,
              color,
              fontFamily,
              fontWeight: 800,
              fontSize: ov.fontSize,
              lineHeight: 1.15,
              textAlign,
              maxWidth: `${ov.maxWidthPct ?? 80}%`,
              whiteSpace: "pre-wrap",
              textShadow: "0 4px 24px rgba(0,0,0,0.7)",
            }}
          >
            {ov.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
