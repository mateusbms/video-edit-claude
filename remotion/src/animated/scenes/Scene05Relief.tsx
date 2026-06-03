import React, { useContext } from "react";
import { AbsoluteFill, Audio, Img, useCurrentFrame, interpolate } from "remotion";
import { FadeOut } from "../components/FadeOut";
import { ThemeContext } from "../theme/context";

type Props = {
  text: string;
  durationInFrames: number;
  audioSrc: string;
  productName: string;
  logoSrc: string;
};

const TYPEWRITER_TEXT = "Create a 7-day onboarding email sequence for my SaaS";

export const Scene05Relief: React.FC<Props> = ({
  durationInFrames, audioSrc, productName, logoSrc,
}) => {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();
  const fadeStart = durationInFrames - 12;

  // Typewriter: chars revealed from frame 10 to 50
  const charCount = Math.floor(
    interpolate(frame, [10, 50], [0, TYPEWRITER_TEXT.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  const visibleText = TYPEWRITER_TEXT.slice(0, charCount);
  const showCursor = frame >= 10 && frame < 52;

  // Thinking dots after frame 52
  const showDots = frame >= 52;

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
        {/* Large card */}
        <div
          style={{
            width: 760,
            backgroundColor: theme.card,
            border: `1px solid ${theme.border}`,
            borderRadius: 14,
            boxShadow: "0 25px 60px rgba(0,0,0,0.08), 0 8px 20px rgba(0,0,0,0.04)",
            padding: "32px 36px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* Header: logo + product name + MCP badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Img
              src={logoSrc}
              style={{ width: 36, height: 36, borderRadius: 8 }}
            />
            <span
              style={{
                fontFamily: theme.fontHeadline,
                fontSize: 22,
                color: theme.foreground,
                fontWeight: 600,
              }}
            >
              {productName}
            </span>
            {/* Green MCP badge */}
            <span
              style={{
                backgroundColor: theme.accentLight,
                color: theme.accent,
                borderRadius: 6,
                padding: "3px 10px",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              MCP
            </span>
          </div>

          {/* Chat input area */}
          <div
            style={{
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: "16px 20px",
              minHeight: 64,
              display: "flex",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 18, color: theme.foreground }}>
              {visibleText}
              {showCursor && (
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: "1.1em",
                    backgroundColor: theme.accent,
                    marginLeft: 2,
                    verticalAlign: "text-bottom",
                  }}
                />
              )}
              {/* Thinking dots */}
              {showDots && (
                <span style={{ marginLeft: 8, display: "inline-flex", gap: 6, alignItems: "center" }}>
                  {[0, 1, 2].map((i) => {
                    const isActive = (Math.floor(frame / 10) + i) % 3 === 0;
                    return (
                      <span
                        key={i}
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: isActive ? theme.accent : theme.muted,
                          opacity: isActive ? 1 : 0.35,
                          transition: "background-color 0.1s",
                        }}
                      />
                    );
                  })}
                </span>
              )}
            </span>
          </div>

          {/* Prompt label */}
          <div style={{ fontSize: 14, color: theme.muted }}>
            Ask {productName} anything about your email workflow...
          </div>
        </div>
      </FadeOut>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
