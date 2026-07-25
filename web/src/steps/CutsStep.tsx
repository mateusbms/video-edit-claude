import { useRef, useState } from "react";
import { streamSSE, mediaUrl } from "../api";
import { Slider } from "../components/Slider";
import { ProgressBar } from "../components/ProgressBar";
import { formatSeconds, percentage } from "../util";
import type { CutResult, CutParams } from "../types";
import type { StepProps } from "../App";

export const CutsStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [params, setParams] = useState<CutParams>({
    silence_threshold_db: -30, padding: 0.1, min_silence: 0.5,
  });
  const [result, setResult] = useState<CutResult | null>(null);
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [removeList, setRemoveList] = useState<{ start: number; end: number }[]>([]);
  const [markStart, setMarkStart] = useState<number | null>(null);
  const [refineVersion, setRefineVersion] = useState(0);
  const [refining, setRefining] = useState(false);
  const [refineProg, setRefineProg] = useState<{ n: number; total: number } | null>(null);

  const curTime = () => videoRef.current?.currentTime ?? 0;
  const onMarkStart = () => setMarkStart(curTime());
  const onMarkEnd = () => {
    const end = curTime();
    if (markStart != null && end > markStart) {
      setRemoveList((l) => [...l, { start: markStart, end }].sort((a, b) => a.start - b.start));
      setMarkStart(null);
    }
  };
  const removeRange = (i: number) => setRemoveList((l) => l.filter((_, k) => k !== i));

  const applyRefine = async () => {
    if (removeList.length === 0) return;
    setRefining(true); setErr(null); setRefineProg(null);
    try {
      await streamSSE(`/api/jobs/${slug}/refine`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remove: removeList }),
      }, {
        progress: (d) => { if (d.n != null && d.total != null) setRefineProg({ n: d.n, total: d.total }); },
        done: (d) => {
          setResult((r) => (r && d.trimmed_duration != null ? { ...r, trimmed_duration: d.trimmed_duration } : r));
          setRemoveList([]);
          setRefineVersion((v) => v + 1);
        },
        error: (d) => setErr(d.detail ?? "erro ao aplicar cortes"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setRefining(false); setRefineProg(null); }
  };

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    v.play()?.catch(() => {});
  };

  const onCut = async () => {
    setBusy(true); setErr(null); setResult(null); setProg(null);
    try {
      await streamSSE(`/api/jobs/${slug}/cut`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }, {
        progress: (d) => { if (d.n != null && d.total != null) setProg({ n: d.n, total: d.total }); },
        done: (d) => setResult(d as CutResult),
        error: (d) => setErr(d.detail ?? "erro no corte"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const removed = result ? result.original_duration - result.trimmed_duration : 0;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">2. Cortar pausas</h2>
      <Slider label="Limite de silêncio (dB)" value={params.silence_threshold_db}
        min={-50} max={-10} step={1} format={(n) => `${n} dB`}
        onChange={(n) => setParams({ ...params, silence_threshold_db: n })} />
      <Slider label="Padding ao redor da fala (s)" value={params.padding}
        min={0} max={0.5} step={0.05} format={(n) => `${n.toFixed(2)} s`}
        onChange={(n) => setParams({ ...params, padding: n })} />
      <Slider label="Silêncio mínimo (s)" value={params.min_silence}
        min={0.2} max={2.0} step={0.1} format={(n) => `${n.toFixed(1)} s`}
        onChange={(n) => setParams({ ...params, min_silence: n })} />
      <button onClick={onCut} disabled={busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy ? "Cortando..." : "Detectar pausas"}
      </button>
      {busy && prog && <ProgressBar label="Corte" n={Math.round(prog.n)} total={Math.round(prog.total)} />}
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-4 text-sm space-y-2">
          <p>
            De <strong>{formatSeconds(result.original_duration)}</strong> para{" "}
            <strong>{formatSeconds(result.trimmed_duration)}</strong>{" "}
            <span className="text-zinc-400">
              ({formatSeconds(removed)} removidos · {percentage(removed, result.original_duration)}%)
            </span>
          </p>
          <p>{result.segments.length} trechos mantidos</p>
          <div className="h-3 bg-zinc-800 rounded overflow-hidden flex">
            {(() => {
              const total = result.original_duration;
              let cursor = 0;
              let trimmedCursor = 0;
              const parts: React.ReactElement[] = [];
              result.segments.forEach((s, i) => {
                if (s.start > cursor) {
                  parts.push(<div key={`g${i}`} style={{ width: `${((s.start - cursor) / total) * 100}%` }} className="bg-zinc-700" />);
                }
                const trimmedStart = trimmedCursor;
                parts.push(
                  <div key={`s${i}`} onClick={() => seek(trimmedStart)}
                    title={`Ir para ${formatSeconds(trimmedStart)}`}
                    style={{ width: `${((s.end - s.start) / total) * 100}%`, cursor: "pointer" }}
                    className="bg-emerald-500" />
                );
                cursor = s.end;
                trimmedCursor += s.end - s.start;
              });
              if (cursor < total) parts.push(<div key="end" style={{ width: `${((total - cursor) / total) * 100}%` }} className="bg-zinc-700" />);
              return parts;
            })()}
          </div>
          <video ref={videoRef} src={`${mediaUrl(slug, "trimmed.mp4")}${refineVersion ? `?v=${refineVersion}` : ""}`} controls
            className="w-full rounded border border-zinc-800 mt-2" />
          <div className="border-t border-zinc-800 pt-3 mt-3 space-y-2">
            <p className="font-medium">Cortes manuais (opcional)</p>
            <p className="text-zinc-400 text-xs">Dê play no vídeo, marque o início e o fim dos trechos a remover.</p>
            <div className="flex gap-2 items-center flex-wrap">
              <button onClick={onMarkStart} className="px-3 py-1 bg-zinc-800 rounded">Marcar início</button>
              <button onClick={onMarkEnd} disabled={markStart == null} className="px-3 py-1 bg-zinc-800 rounded disabled:opacity-40">Marcar fim</button>
              {markStart != null && <span className="text-xs text-zinc-400">início em {formatSeconds(markStart)}…</span>}
            </div>
            {removeList.length > 0 && (
              <>
                <ol className="space-y-1 text-sm">
                  {removeList.map((r, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-zinc-500">{i + 1}.</span>
                      <span className="flex-1">{formatSeconds(r.start)} – {formatSeconds(r.end)}</span>
                      <button aria-label={`remover trecho ${i + 1}`} onClick={() => removeRange(i)} className="text-red-400 px-2">×</button>
                    </li>
                  ))}
                </ol>
                <div className="h-2 bg-zinc-800 rounded overflow-hidden relative">
                  {removeList.map((r, i) => {
                    const dur = result.trimmed_duration || 1;
                    return <div key={i} className="absolute h-full bg-red-500"
                      style={{ left: `${(r.start / dur) * 100}%`, width: `${((r.end - r.start) / dur) * 100}%` }} />;
                  })}
                </div>
                <button onClick={applyRefine} disabled={refining}
                  className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
                  {refining ? "Aplicando..." : `Aplicar cortes (${removeList.length})`}
                </button>
                {refining && refineProg && <ProgressBar label="Aplicando cortes" n={Math.round(refineProg.n)} total={Math.round(refineProg.total)} />}
              </>
            )}
          </div>
        </div>
      )}
      <div className="pt-4 flex justify-between">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
        <button onClick={next} disabled={!result} className="px-4 py-2 bg-zinc-800 rounded disabled:opacity-40">Próximo →</button>
      </div>
    </section>
  );
};
