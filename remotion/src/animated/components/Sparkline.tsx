import React, { useContext } from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { ThemeContext } from "../theme/context";

export type SparklineProps = {
  points: number[];
  color: string;
  fromFrame: number;
  drawDuration: number; // frames to fully draw the line
  width?: number;
  height?: number;
};

/**
 * Animated SVG sparkline that draws itself progressively using
 * strokeDasharray/strokeDashoffset between `fromFrame` and
 * `fromFrame + drawDuration`.
 *
 * Points are normalised so the min value maps to the bottom of the
 * viewBox and the max maps to the top, with a small vertical padding.
 */
export const Sparkline: React.FC<SparklineProps> = ({
  points,
  color,
  fromFrame,
  drawDuration,
  width = 120,
  height = 36,
}) => {
  const frame = useCurrentFrame();
  // ThemeContext consumed for potential future theming; unused directly here
  useContext(ThemeContext);

  if (!points || points.length < 2) return null;

  const padX = 2;
  const padY = 4;
  const minVal = Math.min(...points);
  const maxVal = Math.max(...points);
  const range = maxVal - minVal || 1;

  // Build SVG path using cubic bezier for smooth line
  const coords = points.map((p, i) => {
    const x = padX + (i / (points.length - 1)) * (width - padX * 2);
    const y = padY + (1 - (p - minVal) / range) * (height - padY * 2);
    return { x, y };
  });

  // Construct a smooth path using line segments
  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cpX = (prev.x + curr.x) / 2;
    d += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  // Approximate total path length using accumulated segment distances
  let pathLength = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i].x - coords[i - 1].x;
    const dy = coords[i].y - coords[i - 1].y;
    pathLength += Math.sqrt(dx * dx + dy * dy);
  }

  const progress = interpolate(
    frame,
    [fromFrame, fromFrame + drawDuration],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const drawnLength = progress * pathLength;
  const dashOffset = pathLength - drawnLength;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", overflow: "visible" }}
    >
      {/* Background reference line (faint) */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeOpacity={0.15}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Animated drawing line */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeOpacity={0.9}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={pathLength}
        strokeDashoffset={dashOffset}
      />
    </svg>
  );
};
