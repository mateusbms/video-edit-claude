import { useState } from "react";
import { streamSSE, fileUrl } from "../api";
import { ProgressBar } from "../components/ProgressBar";
import type { StepProps } from "../App";

export const RenderStep: React.FC<StepProps> = ({ slug, back }) => {
  const [prog, setProg] = useState<Record<string, { n: number; total: number }>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const render = async () => {
    setBusy(true); setErr(null); setDone(false); setProg({});
    try {
      await streamSSE(`/api/jobs/${slug}/render`, { method: "POST" }, {
        progress: (d) => {
          if (d.format && d.n != null && d.total != null) {
            setProg(prev => ({ ...prev, [d.format]: { n: d.n, total: d.total } }));
          }
        },
        done: () => setDone(true),
        error: (d) => setErr(d.detail ?? "erro no render"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">5. Renderizar</h2>
      <button onClick={render} disabled={busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy ? "Renderizando..." : "Renderizar 16:9 + 9:16"}
      </button>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="space-y-3">
        {prog["Main16x9"] && <ProgressBar label="16:9" n={prog["Main16x9"].n} total={prog["Main16x9"].total} />}
        {prog["Vertical9x16"] && <ProgressBar label="9:16" n={prog["Vertical9x16"].n} total={prog["Vertical9x16"].total} />}
      </div>
      {done && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-zinc-400 mb-1">16:9</p>
            <video controls src={fileUrl(slug, `${slug}-16x9.mp4`)} className="w-full rounded" />
            <a href={fileUrl(slug, `${slug}-16x9.mp4`)} download
               className="inline-block mt-2 px-3 py-1 bg-zinc-800 rounded text-sm">Baixar</a>
          </div>
          <div>
            <p className="text-sm text-zinc-400 mb-1">9:16</p>
            <video controls src={fileUrl(slug, `${slug}-9x16.mp4`)} className="w-full rounded" />
            <a href={fileUrl(slug, `${slug}-9x16.mp4`)} download
               className="inline-block mt-2 px-3 py-1 bg-zinc-800 rounded text-sm">Baixar</a>
          </div>
        </div>
      )}
      <div className="pt-4">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
      </div>
    </section>
  );
};
