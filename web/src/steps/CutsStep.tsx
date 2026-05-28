import { useState } from "react";
import { runCut } from "../api";
import { Slider } from "../components/Slider";
import { formatSeconds, percentage } from "../util";
import type { CutResult, CutParams } from "../types";
import type { StepProps } from "../App";

export const CutsStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [params, setParams] = useState<CutParams>({
    silence_threshold_db: -30, padding: 0.1, min_silence: 0.5,
  });
  const [result, setResult] = useState<CutResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onCut = async () => {
    setBusy(true); setErr(null);
    try { setResult(await runCut(slug, params)); }
    catch (e: any) { setErr(e.message); }
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
        {busy ? "Detectando..." : "Detectar pausas"}
      </button>
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
              const parts: React.ReactElement[] = [];
              result.segments.forEach((s, i) => {
                if (s.start > cursor) {
                  parts.push(<div key={`g${i}`} style={{ width: `${((s.start - cursor) / total) * 100}%` }} className="bg-zinc-700" />);
                }
                parts.push(<div key={`s${i}`} style={{ width: `${((s.end - s.start) / total) * 100}%` }} className="bg-emerald-500" />);
                cursor = s.end;
              });
              if (cursor < total) parts.push(<div key="end" style={{ width: `${((total - cursor) / total) * 100}%` }} className="bg-zinc-700" />);
              return parts;
            })()}
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
