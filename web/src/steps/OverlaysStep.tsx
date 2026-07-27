import { useEffect, useRef, useState } from "react";
import { getOverlays, putOverlays, runRecipe, mediaUrl, getJob, getTranscript, getHook } from "../api";
import { OverlayPreview } from "../components/OverlayPreview";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { applyStartSec, applyEndSec } from "../overlayTime";
import { hookToOverlays } from "../overlayHook";
import { captionZone } from "../overlayGeom";
import type { Overlay, OverlayAnim, Hook, CaptionLine } from "../types";
import type { StepProps } from "../App";

const ANIMS: OverlayAnim[] = ["fade", "slide-up", "slide-down", "pop", "none"];
const FONTS = ["Inter", "Poppins", "Montserrat", "Roboto"];

function newOverlay(fromFrame: number, id: string): Overlay {
  return {
    id,
    type: "text", text: "Novo texto",
    fromFrame, durationInFrames: 60,
    x: 0.5, y: 0.25, anchor: "center", fontSize: 64,
    color: "", highlightColor: "", fontFamily: "",
    enter: "slide-up", exit: "fade",
    enterDurationInFrames: 12, exitDurationInFrames: 12,
  };
}

export const OverlaysStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fps, setFps] = useState(30);
  const [now, setNow] = useState(0);
  const [previewScale, setPreviewScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [capStyle, setCapStyle] = useState({ fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" });
  const [hook, setHook] = useState<Hook | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idCounter = useRef(0);

  useEffect(() => {
    getOverlays(slug).then(setOverlays).catch(() => {});
    getTranscript(slug).then(setLines).catch(() => {});
    getHook(slug).then(setHook).catch(() => {});
    getJob(slug).then((j: any) => {
      if (j?.probe?.fps) setFps(j.probe.fps);
      if (j?.captionStyle) setCapStyle(j.captionStyle);
    }).catch(() => {});
  }, [slug]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
      // escala px do render (canvas 1920) -> preview. Casa com o render 16x9;
    // no 9x16 (1080) o texto sai proporcionalmente maior que o previsto aqui.
    const update = () => setPreviewScale(v.clientWidth > 0 ? v.clientWidth / 1920 : 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(v);
    return () => ro.disconnect();
  }, []);

  const frame = Math.round(now * fps);
  const selected = overlays.find((o) => o.id === selectedId) || null;

  const patch = (id: string, p: Partial<Overlay>) =>
    setOverlays((list) => list.map((o) => (o.id === id ? { ...o, ...p } : o)));

  const addOverlay = () => {
    const id = `ov_${Date.now().toString(36)}_${idCounter.current++}`;
    const o = newOverlay(frame, id);
    setOverlays((l) => [...l, o]);
    setSelectedId(o.id);
  };
  const removeOverlay = (id: string) =>
    setOverlays((l) => l.filter((o) => o.id !== id));

  // devolve true se salvou; false em erro (para não avançar de passo em falha).
  const save = async (): Promise<boolean> => {
    setSaving(true); setErr(null);
    try {
      await putOverlays(slug, overlays);
      await runRecipe(slug);
      return true;
    } catch (e: any) { setErr(e.message); return false; }
    finally { setSaving(false); }
  };

  const startSec = selected ? selected.fromFrame / fps : 0;
  const endSec = selected ? (selected.fromFrame + selected.durationInFrames) / fps : 0;
  const setStartSec = (s: number) => selected &&
    patch(selected.id, applyStartSec(selected.fromFrame, selected.durationInFrames, s, fps));
  const setEndSec = (s: number) => selected &&
    patch(selected.id, applyEndSec(selected.fromFrame, s, fps));

  const zone = captionZone(capStyle);
  const hookOverlays = hook ? hookToOverlays(hook) : [];

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">5. Textos</h2>
      <p className="text-sm text-zinc-400">
        Adicione blocos de texto sobre o vídeo. Recortar o vídeo depois (passo Cortes) remove os textos manuais.
      </p>

      <div className="relative">
        <video
          ref={videoRef}
          src={mediaUrl(slug, "trimmed.mp4")}
          controls
          onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)}
          className="w-full rounded border border-zinc-800"
        />
        <CaptionOverlay lines={lines} currentTime={now} style={capStyle} scale={previewScale} />
        <OverlayPreview
          overlays={overlays}
          readOnlyOverlays={hookOverlays}
          captionZone={zone}
          frame={frame}
          scale={previewScale}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={(id, x, y) => patch(id, { x, y })}
        />
      </div>

      <div className="flex gap-2">
        <button onClick={addOverlay} className="px-3 py-2 bg-emerald-600 rounded font-medium">+ Texto</button>
        <button onClick={save} disabled={saving} className="px-3 py-2 bg-zinc-800 rounded disabled:opacity-40">
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
      {err && <p className="text-red-400 text-sm">{err}</p>}

      <ol className="space-y-1 text-sm">
        {overlays.map((o) => (
          <li key={o.id}
            className={`flex items-center gap-2 px-2 py-1 rounded ${o.id === selectedId ? "bg-zinc-800" : ""}`}>
            <button className="flex-1 text-left" onClick={() => setSelectedId(o.id)}>
              <input
                aria-label={`texto do overlay ${o.id}`}
                value={o.text}
                onChange={(e) => patch(o.id, { text: e.target.value })}
                className="bg-transparent w-full outline-none border-b border-transparent focus:border-emerald-500"
              />
            </button>
            <span className="text-xs text-zinc-500">{(o.fromFrame / fps).toFixed(1)}s</span>
            <button aria-label={`remover ${o.id}`} onClick={() => removeOverlay(o.id)} className="text-red-400 px-2">remover</button>
          </li>
        ))}
      </ol>

      {selected && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">Início (s)
            <input type="number" step={0.1} min={0} value={startSec.toFixed(1)}
              onChange={(e) => setStartSec(Number(e.target.value))}
              className="bg-zinc-800 rounded px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1">Fim (s)
            <input type="number" step={0.1} min={0} value={endSec.toFixed(1)}
              onChange={(e) => setEndSec(Number(e.target.value))}
              className="bg-zinc-800 rounded px-2 py-1" />
          </label>
          <button className="col-span-2 px-2 py-1 bg-zinc-800 rounded"
            onClick={() => setStartSec(now)}>Marcar início no tempo atual</button>
          <label className="flex flex-col gap-1">Tamanho
            <input aria-label="tamanho" type="range" min={24} max={160} value={selected.fontSize}
              onChange={(e) => patch(selected.id, { fontSize: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1">Cor
            <input aria-label="cor" type="color" value={selected.color || "#ffffff"}
              onChange={(e) => patch(selected.id, { color: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">Fonte
            <select aria-label="fonte" value={selected.fontFamily || "Inter"}
              onChange={(e) => patch(selected.id, { fontFamily: e.target.value })}
              className="bg-zinc-800 rounded px-2 py-1">
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Âncora
            <select aria-label="ancora" value={selected.anchor}
              onChange={(e) => patch(selected.id, { anchor: e.target.value as Overlay["anchor"] })}
              className="bg-zinc-800 rounded px-2 py-1">
              {["center", "left", "right"].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Entrada
            <select aria-label="entrada" value={selected.enter}
              onChange={(e) => patch(selected.id, { enter: e.target.value as OverlayAnim })}
              className="bg-zinc-800 rounded px-2 py-1">
              {ANIMS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Saída
            <select aria-label="saida" value={selected.exit}
              onChange={(e) => patch(selected.id, { exit: e.target.value as OverlayAnim })}
              className="bg-zinc-800 rounded px-2 py-1">
              {ANIMS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="pt-4 flex justify-between">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
        <button onClick={async () => { if (await save()) next(); }} className="px-4 py-2 bg-emerald-600 rounded font-medium">
          Próximo →
        </button>
      </div>
    </section>
  );
};
