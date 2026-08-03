import { useEffect, useRef } from "react";
import { mediaUrl } from "../api";

type Props = {
  slug: string;
  version: number;      // ?v= do trimmed, para não reusar cache antigo
  fps: number;
  start: number;        // início do trecho a remover
  end: number;          // fim do trecho a remover
  limpoInicio: boolean; // false = não achou pausa limpa deste lado
  limpoFim: boolean;
  onChange: (start: number, end: number) => void;
  onAplicar: () => void;
  onCancelar: () => void;
};

// Busca um <video> no tempo exato (frame estático). requestVideoFrameCallback,
// quando existe, garante que o frame foi pintado antes de considerar pronto;
// em navegadores sem rVFC o seek simples já basta para 1080p/H.264.
function useFrameAt(time: number): React.RefObject<HTMLVideoElement | null> {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const seek = () => { try { v.currentTime = Math.max(0, time); } catch { /* metadata ainda não */ } };
    if (v.readyState >= 1) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
  }, [time]);
  return ref;
}

export const EmendaPreview: React.FC<Props> = ({
  slug, version, fps, start, end, limpoInicio, limpoFim, onChange, onAplicar, onCancelar,
}) => {
  const passo = 1 / fps;
  // último frame que FICA antes do corte, e primeiro que FICA depois
  const tAntes = Math.max(0, start - passo);
  const tDepois = end;
  const refAntes = useFrameAt(tAntes);
  const refDepois = useFrameAt(tDepois);
  const src = `${mediaUrl(slug, "trimmed.mp4")}?v=${version}`;

  const nudge = (qualBorda: "start" | "end", frames: number) => {
    const d = frames * passo;
    if (qualBorda === "start") onChange(Number((start + d).toFixed(3)), end);
    else onChange(start, Number((end + d).toFixed(3)));
  };

  // teclas , / . ajustam o FIM do trecho (a borda mais comum de acertar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ",") nudge("end", -1);
      else if (e.key === ".") nudge("end", +1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div role="group" aria-label="preview da emenda"
         className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm space-y-3">
      <p className="text-amber-200">
        Confira a emenda: o corte remove de <strong>{start.toFixed(2)}s</strong> a{" "}
        <strong>{end.toFixed(2)}s</strong>. Use ◀/▶ (ou as teclas <kbd>,</kbd>/<kbd>.</kbd>)
        para ajustar frame a frame.
      </p>
      {(!limpoInicio || !limpoFim) && (
        <p className="text-amber-300">
          Não achei uma pausa limpa de um dos lados — <strong>ajuste no frame</strong> se a emenda ficou torta.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <video ref={refAntes} src={src} muted preload="auto"
                 className="w-full rounded border border-zinc-800 bg-black" />
          <div className="flex items-center gap-1">
            <button aria-label="recuar início" onClick={() => nudge("start", -1)} className="px-2 bg-zinc-800 rounded">◀</button>
            <span className="text-xs text-zinc-400 flex-1 text-center">antes: {tAntes.toFixed(2)}s</span>
            <button aria-label="avançar início" onClick={() => nudge("start", +1)} className="px-2 bg-zinc-800 rounded">▶</button>
          </div>
        </div>
        <div className="space-y-1">
          <video ref={refDepois} src={src} muted preload="auto"
                 className="w-full rounded border border-zinc-800 bg-black" />
          <div className="flex items-center gap-1">
            <button aria-label="recuar fim" onClick={() => nudge("end", -1)} className="px-2 bg-zinc-800 rounded">◀</button>
            <span className="text-xs text-zinc-400 flex-1 text-center">depois: {tDepois.toFixed(2)}s</span>
            <button aria-label="avançar fim" onClick={() => nudge("end", +1)} className="px-2 bg-zinc-800 rounded">▶</button>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onAplicar} className="px-3 py-1 bg-emerald-600 rounded font-medium">Aplicar corte</button>
        <button onClick={onCancelar} className="px-3 py-1 bg-zinc-800 rounded">Cancelar</button>
      </div>
    </div>
  );
};
