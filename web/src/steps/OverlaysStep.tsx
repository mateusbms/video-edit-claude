import { useEffect, useRef, useState } from "react";
import {
  getOverlays, putOverlays, runRecipe, mediaUrl, getJob, getTranscript, getHook,
  getSuggestions, putSuggestions, getSuggestDefaults, putSuggestDefaults,
} from "../api";
import { OverlayPreview } from "../components/OverlayPreview";
import { OverlayTimeline } from "../components/OverlayTimeline";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { applyStartSec, applyEndSec } from "../overlayTime";
import { hookToOverlays } from "../overlayHook";
import { captionRefHeight, captionZone, overlapsInTime } from "../overlayGeom";
import { suggestionToOverlay } from "../suggestions";
import type { Suggestion, SuggestDefaults } from "../suggestions";
import type { Overlay, OverlayAnim, Hook, CaptionLine } from "../types";
import type { StepProps } from "../App";
import { FONTS } from "../fonts";

const ANIMS: OverlayAnim[] = ["fade", "slide-up", "slide-down", "pop", "none"];

function newOverlay(fromFrame: number, id: string, defs: SuggestDefaults): Overlay {
  return {
    id,
    type: "text", text: "Novo texto",
    fromFrame, durationInFrames: defs.durationInFrames,
    x: 0.5, y: 0.25, anchor: "center", fontSize: 64,
    color: "", highlightColor: "", fontFamily: "",
    maxWidthPct: defs.maxWidthPct,
    enter: defs.enter, exit: defs.exit,
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
  const [playing, setPlaying] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [refHeight, setRefHeight] = useState(1080);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const idCounter = useRef(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [defs, setDefs] = useState<SuggestDefaults>({
    x: 0.5, y: 0.12, anchor: "center", fontSize: 64, fontFamily: "", color: "",
    enter: "slide-up", exit: "fade", durationInFrames: 75, maxWidthPct: 80,
  });
  const defsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getOverlays(slug).then(setOverlays).catch(() => {});
    getTranscript(slug).then(setLines).catch(() => {});
    getHook(slug).then(setHook).catch(() => {});
    getJob(slug).then((j: any) => {
      if (j?.probe?.fps) setFps(j.probe.fps);
      if (j?.probe?.duration) setDurationSec(j.probe.duration);
      if (j?.captionStyle) setCapStyle(j.captionStyle);
      setRefHeight(captionRefHeight(j?.probe));
    }).catch(() => {});
    getSuggestions(slug).then(setSuggestions).catch(() => {});
    getSuggestDefaults(slug).then(setDefs).catch(() => {});
  }, [slug]);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);
  useEffect(() => () => { if (defsTimer.current) clearTimeout(defsTimer.current); }, []);

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

  const overlappingIds = (() => {
    const s = new Set<string>();
    for (let i = 0; i < overlays.length; i++)
      for (let j = i + 1; j < overlays.length; j++)
        if (overlapsInTime(overlays[i], overlays[j])) { s.add(overlays[i].id); s.add(overlays[j].id); }
    return s;
  })();

  const patch = (id: string, p: Partial<Overlay>) =>
    setOverlays((list) => list.map((o) => (o.id === id ? { ...o, ...p } : o)));

  const addOverlay = () => {
    const id = `ov_${Date.now().toString(36)}_${idCounter.current++}`;
    const o = newOverlay(frame, id, defs);
    setOverlays((l) => [...l, o]);
    setSelectedId(o.id);
  };
  const removeOverlay = (id: string) =>
    setOverlays((l) => l.filter((o) => o.id !== id));

  const patchDefs = (p: Partial<SuggestDefaults>) => {
    const next = { ...defs, ...p };
    setDefs(next);
    if (defsTimer.current) clearTimeout(defsTimer.current);
    defsTimer.current = setTimeout(() => { putSuggestDefaults(slug, next).catch(() => {}); }, 500);
  };

  const applySuggestion = async (s: Suggestion) => {
    const id = `ov_${Date.now().toString(36)}_${idCounter.current++}`;
    const ov = suggestionToOverlay(s, defs, id);
    const nextOverlays = [...overlays, ov];
    const nextSug = suggestions.filter((x) => x.id !== s.id);
    setOverlays(nextOverlays); setSelectedId(id); setSuggestions(nextSug);
    setErr(null);
    try {
      await putOverlays(slug, nextOverlays);
      await putSuggestions(slug, nextSug);
      await runRecipe(slug);
    } catch (e: any) { setErr(e.message); }
  };

  const skipSuggestion = async (s: Suggestion) => {
    const nextSug = suggestions.filter((x) => x.id !== s.id);
    setSuggestions(nextSug);
    try { await putSuggestions(slug, nextSug); } catch (e: any) { setErr(e.message); }
  };

  const reloadSuggestions = () => { getSuggestions(slug).then(setSuggestions).catch(() => {}); };

  // devolve true se salvou; false em erro (para não avançar de passo em falha).
  const save = async (): Promise<boolean> => {
    setSaving(true); setErr(null);
    try {
      await putOverlays(slug, overlays);
      await runRecipe(slug);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
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

  const zone = captionZone(capStyle, refHeight);
  const hookOverlays = hook ? hookToOverlays(hook) : [];

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">5. Textos</h2>
      <p className="text-sm text-zinc-400">
        Adicione blocos de texto sobre o vídeo. Recortar o vídeo depois (passo Cortes) remove os textos manuais.
        Arraste para mover; use Largura para a quebra de linha.
      </p>

      <div className="relative w-fit mx-auto">
        <video
          ref={videoRef}
          src={mediaUrl(slug, "trimmed.mp4")}
          controls
          onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(e) => setDurationSec((e.target as HTMLVideoElement).duration || durationSec)}
          className="max-h-[60vh] max-w-full rounded border border-zinc-800"
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
          playing={playing}
          timeOverlapIds={overlappingIds}
        />
      </div>

      <OverlayTimeline
        overlays={overlays}
        context={hookOverlays}
        totalFrames={Math.round(durationSec * fps)}
        currentFrame={frame}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onSeekFrame={(f) => { const v = videoRef.current; if (v) v.currentTime = f / fps; }}
        warnIds={overlappingIds}
      />

      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm grid grid-cols-4 gap-3">
        <label className="flex flex-col gap-1">Posição
          <select aria-label="posição padrão" value={defs.y <= 0.2 ? "topo" : defs.y >= 0.7 ? "baixo" : "centro"}
            onChange={(e) => patchDefs({ y: e.target.value === "topo" ? 0.12 : e.target.value === "baixo" ? 0.8 : 0.5 })}
            className="bg-zinc-800 rounded px-2 py-1">
            <option value="topo">Topo</option>
            <option value="centro">Centro</option>
            <option value="baixo">Baixo</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">Fonte
          <select aria-label="fonte padrão" value={defs.fontFamily || "Inter"}
            onChange={(e) => patchDefs({ fontFamily: e.target.value })} className="bg-zinc-800 rounded px-2 py-1">
            {FONTS.map((ff) => <option key={ff} value={ff}>{ff}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Cor
          <input aria-label="cor padrão" type="color" value={defs.color || "#ffffff"}
            onChange={(e) => patchDefs({ color: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">Tamanho
          <input aria-label="tamanho padrão" type="range" min={24} max={160} value={defs.fontSize}
            onChange={(e) => patchDefs({ fontSize: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1">Entrada
          <select aria-label="entrada padrão" value={defs.enter}
            onChange={(e) => patchDefs({ enter: e.target.value as OverlayAnim })} className="bg-zinc-800 rounded px-2 py-1">
            {ANIMS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Saída
          <select aria-label="saída padrão" value={defs.exit}
            onChange={(e) => patchDefs({ exit: e.target.value as OverlayAnim })} className="bg-zinc-800 rounded px-2 py-1">
            {ANIMS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Permanência (s)
          <input aria-label="permanência padrão" type="number" step={0.5} min={0.5}
            value={(defs.durationInFrames / fps).toFixed(1)}
            onChange={(e) => patchDefs({ durationInFrames: Math.max(1, Math.round(Number(e.target.value) * fps)) })}
            className="bg-zinc-800 rounded px-2 py-1" />
        </label>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Sugestões ({suggestions.length})</span>
          <button aria-label="recarregar sugestões" onClick={reloadSuggestions} className="text-xs px-2 py-1 bg-zinc-800 rounded">↻ Recarregar</button>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-xs text-zinc-500">Peça no chat: “gera sugestões pro {slug}”. Depois clique ↻ Recarregar.</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-sm border-l-2 border-emerald-700 pl-2">
                <div className="flex-1">
                  <div className="font-medium">{s.text}</div>
                  <div className="text-xs text-zinc-500">{(s.fromFrame / fps).toFixed(1)}s · {s.kind} · {s.angle}</div>
                  {s.source && <div className="text-xs text-zinc-600 italic">“{s.source}”</div>}
                </div>
                <button aria-label={`aplicar sugestão ${s.id}`} onClick={() => applySuggestion(s)} className="px-2 py-1 bg-emerald-600 rounded text-xs">✓ Aplicar</button>
                <button aria-label={`pular sugestão ${s.id}`} onClick={() => skipSuggestion(s)} className="px-2 py-1 bg-zinc-800 rounded text-xs">✗ Pular</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={addOverlay} className="px-3 py-2 bg-emerald-600 rounded font-medium">+ Texto</button>
        <button onClick={save} disabled={saving} className="px-3 py-2 bg-zinc-800 rounded disabled:opacity-40">
          {saving ? "Salvando..." : "Salvar"}
        </button>
        {saved && <span className="text-emerald-400 text-sm">✓ salvo</span>}
      </div>
      {err && <p className="text-red-400 text-sm">{err}</p>}

      <ol className="space-y-1 text-sm">
        {overlays.map((o) => {
          const isSel = o.id === selectedId;
          return (
            <li key={o.id}
              className={`flex items-center gap-2 px-2 py-1 rounded border-l-2 ${
                isSel ? "bg-zinc-800 border-emerald-500" : "border-transparent"}`}>
              {isSel && <span aria-label="item selecionado" className="text-emerald-400">▸</span>}
              <button className="flex-1 text-left" onClick={() => setSelectedId(o.id)}>
                <input
                  aria-label={`texto do overlay ${o.id}`}
                  value={o.text}
                  onChange={(e) => patch(o.id, { text: e.target.value })}
                  className="bg-transparent w-full outline-none border-b border-transparent focus:border-emerald-500"
                />
              </button>
              <span className="text-xs text-zinc-500">{(o.fromFrame / fps).toFixed(1)}s</span>
              {overlappingIds.has(o.id) && <span aria-label="aviso de sobreposição" className="text-amber-400">⚠</span>}
              <button aria-label={`remover ${o.id}`} onClick={() => removeOverlay(o.id)} className="text-red-400 px-2">remover</button>
            </li>
          );
        })}
      </ol>

      {selected && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">Início (s)
            <div className="flex items-center gap-1">
              <button aria-label="recuar início" onClick={() => selected && patch(selected.id, { fromFrame: Math.max(0, selected.fromFrame - 3) })} className="px-2 bg-zinc-800 rounded">−</button>
              <input type="number" step={0.1} min={0} value={startSec.toFixed(1)}
                onChange={(e) => setStartSec(Number(e.target.value))}
                className="bg-zinc-800 rounded px-2 py-1 flex-1" />
              <button aria-label="avançar início" onClick={() => selected && patch(selected.id, { fromFrame: selected.fromFrame + 3 })} className="px-2 bg-zinc-800 rounded">+</button>
            </div>
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
          <label className="flex flex-col gap-1">Largura
            <input aria-label="largura" type="range" min={20} max={100} value={selected.maxWidthPct ?? 80}
              onChange={(e) => patch(selected.id, { maxWidthPct: Number(e.target.value) })} />
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
