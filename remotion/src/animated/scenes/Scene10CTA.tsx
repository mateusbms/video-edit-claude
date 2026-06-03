import React, { useContext } from "react";
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { ThemeContext } from "../theme/context";

type Props = {
  text: string;            // URL, e.g. "sendkit.dev"
  productName: string;     // "Sendkit"
  logoSrc: string;
  durationInFrames: number;
  audioSrc: string;
  ctaUrl?: string;
};

export const Scene10CTA: React.FC<Props> = ({
  text, productName, logoSrc, durationInFrames, audioSrc, ctaUrl,
}) => {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();

  // Underline width animation: grows from 0% to 100% between frames 16–36
  const underlineWidth = interpolate(frame, [16, 36], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{
      backgroundColor: theme.bg,
      alignItems: "center",
      justifyContent: "center",
      fontFamily: theme.fontBody,
    }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <SpringIn from={2}>
          <Img src={logoSrc} style={{ width: 80, height: 80, borderRadius: 18 }} />
        </SpringIn>
        <SpringIn from={8} slide={15}>
          <div style={{ fontFamily: theme.fontHeadline, fontSize: 64, color: theme.foreground }}>
            try free at{" "}
            <span style={{ position: "relative", display: "inline-block" }}>
              {text}
              <div
                style={{
                  position: "absolute",
                  bottom: -8,
                  left: 0,
                  height: 3,
                  backgroundColor: theme.accent,
                  width: `${underlineWidth}%`,
                }}
              />
            </span>
          </div>
        </SpringIn>
      </div>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
