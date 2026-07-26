import { useRef } from "react";
import type { Overlay } from "../types";
import { overlayProgress } from "../overlayAnim";
import { clientToFraction } from "../overlayGeom";

export const OverlayPreview: React.FC<{
  overlays: Overlay[];
  frame: number;
  scale: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}> = ({ overlays, frame, scale, selectedId, onSelect, onMove }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);

  const active = overlays.filter(
    (o) => frame >= o.fromFrame && frame < o.fromFrame + o.durationInFrames,
  );

  const onPointerDownBlock = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    onSelect(id);
    dragId.current = id;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragId.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const { x, y } = clientToFraction(e.clientX, e.clientY, rect);
    onMove(dragId.current, x, y);
  };
  const endDrag = () => { dragId.current = null; };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 pointer-events-none"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    >
      {active.map((ov) => {
        const { opacity, translateY, scale: sc } = overlayProgress(frame, ov);
        const anchorTx =
          ov.anchor === "left" ? "translate(0, -50%)"
          : ov.anchor === "right" ? "translate(-100%, -50%)"
          : "translate(-50%, -50%)";
        const selected = ov.id === selectedId;
        return (
          <div
            key={ov.id}
            onPointerDown={(e) => onPointerDownBlock(e, ov.id)}
            className="absolute pointer-events-auto cursor-move select-none"
            style={{
              left: `${ov.x * 100}%`,
              top: `${ov.y * 100}%`,
              transform: `${anchorTx} translateY(${translateY * scale}px) scale(${sc})`,
              opacity,
              color: ov.color || "#ffffff",
              fontFamily: ov.fontFamily || undefined,
              fontWeight: 800,
              fontSize: ov.fontSize * scale,
              lineHeight: 1.15,
              textAlign: ov.anchor === "left" ? "left" : ov.anchor === "right" ? "right" : "center",
              maxWidth: "80%",
              whiteSpace: "pre-wrap",
              textShadow: "0 4px 24px rgba(0,0,0,0.7)",
              outline: selected ? "2px solid #22c55e" : undefined,
              outlineOffset: 4,
            }}
          >
            {ov.text}
          </div>
        );
      })}
    </div>
  );
};
