import React, { useContext } from "react";
import { ThemeContext } from "../theme/context";

export type ToolCardProps = {
  x: number;
  y: number;
  rotation: number;
  dotColor: string;
  label: string;
  body: React.ReactNode;
};

/**
 * Floating tool card from Scene 4 "Agitation — Complexity".
 *
 * Positioned absolutely with `left: x`, `top: y`, `rotate(<rotation>deg)`.
 * Width 200px, padding 16px 20px, rounded 12px, white bg,
 * shadow `0 4px 20px rgba(0,0,0,0.06)`.
 * Header: 8px colored dot + 15px/weight-600 label.
 * Body: arbitrary React content.
 */
export const ToolCard: React.FC<ToolCardProps> = ({
  x,
  y,
  rotation,
  dotColor,
  label,
  body,
}) => {
  const theme = useContext(ThemeContext);

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `rotate(${rotation}deg)`,
        width: 200,
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        padding: "16px 20px",
        fontFamily: theme.fontBody,
        display: "flex",
        flexDirection: "column",
        gap: 10,
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
            fontSize: 15,
            fontWeight: 600,
            color: theme.foreground,
            lineHeight: 1.2,
          }}
        >
          {label}
        </span>
      </div>

      {/* Body content */}
      <div style={{ color: theme.muted, fontSize: 13 }}>{body}</div>
    </div>
  );
};
