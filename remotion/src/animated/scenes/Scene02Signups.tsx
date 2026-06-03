import React, { useContext } from "react";
import { AbsoluteFill, Audio, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
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
  { name: "Sarah K",  email: "sarah@acme.co",      color: "#16a34a", colorLight: "rgba(22,163,74,0.12)" },
  { name: "James M",  email: "james@startup.io",   color: "#2563eb", colorLight: "rgba(37,99,235,0.10)" },
  { name: "Alex R",   email: "alex@company.com",   color: "#7c3aed", colorLight: "rgba(124,58,237,0.10)" },
  { name: "Maria D",  email: "maria@design.co",    color: "#ea580c", colorLight: "rgba(234,88,12,0.10)" },
  { name: "Tom A",    email: "tom@agency.dev",      color: "#16a34a", colorLight: "rgba(22,163,74,0.12)" },
];

const SignupNotificationRow: React.FC<{ row: SignupRow; from: number }> = ({ row, from }) => {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const t = spring({
    frame: frame - from,
    fps,
    config: { damping: 10, stiffness: 150, mass: 0.8 },
  });

  const translateX = (1 - t) * 120;
  const opacity = Math.min(1, (frame - from) / 6);

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
        opacity: Math.max(0, opacity),
      }}
    >
      {/* Avatar circle */}
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
      {/* Name + email */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: theme.foreground, lineHeight: 1.3 }}>
          {row.name}
        </div>
        <div style={{ fontSize: 12, color: theme.muted }}>{row.email}</div>
      </div>
      {/* New badge */}
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
        new
      </div>
    </div>
  );
};

export const Scene02Signups: React.FC<Props> = ({
  text,
  durationInFrames,
  audioSrc,
}) => {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();
  const fadeStart = durationInFrames - 12;

  // Counting-up badge: 0 → 12 over frames 3–30
  const signupCount = Math.round(
    interpolate(frame, [3, 30], [0, 12], { extrapolateRight: "clamp", extrapolateLeft: "clamp" })
  );

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
        <SpringIn from={3}>
          <BrowserWindow url="yourapp.com/dashboard" width={700}>
            {/* Dashboard header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: theme.foreground,
                }}
              >
                Dashboard
              </div>
              {/* Counting-up badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: theme.accentLight,
                  color: theme.accent,
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
                    background: theme.accent,
                    display: "inline-block",
                  }}
                />
                {signupCount} new signups today
              </div>
            </div>

            {/* Signup notification rows */}
            <div>
              {SIGNUPS.map((row, i) => (
                <SignupNotificationRow key={row.email} row={row} from={8 + i * 10} />
              ))}
            </div>
          </BrowserWindow>
        </SpringIn>
      </FadeOut>

      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
