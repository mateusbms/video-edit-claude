import { useState } from "react";
import { uploadJob } from "../api";
import { formatSeconds } from "../util";
import type { StepProps } from "../App";

type Probe = { width: number; height: number; fps: number; duration: number };

export const UploadStep: React.FC<StepProps> = ({ slug, setSlug, next }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [localSlug, setLocalSlug] = useState(slug || "video1");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };
  const move = (i: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };
  const remove = (i: number) => setFiles((prev) => prev.filter((_, k) => k !== i));

  const onUpload = async () => {
    if (files.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const r = await uploadJob(files, localSlug);
      setSlug(r.slug); setProbe(r.probe);
    } catch (e: any) {
      setErr(e.message ?? "erro no upload");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">1. Subir o(s) vídeo(s)</h2>
      <label className="block">
        <span className="text-sm text-zinc-400">Nome do projeto (slug)</span>
        <input
          className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={localSlug} onChange={(e) => setLocalSlug(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-400">Arquivos de vídeo (pode selecionar vários)</span>
        <input
          type="file" accept="video/*" multiple
          onChange={(e) => addFiles(e.target.files)}
          className="mt-1 block"
        />
      </label>

      {files.length > 0 && (
        <ol className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
            >
              <span className="text-zinc-500 w-5">{i + 1}.</span>
              <span className="flex-1 truncate">{f.name}</span>
              <button
                aria-label={`subir ${f.name}`} onClick={() => move(i, -1)}
                disabled={i === 0} className="px-2 disabled:opacity-30"
              >↑</button>
              <button
                aria-label={`descer ${f.name}`} onClick={() => move(i, 1)}
                disabled={i === files.length - 1} className="px-2 disabled:opacity-30"
              >↓</button>
              <button
                aria-label={`remover ${f.name}`} onClick={() => remove(i)}
                className="px-2 text-red-400"
              >×</button>
            </li>
          ))}
        </ol>
      )}

      <button
        onClick={onUpload} disabled={files.length === 0 || busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40"
      >
        {busy ? "Enviando..." : files.length > 1 ? `Juntar e enviar (${files.length})` : "Enviar"}
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
