import React, { useContext } from "react";
import {
  AbsoluteFill,
  Audio,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ToolCard } from "../components/ToolCard";
import { FadeOut } from "../components/FadeOut";
import { ThemeContext } from "../theme/context";

type Props = {
  text: string;
  durationInFrames: number;
  audioSrc: string;
  productName?: string;
  logoSrc?: string;
};

// Hex colors from design system
const BLUE = "#2563eb";
const PURPLE = "#7c3aed";
const ORANGE = "#ea580c";
const GREEN = "#16a34a";
const RED = "#dc2626";

// Card bodies

const EmailApiBody: React.FC = () => {
  const theme = useContext(ThemeContext);
  return (
    <div
      style={{
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
        fontSize: 11,
        color: BLUE,
        background: "rgba(37,99,235,0.07)",
        borderRadius: 6,
        padding: "6px 8px",
        letterSpacing: 0.2,
      }}
    >
      POST /v1/send
    </div>
  );
};

const TemplateBuilderBody: React.FC = () => {
  const theme = useContext(ThemeContext);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div
        style={{
          height: 10,
          width: "90%",
          background: theme.border,
          borderRadius: 3,
        }}
      />
      <div
        style={{
          height: 8,
          width: "70%",
          background: theme.border,
          borderRadius: 3,
        }}
      />
      <div
        style={{
          height: 8,
          width: "80%",
          background: theme.border,
          borderRadius: 3,
        }}
      />
      <div
        style={{
          height: 24,
          width: "60%",
          background: "rgba(124,58,237,0.10)",
          borderRadius: 4,
        }}
      />
    </div>
  );
};

const AutomationToolBody: React.FC = () => {
  return (
    <svg width="100" height="40" viewBox="0 0 100 40">
      {/* Start circle */}
      <circle cx="12" cy="20" r="8" fill="none" stroke={ORANGE} strokeWidth="2" />
      {/* Line */}
      <line x1="20" y1="20" x2="80" y2="20" stroke={ORANGE} strokeWidth="2" strokeDasharray="4 3" />
      {/* End circle */}
      <circle cx="88" cy="20" r="8" fill={ORANGE} stroke={ORANGE} strokeWidth="2" />
    </svg>
  );
};

const AnalyticsDashboardBody: React.FC = () => {
  const bars = [
    { height: 28, color: GREEN },
    { height: 40, color: GREEN },
    { height: 20, color: "rgba(22,163,74,0.4)" },
    { height: 34, color: GREEN },
  ];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 5,
        height: 44,
      }}
    >
      {bars.map((bar, i) => (
        <div
          key={i}
          style={{
            width: 18,
            height: bar.height,
            background: bar.color,
            borderRadius: "3px 3px 0 0",
          }}
        />
      ))}
    </div>
  );
};

const SmtpConfigBody: React.FC = () => {
  const theme = useContext(ThemeContext);
  const fieldStyle: React.CSSProperties = {
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: 4,
    padding: "3px 7px",
    fontSize: 11,
    color: theme.muted,
    marginBottom: 4,
    display: "flex",
    justifyContent: "space-between",
  };
  return (
    <div>
      <div style={fieldStyle}>
        <span style={{ fontWeight: 600, color: theme.foreground }}>Host</span>
        <span>smtp.example.com</span>
      </div>
      <div style={{ ...fieldStyle, marginBottom: 0 }}>
        <span style={{ fontWeight: 600, color: theme.foreground }}>Port</span>
        <span>587</span>
      </div>
    </div>
  );
};

const DnsSetupBody: React.FC = () => {
  const tags = [
    { label: "TXT", color: PURPLE },
    { label: "CNAME", color: BLUE },
    { label: "MX", color: RED },
  ];
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {tags.map((tag) => (
        <span
          key={tag.label}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: tag.color,
            background: `${tag.color}18`,
            borderRadius: 4,
            padding: "2px 7px",
          }}
        >
          {tag.label}
        </span>
      ))}
    </div>
  );
};

