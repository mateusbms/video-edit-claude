import { useEffect, useState } from "react";
import { streamSSE, fileUrl, getJob } from "../api";
import { ProgressBar } from "../components/ProgressBar";
import type { Orientation } from "../frame";
import type { StepProps } from "../App";

const LABEL: Record<Orientation, string> = { "16x9": "16:9 (1920×1080)", "9x16": "9:16 (1080×1920)" };

export const RenderStep: React.FC<StepProps> = ({ slug, back }) => {
  const [orientation, setOrientation] = useState<Orientation>("16x9");
  // enquanto a orientação persistida não chega, o default "16x9" pode estar
  // errado — o botão fica desabilitado para não disparar um render com o
  // formato/nome de arquivo trocado.
  const [loadingOrientation, setLoadingOrientation] = useState(true);
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ detail: string; log?: string } | null>(null);

  useEffect(() => {
    setLoadingOrientation(true);
    getJob(slug).then((j: any) => { if (j?.orientation) setOrientation(j.orientation); })
      .catch(() => {})
      .finally(() => setLoadingOrientation(false));
  }, [slug]);

  const outName = `${slug}-${orientation}.mp4`;

  const render = async () => {
    setBusy(true); setErr(null); setDone(false); setProg(null);
    try {
      await streamSSE(`/api/jobs/${slug}/render`, { method: "POST" }, {
        progress: (d) => {
          if (d.n != null && d.total != null) setProg({ n: d.n, total: d.total });
        },
        done: () => setDone(true),
        error: (d) => setErr({ detail: d.detail ?? "erro no render", log: d.log }),
      });
    } catch (e: any) { setErr({ detail: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">5. Renderizar</h2>

      <p className="text-sm text-zinc-400">
        Formato do projeto: <strong className="text-zinc-200">{LABEL[orientation]}</strong>.
        Para trocar, volte ao passo 1.
      </p>

      <button onClick={render} disabled={busy || loadingOrientation}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy
          ? "Renderizando..."
          : loadingOrientation
          ? "Carregando..."
          : `Renderizar ${orientation === "9x16" ? "9:16" : "16:9"}`}
      </button>

      {err && (
        <div className="bg-red-950/40 border border-red-800 rounded p-3 text-sm space-y-2">
          <p className="text-red-400 font-medium">{err.detail}</p>
          {err.log && (
            <pre className="text-xs text-red-300/80 whitespace-pre-wrap overflow-x-auto max-h-48">{err.log}</pre>
          )}
        </div>
      )}

      {prog && <ProgressBar label={LABEL[orientation]} n={prog.n} total={prog.total} />}

      {done && (
        <div>
          <p className="text-sm text-zinc-400 mb-1">{LABEL[orientation]}</p>
          <video controls src={fileUrl(slug, outName)} className="w-full max-w-md rounded" />
          <a href={fileUrl(slug, outName)} download
             className="inline-block mt-2 px-3 py-1 bg-zinc-800 rounded text-sm">Baixar</a>
        </div>
      )}

      <div className="pt-4">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
      </div>
    </section>
  );
};
