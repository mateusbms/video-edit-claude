import React, { useContext } from "react";
import { AbsoluteFill, Audio, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
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

const CARDS = [
  { label: "New signup",      dot: "#2563eb", frame: 5  },
  { label: "Welcome email",   dot: "#16a34a", frame: 25 },
  { label: "Wait 2 days",     dot: "#ea580c", frame: 45 },
  { label: "Getting started", dot: "#16a34a", frame: 65 },
  { label: "Opened?",         dot: "#7c3aed", frame: 85 },
] as const;

const Skeleton: React.FC<{ width: string; theme: any }> = ({ width, theme }) => (
  <div style={{
    width,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.bg,
    marginTop: 6,
  }} />
);

const FlowCard: React.FC<{ label: string; dot: string; startFrame: number; theme: any }> = ({
  label, dot, startFrame, theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({ frame: frame - startFrame, fps, config: { damping: 10, stiffness: 150, mass: 0.8 } });
  const slideY = (1 - t) * 15;
  const scaleVal = 0.8 + 0.2 * t;
  const opacity = t;

  return (
    <div style={{
      transform: `translateY(${slideY}px) scale(${scaleVal})`,
      opacity,
      width: 300,
      padding: "14px 20px",
      borderRadius: 12,
      backgroundColor: theme.card,
      border: `1px solid ${theme.border}`,
      boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: dot, flexShrink: 0 }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: theme.foreground, fontFamily: theme.fontBody }}>
          {label}
        </span>
      </div>
      <Skeleton width="80%" theme={theme} />
      <Skeleton width="55%" theme={theme} />
    </div>
  );
};

const DashedConnector: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const visible = frame >= startFrame ? 1 : 0;
  const pos = frame % 16;
  return (
    <div style={{
      width: 3,
      height: 40,
      opacity: visible,
      backgroundImage: "linear-gradient(to bottom, #9ca3af 50%, transparent 50%)",
      backgroundSize: "3px 8px",
      backgroundPosition: `0 ${pos}px`,
      margin: "0 auto",
    }} />
  );
};

const BranchSVG: React.FC<{ visible: boolean; labelsVisible: boolean; theme: any }> = ({
  visible, labelsVisible, theme,
}) => {
  if (!visible) return null;
  return (
    <div style={{ position: "relative", width: 300, height: 80, margin: "0 auto" }}>
      <svg width="300" height="80" style={{ position: "absolute", top: 0, left: 0 }}>
        {/* left branch — yes/green */}
        <path
          d="M 150 0 Q 150 30 80 60"
          fill="none"
          stroke="#16a34a"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
        {/* right branch — no/red */}
        <path
          d="M 150 0 Q 150 30 220 60"
          fill="none"
          stroke="#dc2626"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      </svg>
      {labelsVisible && (
        <>
          <div style={{
            position: "absolute", bottom: 0, left: 10,
            fontSize: 12, fontWeight: 600, color: "#16a34a", fontFamily: theme.fontBody,
          }}>
            Yes → nurture
          </div>
          <div style={{
            position: "absolute", bottom: 0, right: 10,
            fontSize: 12, fontWeight: 600, color: "#dc2626", fontFamily: theme.fontBody,
          }}>
            No → re-engage
          </div>
        </>
      )}
    </div>
  );
};

export const Scene07Automation: React.FC<Props> = ({
  text, durationInFrames, audioSrc,
}) => {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeStart = durationInFrames - 12;

  // Badge spring
  const badgeT = spring({ frame: frame - 5, fps, config: { damping: 10, stiffness: 150, mass: 0.8 } });
  const badgeScale = interpolate(badgeT, [0, 1], [0.5, 1]);

  const branchVisible = frame >= 100;
  const labelsVisible = frame >= 115;

  return (
    <AbsoluteFill style={{
      backgroundColor: theme.bg,
      alignItems: "center",
      justifyContent: "center",
      fontFamily: theme.fontBody,
    }}>
      <FadeOut startFrame={fadeStart}>
        {/* Badge top-right */}
        <div style={{
          position: "absolute",
          top: 40,
          right: 60,
          transform: `scale(${badgeScale})`,
          transformOrigin: "top right",
          display: "flex",
          alignItems: "center",
          gap: 10,
          backgroundColor: theme.accentLight,
          padding: "14px 32px",
          borderRadius: 24,
          boxShadow: "0 4px 16px rgba(22,163,74,0.2)",
        }}>
          <div style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: theme.accent,
            boxShadow: `0 0 8px 3px ${theme.accentGlow}`,
          }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: theme.accent }}>
            Automation live
          </span>
        </div>

        {/* Flow */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}>
          {CARDS.map((card, i) => (
            <React.Fragment key={card.label}>
              <FlowCard
                label={card.label}
                dot={card.dot}
                startFrame={card.frame}
                theme={theme}
              />
              {i < CARDS.length - 1 && (
                <DashedConnector startFrame={card.frame + 10} />
              )}
            </React.Fragment>
          ))}
          {/* After last card: dashed connector then branch */}
          <DashedConnector startFrame={CARDS[CARDS.length - 1].frame + 10} />
          <BranchSVG visible={branchVisible} labelsVisible={labelsVisible} theme={theme} />
        </div>
      </FadeOut>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
