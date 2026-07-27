import { useEffect, useRef, useState } from "react";
import { getHook, putHook, runRecipe, getTranscript, getJob, mediaUrl } from "../api";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { OverlayPreview } from "../components/OverlayPreview";
import { hookToOverlays } from "../overlayHook";
import { captionZone } from "../overlayGeom";
import type { Hook, CaptionLine } from "../types";
import type { StepProps } from "../App";

const FONTS = ["Inter", "Poppins", "Montserrat", "Roboto"];
const DEF: Hook = {
  title: "", subtitle: "", duration_frames: 90,
  x: 0.5, y: 0.16, fontSize: 84, fontFamily: "", color: "", anchor: "center",
};

export const HookStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [hook, setHook] = useState<Hook>(DEF);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [capStyle, setCapStyle] = useState({ fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" });
  const [now, setNow] = useState(0);
  const [previewScale, setPreviewScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dirty = useRef(false); // só salva após edição do usuário (evita clobber/recipe no mount)

  useEffect(() => {
    dirty.current = false;
    getHook(slug).then((h: any) => setHook({ ...DEF, ...h })).catch(() => {});
    getTranscript(slug).then(setLines).catch(() => {});
    getJob(slug).then((j: any) => { if (j?.captionStyle) setCapStyle(j.captionStyle); }).catch(() => {});
  }, [slug]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => setPreviewScale(v.clientWidth > 0 ? v.clientWidth / 1920 : 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(v);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!dirty.current) return; // mount / carga do getHook não disparam save
    const t = setTimeout(async () => {
      try { await putHook(slug, hook); await runRecipe(slug); }
      catch (e: any) { setErr(e.message); }
    }, 700);
    return () => clearTimeout(t);
  }, [hook, slug]);

  const set = (p: Partial<Hook>) => { dirty.current = true; setHook((h) => ({ ...h, ...p })); };

  const overlays = hookToOverlays(hook);
  const titleOverlay = overlays.slice(0, 1);
  const subOverlay = overlays.slice(1);
  const zone = captionZone(capStyle);
  const previewFrame = Math.min(30, Math.max(0, hook.duration_frames - 1));

  const goNext = async () => {
    setBusy(true);
    try { await putHook(slug, hook); await runRecipe(slug); next(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">4. Hook (abertura)</h2>
      <p className="text-sm text-zinc-400">
        O texto aparece animado sobre o início do vídeo. Arraste para posicionar; a faixa amarela mostra onde a legenda fica.
      </p>

      <label className="block">
        <span className="text-sm text-zinc-400">Título</span>
        <input className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={hook.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-400">Subtítulo</span>
        <input className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={hook.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
      </label>

      <div className="relative">
        <video ref={videoRef} src={mediaUrl(slug, "trimmed.mp4")} controls
          onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)}
          className="w-full rounded border border-zinc-800" />
        <CaptionOverlay lines={lines} currentTime={now} style={capStyle} scale={previewScale} />
        <OverlayPreview
          overlays={titleOverlay}
          readOnlyOverlays={subOverlay}
          captionZone={zone}
          frame={previewFrame}
          scale={previewScale}
          selectedId="ov_hook"
          onSelect={() => {}}
          onMove={(_id, x, y) => set({ x, y })}
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">Duração (frames)
          <input type="number" className="bg-zinc-800 rounded px-2 py-1"
            value={hook.duration_frames} onChange={(e) => set({ duration_frames: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1">Tamanho
          <input aria-label="tamanho do hook" type="range" min={32} max={160}
            value={hook.fontSize ?? 84} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1">Cor
          <input aria-label="cor do hook" type="color" value={hook.color || "#ffffff"}
            onChange={(e) => set({ color: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">Fonte
          <select aria-label="fonte do hook" value={hook.fontFamily || "Inter"}
            onChange={(e) => set({ fontFamily: e.target.value })} className="bg-zinc-800 rounded px-2 py-1">
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Âncora
          <select aria-label="ancora do hook" value={hook.anchor ?? "center"}
            onChange={(e) => set({ anchor: e.target.value as Hook["anchor"] })} className="bg-zinc-800 rounded px-2 py-1">
            {["center", "left", "right"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="pt-4 flex justify-between">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
        <button onClick={goNext} disabled={busy}
          className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
          {busy ? "Salvando..." : "Próximo →"}
        </button>
      </div>
    </section>
  );
};
