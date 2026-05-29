import { useState } from "react";
import { streamSSE, fileUrl } from "../api";
import { ProgressBar } from "../components/ProgressBar";
import type { StepProps } from "../App";

type Fmt = "main16x9" | "vertical9x16";

export const RenderStep: React.FC<StepProps> = ({ slug, back }) => {
  const [prog, setProg] = useState<Record<string, { n: number; total: number }>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ detail: string; log?: string } | null>(null);
  const [formats, setFormats] = useState<Record<Fmt, boolean>>({
    main16x9: true,
    vertical9x16: true,
  });

  const toggle = (f: Fmt) => setFormats(p => ({ ...p, [f]: !p[f] }));
  const selected = (Object.keys(formats) as Fmt[]).filter(f => formats[f]);

  const render = async () => {
    setBusy(true); setErr(null); setDone(false); setProg({});
    try {
      await streamSSE(`/api/jobs/${slug}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formats: selected }),
      }, {
        progress: (d) => {
          if (d.format && d.n != null && d.total != null) {
            setProg(prev => ({ ...prev, [d.format]: { n: d.n, total: d.total } }));
          }
        },
        done: () => setDone(true),
        error: (d) => setErr({ detail: d.detail ?? "erro no render", log: d.log }),
      });
    } catch (e: any) { setErr({ detail: e.message }); }
    finally { setBusy(false); }
  };

  const buttonLabel = (() => {
    if (busy) return "Renderizando...";
    if (selected.length === 0) return "Escolha 1 formato";
    if (selected.length === 2) return "Renderizar 16:9 + 9:16";
    return selected[0] === "main16x9" ? "Renderizar 16:9" : "Renderizar 9:16";
  })();

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">5. Renderizar</h2>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={formats.main16x9}
            onChange={() => toggle("main16x9")}
            className="w-4 h-4 accent-emerald-600"
          />
          <span>16:9 (1920×1080)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={formats.vertical9x16}
            onChange={() => toggle("vertical9x16")}
            className="w-4 h-4 accent-emerald-600"
          />
          <span>9:16 (1080×1920)</span>
        </label>
      </div>

      <button onClick={render} disabled={busy || selected.length === 0}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {buttonLabel}
      </button>
      {err && (
        <div className="bg-red-950/40 border border-red-800 rounded p-3 text-sm space-y-2">
          <p className="text-red-400 font-medium">{err.detail}</p>
          {err.log && (
            <pre className="text-xs text-red-300/80 whitespace-pre-wrap overflow-x-auto max-h-48">{err.log}</pre>
          )}
        </div>
      )}
      <div className="space-y-3">
        {prog["Main16x9"] && <ProgressBar label="16:9" n={prog["Main16x9"].n} total={prog["Main16x9"].total} />}
        {prog["Vertical9x16"] && <ProgressBar label="9:16" n={prog["Vertical9x16"].n} total={prog["Vertical9x16"].total} />}
      </div>
      {done && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {formats.main16x9 && (
            <div>
              <p className="text-sm text-zinc-400 mb-1">16:9</p>
              <video controls src={fileUrl(slug, `${slug}-16x9.mp4`)} className="w-full rounded" />
              <a href={fileUrl(slug, `${slug}-16x9.mp4`)} download
                 className="inline-block mt-2 px-3 py-1 bg-zinc-800 rounded text-sm">Baixar</a>
            </div>
          )}
          {formats.vertical9x16 && (
            <div>
              <p className="text-sm text-zinc-400 mb-1">9:16</p>
              <video controls src={fileUrl(slug, `${slug}-9x16.mp4`)} className="w-full rounded" />
              <a href={fileUrl(slug, `${slug}-9x16.mp4`)} download
                 className="inline-block mt-2 px-3 py-1 bg-zinc-800 rounded text-sm">Baixar</a>
            </div>
          )}
        </div>
      )}
      <div className="pt-4">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
      </div>
    </section>
  );
};
