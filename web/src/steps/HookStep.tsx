import { useEffect, useState } from "react";
import { getHook, putHook, runRecipe, stillUrl } from "../api";
import type { Hook } from "../types";
import type { StepProps } from "../App";

export const HookStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [hook, setHook] = useState<Hook>({ title: "", subtitle: "", duration_frames: 90 });
  const [imgKey, setImgKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { getHook(slug).then(setHook).catch(() => {}); }, [slug]);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        await putHook(slug, hook);
        await runRecipe(slug);
        setImgKey(k => k + 1);
      } catch (e: any) { setErr(e.message); }
    }, 700);
    return () => clearTimeout(t);
  }, [hook, slug]);

  const goNext = async () => {
    setBusy(true);
    try { await putHook(slug, hook); await runRecipe(slug); next(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">4. Hook (abertura)</h2>
      <label className="block">
        <span className="text-sm text-zinc-400">Título</span>
        <input className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={hook.title} onChange={(e) => setHook({ ...hook, title: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-400">Subtítulo</span>
        <input className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={hook.subtitle} onChange={(e) => setHook({ ...hook, subtitle: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-400">Duração do card (frames)</span>
        <input type="number" className="mt-1 block w-32 bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={hook.duration_frames}
          onChange={(e) => setHook({ ...hook, duration_frames: Number(e.target.value) })} />
      </label>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div>
        <p className="text-sm text-zinc-400 mb-2">Prévia (atualiza ~1s após parar de digitar):</p>
        <img
          key={imgKey} src={`${stillUrl(slug, 30, "main16x9")}&_=${imgKey}`}
          alt="prévia"
          className="rounded border border-zinc-800 w-full max-w-2xl"
        />
      </div>
      <div className="pt-4 flex justify-between">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
        <button onClick={goNext} disabled={busy} className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
          {busy ? "Salvando..." : "Próximo →"}
        </button>
      </div>
    </section>
  );
};
