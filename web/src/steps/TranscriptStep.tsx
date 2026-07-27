import { useEffect, useRef, useState } from "react";
import { getTranscript, putTranscript, streamSSE, mediaUrl, putCaptionStyle, putBrandKit, getJob } from "../api";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { ProgressBar } from "../components/ProgressBar";
import { BrandKitPicker } from "../components/BrandKitPicker";
import type { CaptionLine } from "../types";
import type { StepProps } from "../App";
import { FONTS } from "../fonts";

export const TranscriptStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [model, setModel] = useState("base");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [lines, setLines] = useState<CaptionLine[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  const [capStyle, setCapStyle] = useState({ fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" });
  const [brandSlug, setBrandSlug] = useState("");
  const [previewScale, setPreviewScale] = useState(1);

  useEffect(() => {
    getTranscript(slug).then(setLines).catch(() => {});
    getJob(slug).then((j: any) => {
      if (j?.captionStyle) setCapStyle(j.captionStyle);
      if (j?.brandKitSlug) setBrandSlug(j.brandKitSlug);
    }).catch(() => {});
  }, [slug]);

  // escala o preview: o estilo é em px do render (largura 1920); o vídeo do preview é menor.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => setPreviewScale(v.clientWidth > 0 ? v.clientWidth / 1920 : 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(v);
    return () => ro.disconnect();
  }, [lines]);

  const saveStyle = (nextStyle: typeof capStyle) => {
    setCapStyle(nextStyle);
    putCaptionStyle(slug, nextStyle).catch(() => {});
  };

  const transcribe = async () => {
    setBusy(true); setErr(null); setStage("solicitado"); setProg(null);
    try {
      await streamSSE(`/api/jobs/${slug}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_size: model, language: "pt" }),
      }, {
        progress: (d) => {
          if (d.n != null && d.total != null) setProg({ n: d.n, total: d.total });
          else setStage(d.stage ?? "processando");
        },
        done: async () => { setLines(await getTranscript(slug)); },
        error: (d) => setErr(d.detail ?? "erro na transcrição"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); setStage(""); setProg(null); }
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
            <option value="base">base (padrão)</option>
            <option value="small">small</option>
            <option value="medium">medium (melhor)</option>
          </select>
        </label>
        <button onClick={transcribe} disabled={busy}
          className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
          {busy ? `Transcrevendo... ${stage}` : "Transcrever"}
        </button>
      </div>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {busy && prog && (
        <ProgressBar label="Transcrição" n={Math.round(prog.n)} total={Math.round(prog.total)} />
      )}
      {lines && (
        <div className="relative w-fit mx-auto">
          <video
            ref={videoRef}
            src={mediaUrl(slug, "trimmed.mp4")}
            controls
            onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)}
            className="max-h-[60vh] max-w-full rounded border border-zinc-800"
          />
          <CaptionOverlay lines={lines} currentTime={now} style={capStyle} scale={previewScale} />
        </div>
      )}
      {lines && (
        <div className="flex flex-wrap gap-4 items-end bg-zinc-900 border border-zinc-800 rounded p-3 text-sm">
          <label className="flex flex-col gap-1">Tamanho da legenda
            <input aria-label="tamanho da legenda" type="range" min={24} max={120} value={capStyle.fontSize}
              onChange={(e) => saveStyle({ ...capStyle, fontSize: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1">Posição (do rodapé)
            <input aria-label="posição da legenda" type="range" min={0} max={600} value={capStyle.bottom}
              onChange={(e) => saveStyle({ ...capStyle, bottom: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1">Cor do texto
            <input aria-label="cor do texto" type="color" value={capStyle.color || "#ffffff"}
              onChange={(e) => saveStyle({ ...capStyle, color: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">Destaque
            <input aria-label="cor de destaque" type="color" value={capStyle.highlightColor || "#22c55e"}
              onChange={(e) => saveStyle({ ...capStyle, highlightColor: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">Fonte
            <select aria-label="fonte da legenda" value={capStyle.fontFamily || "Inter"}
              onChange={(e) => saveStyle({ ...capStyle, fontFamily: e.target.value })}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        </div>
      )}
      {lines && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm space-y-2">
          <h3 className="font-medium text-zinc-200">Marca</h3>
          <BrandKitPicker
            value={brandSlug}
            onChange={(s) => {
              setBrandSlug(s);
              putBrandKit(slug, s).catch(() => {});
            }}
          />
        </div>
      )}
      {lines && (
        <div className="max-h-[65vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded p-4 text-base leading-relaxed space-y-1">
          {lines.map((l, li) => (
            <div key={li} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-2 rounded hover:bg-zinc-800/50">
              <span className="text-xs text-zinc-500 font-mono w-12 shrink-0">{l.start.toFixed(1)}s</span>
              {l.words.map((w, wi) => (
                <input
                  key={wi} value={w.word} onChange={(e) => editWord(li, wi, e.target.value)}
                  onBlur={save}
                  className="bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-emerald-500 outline-none px-0.5 text-zinc-100"
                  style={{ width: `${Math.max(3, w.word.length + 1)}ch` }}
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
