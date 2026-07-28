import { useState } from "react";
import { uploadJob, putOrientation, getJob } from "../api";
import { formatSeconds } from "../util";
import type { StepProps } from "../App";
import { orientationFromProbe, type Orientation } from "../frame";

type Probe = { width: number; height: number; fps: number; duration: number };

const LABELS: Record<Orientation, string> = {
  "16x9": "16:9 (horizontal)",
  "9x16": "9:16 (vertical)",
};

export const UploadStep: React.FC<StepProps> = ({ slug, setSlug, next }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [localSlug, setLocalSlug] = useState(slug || "video1");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [orientation, setOrientation] = useState<Orientation>("16x9");
  const [changed, setChanged] = useState(false);
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

  // Orientação que o job realmente tem no backend. Reler é o que evita mostrar
  // o rádio numa coisa e o servidor guardar outra — seja num reenvio para um
  // slug que já tinha escolha explícita, seja se o PUT falhar.
  const reconcileOrientation = async (
    jobSlug: string, fallback: Orientation,
  ): Promise<Orientation> => {
    let efetiva = fallback;
    try {
      const j = await getJob(jobSlug);
      efetiva = (j?.orientation as Orientation) || fallback;
    } catch { /* backend indisponível: fica com o fallback */ }
    setOrientation(efetiva);
    return efetiva;
  };

  const onUpload = async () => {
    if (files.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const r = await uploadJob(files, localSlug);
      setSlug(r.slug); setProbe(r.probe); setFiles([]); setChanged(false);
      const detected = r.probe
        ? orientationFromProbe(r.probe.width, r.probe.height)
        : "16x9";
      await reconcileOrientation(r.slug, detected);
    } catch (e: any) {
      setErr(e.message ?? "erro no upload");
    } finally {
      setBusy(false);
    }
  };

  const changeOrientation = async (o: Orientation) => {
    const anterior = orientation;
    setOrientation(o);
    const jobSlug = slug || localSlug;
    try { await putOrientation(jobSlug, o); }
    catch (e: any) { setErr(e.message ?? "erro ao trocar o formato"); }
    const efetiva = await reconcileOrientation(jobSlug, anterior);
    if (efetiva !== anterior) setChanged(true);
  };

  const sourceOrientation = probe
    ? orientationFromProbe(probe.width, probe.height)
    : null;
  const crossFormat = !!sourceOrientation && sourceOrientation !== orientation;

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
          <fieldset className="mt-3 pt-3 border-t border-zinc-800">
            <legend className="text-zinc-400">Formato de saída</legend>
            <p className="text-xs text-zinc-500 mb-2">
              Detectado pelo vídeo. O preview e o render usam esse formato.
            </p>
            <div className="flex gap-4">
              {(["9x16", "16x9"] as Orientation[]).map((o) => (
                <label key={o} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio" name="orientation" value={o}
                    checked={orientation === o}
                    onChange={() => changeOrientation(o)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>{LABELS[o]}</span>
                </label>
              ))}
            </div>

            {crossFormat && sourceOrientation && (
              <p role="status" className="mt-3 rounded border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-200">
                <strong>Atenção:</strong> seu vídeo é {LABELS[sourceOrientation]} e
                você escolheu {LABELS[orientation]}. Ele vai ser encaixado inteiro
                no formato escolhido, e as sobras vão ficar com um fundo desfocado
                do próprio vídeo. O preview aqui do editor mostra o vídeo no
                formato original — ele <strong>não</strong> simula esse
                reenquadramento, então a altura dos textos e da legenda vai
                aparecer diferente aqui e no vídeo final. Confira pelo botão de
                prévia da imagem no passo de renderização.
              </p>
            )}

            {changed && (
              <p role="status" className="mt-3 rounded border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-200">
                <strong>Você trocou o formato.</strong> Os textos e a legenda que
                já estiverem posicionados continuam no mesmo lugar, mas o tamanho
                deles é medido em relação à largura do vídeo — no vertical a
                largura é bem menor, então o mesmo texto aparece proporcionalmente
                maior (e o contrário ao voltar para o horizontal). Reveja os
                tamanhos nos passos de Hook e Textos.
              </p>
            )}
          </fieldset>
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
