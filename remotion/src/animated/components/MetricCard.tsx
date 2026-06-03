import React, { useContext } from "react";
import { ThemeContext } from "../theme/context";
import { Sparkline } from "./Sparkline";

export type MetricCardSparkline = {
  points: number[];
  color: string;
  fromFrame?: number;
  drawDuration?: number;
};

export type MetricCardProps = {
  dotColor: string;
  label: string;
  value: string | number;
  sparkline?: MetricCardSparkline;
  avatars?: number; // count of overlapping avatar circles
};

const AVATAR_COLORS = ["#2563eb", "#16a34a", "#7c3aed", "#ea580c", "#16a34a"];

/**
 * White metric card (280px wide) with a colored dot, label, big value,
 * optional sparkline, and optional overlapping avatar row.
 *
 * Matches Scene 8 "Metrics Payoff" spec from SENDKIT-PH-PROMPT.md.
 */
export const MetricCard: React.FC<MetricCardProps> = ({
  dotColor,
  label,
  value,
  sparkline,
  avatars,
}) => {
  const theme = useContext(ThemeContext);

  return (
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
      {/* Header: colored dot + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 14,
            color: theme.muted,
            fontWeight: 500,
          }}
        >
          {label}
        </span>
      </div>

      {/* Big value */}
      <div
        style={{
          fontSize: 36,
          fontWeight: 700,
          color: dotColor,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>

      {/* Optional sparkline */}
      {sparkline && (
        <Sparkline
          points={sparkline.points}
          color={sparkline.color}
          fromFrame={sparkline.fromFrame ?? 0}
          drawDuration={sparkline.drawDuration ?? 30}
          width={240}
          height={36}
        />
      )}

      {/* Optional avatar row */}
      {avatars && avatars > 0 && (
        <div style={{ display: "flex", alignItems: "center" }}>
          {Array.from({ length: avatars }).map((_, i) => (
            <div
              key={i}
              data-testid="avatar-circle"
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                border: "2px solid #ffffff",
                marginLeft: i === 0 ? 0 : -8,
                opacity: 0.8,
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
