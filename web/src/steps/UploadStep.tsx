import { useState } from "react";
import { uploadJob } from "../api";
import { formatSeconds } from "../util";
import type { StepProps } from "../App";

type Probe = { width: number; height: number; fps: number; duration: number };

export const UploadStep: React.FC<StepProps> = ({ slug, setSlug, next }) => {
  const [file, setFile] = useState<File | null>(null);
  const [localSlug, setLocalSlug] = useState(slug || "video1");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onUpload = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const r = await uploadJob(file, localSlug);
      setSlug(r.slug); setProbe(r.probe);
    } catch (e: any) {
      setErr(e.message ?? "erro no upload");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">1. Subir o vídeo</h2>
      <label className="block">
        <span className="text-sm text-zinc-400">Nome do projeto (slug)</span>
        <input
          className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={localSlug} onChange={(e) => setLocalSlug(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-400">Arquivo de vídeo</span>
        <input
          type="file" accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block"
        />
      </label>
      <button
        onClick={onUpload} disabled={!file || busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40"
      >
        {busy ? "Enviando..." : "Enviar"}
      </button>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {probe && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-4 text-sm">
          <p>Resolução: <strong>{probe.width}×{probe.height}</strong></p>
          <p>FPS: <strong>{probe.fps.toFixed(2)}</strong></p>
          <p>Duração: <strong>{formatSeconds(probe.duration)}</strong></p>
        </div>
      )}
      <div className="pt-4">
        <button
          onClick={next} disabled={!probe}
          className="px-4 py-2 bg-zinc-800 rounded font-medium disabled:opacity-40"
        >
          Próximo →
        </button>
      </div>
    </section>
  );
};
