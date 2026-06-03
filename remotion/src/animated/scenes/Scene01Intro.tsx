import React, { useContext } from "react";
import { AbsoluteFill, Audio, Img } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { FadeOut } from "../components/FadeOut";
import { ThemeContext } from "../theme/context";

type Props = {
  text: string;            // subtitle, e.g. "AI-native email infrastructure"
  productName: string;     // "Sendkit"
  logoSrc: string;
  durationInFrames: number;
  audioSrc: string;
};

export const Scene01Intro: React.FC<Props> = ({
  text, productName, logoSrc, durationInFrames, audioSrc,
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
          <SpringIn from={2}>
            <Img src={logoSrc} style={{ width: 100, height: 100, borderRadius: 22 }} />
          </SpringIn>
          <SpringIn from={8} slide={30}>
            <div style={{
              fontFamily: theme.fontHeadline, fontSize: 76,
              color: theme.foreground, lineHeight: 1.05,
            }}>
              Introducing {productName}
            </div>
          </SpringIn>
          <SpringIn from={18} slide={15}>
            <div style={{ fontSize: 28, color: theme.muted }}>{text}</div>
          </SpringIn>
        </div>
      </FadeOut>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
