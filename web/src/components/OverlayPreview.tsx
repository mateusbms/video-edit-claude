import { useRef } from "react";
import type { Overlay } from "../types";
import { overlayProgress } from "../overlayAnim";
import { clientToFraction, overlapsCaption } from "../overlayGeom";

type Zone = { top: number; bottom: number };

export const OverlayPreview: React.FC<{
  overlays: Overlay[];
  frame: number;
  scale: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  readOnlyOverlays?: Overlay[];
  captionZone?: Zone;
  playing?: boolean;
}> = ({ overlays, frame, scale, selectedId, onSelect, onMove, readOnlyOverlays = [], captionZone, playing = false }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);

  const inWindow = (o: Overlay) => frame >= o.fromFrame && frame < o.fromFrame + o.durationInFrames;

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

  const anchorTx = (ov: Overlay) =>
    ov.anchor === "left" ? "translate(0, -50%)"
    : ov.anchor === "right" ? "translate(-100%, -50%)"
    : "translate(-50%, -50%)";
  const textAlign = (ov: Overlay): "left" | "right" | "center" =>
    ov.anchor === "left" ? "left" : ov.anchor === "right" ? "right" : "center";

  const styleFor = (ov: Overlay, opacity: number, ty: number, sc: number, outline?: string): React.CSSProperties => ({
    left: `${ov.x * 100}%`,
    top: `${ov.y * 100}%`,
    transform: `${anchorTx(ov)} translateY(${ty * scale}px) scale(${sc})`,
    opacity,
    color: ov.color || "#ffffff",
    fontFamily: ov.fontFamily || undefined,
    fontWeight: 800,
    fontSize: ov.fontSize * scale,
    lineHeight: 1.15,
    textAlign: textAlign(ov),
    maxWidth: "80%",
    whiteSpace: "pre-wrap",
    textShadow: "0 4px 24px rgba(0,0,0,0.7)",
    outline,
    outlineOffset: 4,
  });

  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none"
      onPointerMove={onPointerMove} onPointerUp={endDrag}>
      {captionZone && (
        <div aria-hidden className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: `${captionZone.top * 100}%`,
            height: `${(captionZone.bottom - captionZone.top) * 100}%`,
            background: "rgba(234,179,8,0.12)",
            border: "1px dashed rgba(234,179,8,0.5)",
          }} />
      )}

      {readOnlyOverlays.filter(inWindow).map((ov) => {
        const p = overlayProgress(frame, ov);
        return (
          <div key={`ro-${ov.id}`} className="absolute pointer-events-none select-none"
            style={styleFor(ov, p.opacity * 0.85, p.translateY, p.scale)}>
            {ov.text}
          </div>
        );
      })}

      {overlays
        .filter((o) => (playing ? inWindow(o) : inWindow(o) || o.id === selectedId))
        .map((ov) => {
          const isSel = ov.id === selectedId;
          const freeze = isSel && !playing; // congela só pausado (para posicionar)
          const p = overlayProgress(frame, ov);
          const opacity = freeze ? 1 : p.opacity;
          const ty = freeze ? 0 : p.translateY;
          const sc = freeze ? 1 : p.scale;
          const colliding = !!captionZone && overlapsCaption(ov, captionZone);
          const outline = colliding ? "2px solid #eab308" : isSel ? "2px solid #22c55e" : undefined;
          return (
            <div key={ov.id} onPointerDown={(e) => onPointerDownBlock(e, ov.id)}
              className="absolute pointer-events-auto cursor-move select-none"
              style={styleFor(ov, opacity, ty, sc, outline)}
              title={colliding ? "pode encavalar a legenda" : undefined}>
              {ov.text}
              {colliding && <span aria-label="aviso de colisão" className="ml-1">⚠</span>}
            </div>
          );
        })}
    </div>
  );
};