// Card definitions with center-relative x/y offsets
const CARD_DEFS = [
  {
    label: "Email API",
    dotColor: BLUE,
    x: -320,
    y: -180,
    rotation: -6,
    Body: EmailApiBody,
  },
  {
    label: "Template Builder",
    dotColor: PURPLE,
    x: 80,
    y: -200,
    rotation: 4,
    Body: TemplateBuilderBody,
  },
  {
    label: "Automation Tool",
    dotColor: ORANGE,
    x: -200,
    y: -20,
    rotation: -3,
    Body: AutomationToolBody,
  },
  {
    label: "Analytics Dashboard",
    dotColor: GREEN,
    x: 180,
    y: -40,
    rotation: 5,
    Body: AnalyticsDashboardBody,
  },
  {
    label: "SMTP Config",
    dotColor: RED,
    x: -280,
    y: 140,
    rotation: -8,
    Body: SmtpConfigBody,
  },
  {
    label: "DNS Setup",
    dotColor: PURPLE,
    x: 120,
    y: 160,
    rotation: 7,
    Body: DnsSetupBody,
  },
] as const;

// Connection line pairs (indices into CARD_DEFS)
const LINE_PAIRS = [
  [0, 2],
  [1, 3],
  [2, 4],
  [3, 5],
  [0, 4],
  [1, 5],
];

// Card center offset (half of 200px width, approximate vertical center of card ~60px)
const CARD_HALF_W = 100;
const CARD_HALF_H = 60;

export const Scene04Agitation: React.FC<Props> = ({
  text,
  durationInFrames,
  audioSrc,
}) => {
  const theme = useContext(ThemeContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeStart = durationInFrames - 12;

  // Connection lines opacity: fade in frames 50–100
  const linesOpacity = interpolate(frame, [50, 100], [0, 0.6], {
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
        {/* Header */}
        <div
          style={{
            position: "absolute",
            top: 80,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: theme.foreground,
            }}
          >
            Days of setup
          </div>
          <div
            style={{
              fontSize: 22,
              color: theme.muted,
            }}
          >
            {text}
          </div>
        </div>

        {/* Cards container — centered in the viewport */}
        <div
          style={{
            position: "relative",
            width: 0,
            height: 0,
          }}
        >
          {/* SVG connection lines */}
          <svg
            style={{
              position: "absolute",
              left: -500,
              top: -400,
              width: 1000,
              height: 800,
              opacity: linesOpacity,
              overflow: "visible",
            }}
            viewBox="-500 -400 1000 800"
          >
            {LINE_PAIRS.map(([aIdx, bIdx], i) => {
              const a = CARD_DEFS[aIdx];
              const b = CARD_DEFS[bIdx];
              const x1 = a.x + CARD_HALF_W;
              const y1 = a.y + CARD_HALF_H;
              const x2 = b.x + CARD_HALF_W;
              const y2 = b.y + CARD_HALF_H;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={theme.muted}
                  strokeWidth={1.5}
                  strokeDasharray="8"
                />
              );
            })}
          </svg>

          {/* Tool cards */}
          {CARD_DEFS.map((card, i) => {
            const t = spring({
              frame: frame - i * 12,
              fps,
              config: { damping: 10, stiffness: 150, mass: 0.8 },
            });
            // scale from 0.3 → 1: use spring 0→1 mapped to 0.3→1
            const scale = 0.3 + 0.7 * t;
            const opacity = Math.min(1, (frame - i * 12) / 6);

            return (
              <div
                key={card.label}
                style={{
                  transform: `scale(${scale})`,
                  opacity: Math.max(0, opacity),
                  transformOrigin: "center",
                }}
              >
                <ToolCard
                  x={card.x}
                  y={card.y}
                  rotation={card.rotation}
                  dotColor={card.dotColor}
                  label={card.label}
                  body={<card.Body />}
                />
              </div>
            );
          })}
        </div>
      </FadeOut>

      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
