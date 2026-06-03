import React, { useContext } from "react";
import { AbsoluteFill, Audio, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { FadeOut } from "../components/FadeOut";
import { MetricCard } from "../components/MetricCard";
import { ThemeContext } from "../theme/context";

type Props = {
  text: string;
  durationInFrames: number;
  audioSrc: string;
  productName?: string;
  logoSrc?: string;
};

export const Scene08Metrics: React.FC<Props> = ({
  durationInFrames,
  audioSrc,
}) => {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeStart = durationInFrames - 12;

  // Revenue count-up: $0 → $12,400 between frames 18–55
  const revenueRaw = interpolate(frame, [18, 55], [0, 12400], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const revenue = Math.round(revenueRaw);
  const revenueFormatted = `$${revenue.toLocaleString("en-US")}`;

  // Customers count-up: 0 → 847 between frames 18–55
  const customersRaw = interpolate(frame, [18, 55], [0, 847], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const customers = Math.round(customersRaw);

  // Card spring scale values for stagger at frames 10, 16, 22
  const card1Scale = 0.3 + 0.7 * spring({ frame: frame - 10, fps, config: { damping: 10, stiffness: 150, mass: 0.8 } });
  const card2Scale = 0.3 + 0.7 * spring({ frame: frame - 16, fps, config: { damping: 10, stiffness: 150, mass: 0.8 } });
  const card3Scale = 0.3 + 0.7 * spring({ frame: frame - 22, fps, config: { damping: 10, stiffness: 150, mass: 0.8 } });

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
            alignItems: "center",
            gap: 40,
          }}
        >
          {/* Headline */}
          <SpringIn from={2}>
            <div
              style={{
                fontFamily: theme.fontHeadline,
                fontSize: 44,
                color: theme.foreground,
                lineHeight: 1.1,
                textAlign: "center",
              }}
            >
              Turn signups into paying customers
            </div>
          </SpringIn>

          {/* Three metric cards */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 24,
              alignItems: "flex-start",
            }}
          >
            {/* Conversions card */}
            <div style={{ transform: `scale(${card1Scale})`, transformOrigin: "center" }}>
              <MetricCard
                dotColor="#16a34a"
                label="Conversions"
                value="+32%"
                sparkline={{
                  points: [1, 3, 2, 5, 4, 7, 6, 9],
                  color: "#16a34a",
                  fromFrame: 18,
                  drawDuration: 37,
                }}
              />
            </div>

            {/* Revenue card */}
            <div style={{ transform: `scale(${card2Scale})`, transformOrigin: "center" }}>
              <div
                style={{
                  width: 280,
                  background: theme.card,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                  padding: "16px 20px",
                  fontFamily: theme.fontBody,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#2563eb",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 14, color: theme.muted, fontWeight: 500 }}>
                    Revenue
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: "#2563eb",
                    lineHeight: 1.1,
                  }}
                >
                  {revenueFormatted}
                </div>
                <div style={{ fontSize: 14, color: theme.muted }}>from email</div>
              </div>
            </div>

            {/* Customers card */}
            <div style={{ transform: `scale(${card3Scale})`, transformOrigin: "center" }}>
              <MetricCard
                dotColor="#7c3aed"
                label="Customers"
                value={customers}
                avatars={5}
              />
            </div>
          </div>
        </div>
      </FadeOut>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
