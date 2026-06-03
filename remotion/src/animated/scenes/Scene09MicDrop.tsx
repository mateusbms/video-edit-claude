import React, { useContext } from "react";
import { AbsoluteFill, Audio } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { FadeOut } from "../components/FadeOut";
import { ThemeContext } from "../theme/context";

type Props = {
  text: string;            // subtitle, e.g. "from zero to a complete email stack"
  durationInFrames: number;
  audioSrc: string;
  productName?: string;
  logoSrc?: string;
};

export const Scene09MicDrop: React.FC<Props> = ({
  text, durationInFrames, audioSrc,
}) => {
  const theme = useContext(ThemeContext);
  const fadeStart = durationInFrames - 12;
  return (
    <AbsoluteFill style={{
      backgroundColor: theme.bg,
      alignItems: "center", justifyContent: "center",
      fontFamily: theme.fontBody,
    }}>
      <FadeOut startFrame={fadeStart}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <SpringIn from={4} slide={0}>
            <div style={{
              fontFamily: theme.fontHeadline, fontSize: 100,
              color: theme.foreground, fontWeight: 400, lineHeight: 1.05,
            }}>
              Under 5 minutes
            </div>
          </SpringIn>
          <SpringIn from={14} slide={15}>
            <div style={{
              fontSize: 24, color: theme.muted, fontWeight: 500,
            }}>
              {text}
            </div>
          </SpringIn>
        </div>
      </FadeOut>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
