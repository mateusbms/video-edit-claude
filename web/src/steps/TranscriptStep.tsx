import { useEffect, useState } from "react";
import { getTranscript, putTranscript, streamSSE } from "../api";
import type { CaptionLine } from "../types";
import type { StepProps } from "../App";

export const TranscriptStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [model, setModel] = useState("small");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [lines, setLines] = useState<CaptionLine[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getTranscript(slug).then(setLines).catch(() => {});
  }, [slug]);

  const transcribe = async () => {
    setBusy(true); setErr(null); setStage("solicitado");
    try {
      await streamSSE(`/api/jobs/${slug}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_size: model, language: "pt" }),
      }, {
        progress: (d) => setStage(d.stage ?? "processando"),
        done: async () => { setLines(await getTranscript(slug)); },
        error: (d) => setErr(d.detail ?? "erro na transcrição"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); setStage(""); }
  };

  const editWord = (li: number, wi: number, val: string) => {
    if (!lines) return;
    const copy = lines.map(l => ({ ...l, words: [...l.words] }));
    copy[li].words[wi] = { ...copy[li].words[wi], word: val };
    copy[li].text = copy[li].words.map(w => w.word).join(" ");
    setLines(copy);
  };

  const save = async () => {
    if (!lines) return;
    await putTranscript(slug, lines);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">3. Transcrição</h2>
      <div className="flex gap-2 items-end">
        <label className="block">
          <span className="text-sm text-zinc-400">Modelo</span>
          <select className="block bg-zinc-900 border border-zinc-800 rounded px-2 py-2"
            value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="tiny">tiny (rápido)</option>
            <option value="base">base</option>
            <option value="small">small (padrão)</option>
            <option value="medium">medium (melhor)</option>
          </select>
        </label>
        <button onClick={transcribe} disabled={busy}
          className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
          {busy ? `Transcrevendo... ${stage}` : "Transcrever"}
        </button>
      </div>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {lines && (
        <div className="space-y-3 max-h-[50vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded p-4">
          {lines.map((l, li) => (
            <div key={li} className="flex flex-wrap gap-1 items-baseline">
              <span className="text-xs text-zinc-500 font-mono mr-2">{l.start.toFixed(1)}s</span>
              {l.words.map((w, wi) => (
                <input
                  key={wi} value={w.word} onChange={(e) => editWord(li, wi, e.target.value)}
                  onBlur={save}
                  className="bg-transparent border-b border-zinc-700 focus:border-emerald-500 outline-none px-1"
                  style={{ width: `${Math.max(2, w.word.length)}ch` }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="pt-4 flex justify-between">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
        <button onClick={next} disabled={!lines} className="px-4 py-2 bg-zinc-800 rounded disabled:opacity-40">Próximo →</button>
      </div>
    </section>
  );
};
