import React, { useContext } from "react";
import { AbsoluteFill, Audio, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { FadeOut } from "../components/FadeOut";
import { ThemeContext } from "../theme/context";

type Props = {
  text: string;
  durationInFrames: number;
  audioSrc: string;
  productName?: string;
  logoSrc?: string;
};

const TEMPLATES = [
  { day: "Day 1", title: "Welcome aboard" },
  { day: "Day 2", title: "Getting started" },
  { day: "Day 3", title: "Tips for your first week" },
  { day: "Day 4", title: "What others are building" },
  { day: "Day 5", title: "A feature you'll love" },
  { day: "Day 6", title: "Your journey so far" },
  { day: "Day 7", title: "We'd love feedback" },
];

export const Scene06Templates: React.FC<Props> = ({
  durationInFrames,
  audioSrc,
}) => {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeStart = durationInFrames - 12;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.bg,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: theme.fontBody,
      }}
    >
      <FadeOut startFrame={fadeStart}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignItems: "center",
          }}
        >
          {TEMPLATES.map((tpl, i) => {
            const initialOffset = i % 2 === 0 ? -200 : 200;
            const t = spring({
              frame: frame - i * 8,
              fps,
              config: { damping: 12, stiffness: 150, mass: 0.8 },
            });
            const translateX = (1 - t) * initialOffset;

            return (
              <div
                key={i}
                style={{
                  width: 600,
                  backgroundColor: theme.card,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  padding: "16px 20px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  transform: `translateX(${translateX}px)`,
                  opacity: t,
                }}
              >
                {/* Checkmark circle */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    backgroundColor: theme.accentLight,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      color: theme.accent,
                      fontSize: 18,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                </div>

                {/* Text */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span
                    style={{
                      fontSize: 13,
                      color: theme.muted,
                      fontWeight: 500,
                      letterSpacing: "0.03em",
                      textTransform: "uppercase",
                    }}
                  >
                    {tpl.day}
                  </span>
                  <span
                    style={{
                      fontSize: 18,
                      color: theme.foreground,
                      fontWeight: 600,
                    }}
                  >
                    {tpl.title}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Green badge */}
          <SpringIn from={70}>
            <div
              style={{
                marginTop: 8,
                backgroundColor: theme.accentLight,
                color: theme.accent,
                borderRadius: 8,
                padding: "8px 20px",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              7 templates · 1 prompt
            </div>
          </SpringIn>
        </div>
      </FadeOut>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
