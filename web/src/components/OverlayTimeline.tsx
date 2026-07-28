import type { Overlay } from "../types";

export const OverlayTimeline: React.FC<{
  overlays: Overlay[];
  context?: Overlay[];
  totalFrames: number;
  currentFrame: number;
  selectedId: string | null;
  onSeekFrame: (frame: number) => void;
  onSelect: (id: string) => void;
  warnIds?: Set<string>;
}> = ({ overlays, context = [], totalFrames, currentFrame, selectedId, onSeekFrame, onSelect, warnIds }) => {
  const has = totalFrames > 0;
  const leftPct = (f: number) => (has ? `${Math.max(0, Math.min(100, (f / totalFrames) * 100))}%` : "0%");
  const widthPct = (f: number) => (has ? `${Math.max(0, Math.min(100, (f / totalFrames) * 100))}%` : "0%");

  const onRuler = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!has || rect.width <= 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    onSeekFrame(Math.round(Math.max(0, Math.min(1, x)) * totalFrames));
  };

  return (
    <div role="group" aria-label="linha do tempo dos textos" onClick={onRuler}
      className="relative h-16 bg-zinc-900 border border-zinc-800 rounded overflow-hidden cursor-pointer">
      {context.map((ov) => (
        <div key={`ctx-${ov.id}`} aria-hidden
          className="absolute top-1 h-3 rounded bg-zinc-600/50"
          style={{ left: leftPct(ov.fromFrame), width: widthPct(ov.durationInFrames) }} />
      ))}
      {overlays.map((ov) => (
        <button key={ov.id} aria-label={`marcador ${ov.text}`}
          onClick={(e) => { e.stopPropagation(); onSelect(ov.id); onSeekFrame(ov.fromFrame); }}
          className={`absolute bottom-1 h-8 rounded text-left px-1 text-xs truncate ${
            warnIds?.has(ov.id) ? "bg-amber-600/80 text-white"
            : ov.id === selectedId ? "bg-emerald-600 text-white" : "bg-emerald-800/70 text-emerald-100"}`}
          style={{ left: leftPct(ov.fromFrame), width: widthPct(ov.durationInFrames) }}>
          {ov.text}
        </button>
      ))}
      <div aria-hidden className="absolute top-0 bottom-0 w-px bg-white/80"
        style={{ left: leftPct(currentFrame) }} />
    </div>
  );
};
