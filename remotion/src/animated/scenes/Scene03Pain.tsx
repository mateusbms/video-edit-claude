import React, { useContext } from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BrowserWindow } from "../components/BrowserWindow";
import { FadeOut } from "../components/FadeOut";
import { SpringIn } from "../components/SpringIn";
import { ThemeContext } from "../theme/context";

type Props = {
  text: string;
  durationInFrames: number;
  audioSrc: string;
  productName?: string;
  logoSrc?: string;
};

type SignupRow = {
  name: string;
  email: string;
  color: string;
  colorLight: string;
};

const SIGNUPS: SignupRow[] = [
  { name: "Sarah K", email: "sarah@acme.co",     color: "#16a34a", colorLight: "rgba(22,163,74,0.12)" },
  { name: "James M", email: "james@startup.io",  color: "#2563eb", colorLight: "rgba(37,99,235,0.10)" },
  { name: "Alex R",  email: "alex@company.com",  color: "#7c3aed", colorLight: "rgba(124,58,237,0.10)" },
  { name: "Maria D", email: "maria@design.co",   color: "#ea580c", colorLight: "rgba(234,88,12,0.10)" },
  { name: "Tom A",   email: "tom@agency.dev",    color: "#16a34a", colorLight: "rgba(22,163,74,0.12)" },
];

// Phase 1: fading/sliding-right signup rows with desaturation
const DyingSignupRow: React.FC<{ row: SignupRow; index: number }> = ({ row, index }) => {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();

  // Each row starts fading at a staggered offset (row 0 starts at frame 10, row 4 at frame 50)
  const fadeStart = 10 + index * 10;
  const grayscale = interpolate(frame, [fadeStart, 95], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(frame, [fadeStart, 90], [1, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateX = interpolate(frame, [fadeStart, 95], [0, 40], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 10,
        background: theme.card,
        border: `1px solid ${theme.border}`,
        marginBottom: 8,
        transform: `translateX(${translateX}px)`,
        opacity,
        filter: `grayscale(${grayscale})`,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: row.colorLight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 700,
          color: row.color,
          flexShrink: 0,
        }}
      >
        {row.name.charAt(0)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.foreground, lineHeight: 1.3 }}>
          {row.name}
        </div>
        <div style={{ fontSize: 12, color: theme.muted }}>{row.email}</div>
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: row.color,
          background: row.colorLight,
          padding: "2px 8px",
          borderRadius: 999,
        }}
      >
        left
      </div>
    </div>
  );
};

export const Scene03Pain: React.FC<Props> = ({
  text,
  durationInFrames,
  audioSrc,
}) => {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();
  const fadeStart = durationInFrames - 12;

  const isPhase2 = frame >= 95;

  // Phase 1 fades out as phase 2 begins
  const phase1Opacity = interpolate(frame, [90, 110], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
        {/* Phase 1: Browser window with dying rows */}
        {!isPhase2 && (
          <div style={{ opacity: phase1Opacity }}>
            <SpringIn from={3}>
              <BrowserWindow url="yourapp.com/dashboard" width={900}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 20,
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 700, color: theme.foreground }}>
                    Dashboard
                  </div>
                  {/* Red "Users leaving" badge */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "rgba(220,38,38,0.10)",
                      color: "#dc2626",
                      fontSize: 14,
                      fontWeight: 600,
                      padding: "6px 14px",
                      borderRadius: 999,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#dc2626",
                        display: "inline-block",
                      }}
                    />
                    Users leaving
                  </div>
                </div>
                <div>
                  {SIGNUPS.map((row, i) => (
                    <DyingSignupRow key={row.email} row={row} index={i} />
                  ))}
                </div>
              </BrowserWindow>
            </SpringIn>
          </div>
        )}

        {/* Phase 2: Giant red 0 + message */}
        {isPhase2 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <SpringIn from={95}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    fontSize: 160,
                    fontWeight: 700,
                    color: "#dc2626",
                    fontFamily: theme.fontBody,
                    lineHeight: 1,
                  }}
                >
                  0
                </div>
                <div style={{ fontSize: 24, color: theme.muted }}>emails sent</div>
              </div>
            </SpringIn>

            <SpringIn from={125} slide={15}>
              <div
                style={{
                  fontSize: 38,
                  color: theme.muted,
                  fontFamily: theme.fontHeadline,
                  fontStyle: "italic",
                  textAlign: "center",
                  maxWidth: 700,
                }}
              >
                They signed up... and forgot you exist.
              </div>
            </SpringIn>
          </div>
        )}
      </FadeOut>

      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
