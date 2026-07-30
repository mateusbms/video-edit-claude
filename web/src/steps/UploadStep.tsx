import { useEffect, useRef, useState } from "react";
import { uploadJob, putOrientation, getJob, listJobs, SlugOcupado } from "../api";
import { proximoSlugLivre } from "../slug";
import { formatSeconds } from "../util";
import type { StepProps } from "../App";
import type { JobSummary } from "../types";
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
  const [colisao, setColisao] = useState<JobSummary | null>(null);
  const [slugsUsados, setSlugsUsados] = useState<string[]>([]);
  // Marca se o usuário já digitou algo no campo à mão. Num backend lento,
  // a resposta de listJobs() pode chegar depois de quem já começou a digitar
  // um nome — sem essa marca, a sugestão trocava o nome no meio da digitação.
  const editadoAMao = useRef(false);

  // Projeto aberto pela lista já tem vídeo no servidor: carrega o probe e a
  // orientação dele para o "Próximo" liberar sem exigir reenvio. (O efeito
  // irmão, para o caso sem slug — sugerir nome livre — é da Task 6.)
  useEffect(() => {
    if (!slug) return;
    let vivo = true;
    getJob(slug)
      .then((j) => {
        if (!vivo) return;
        if (j.probe) setProbe(j.probe);
        if (j.orientation) setOrientation(j.orientation);
      })
      .catch(() => { /* backend indisponível: fica sem probe, como antes */ });
    return () => { vivo = false; };
  }, [slug]);

  // Num projeto novo (sem slug), o campo vinha com "video1" ou com o slug do
  // projeto anterior — o que fazia da sobrescrita o caminho de menor esforço.
  // Sugerimos sempre um nome livre.
  useEffect(() => {
    let vivo = true;
    listJobs()
      .then((l) => {
        if (!vivo) return;
        const usados = l.map((j) => j.slug);
        setSlugsUsados(usados);
        if (!slug && !editadoAMao.current) setLocalSlug(proximoSlugLivre(usados));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [slug]);

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

  const enviar = async (overwrite: boolean, alvo: string = localSlug) => {
    if (files.length === 0) return;
    setBusy(true); setErr(null); setColisao(null);
    try {
      const r = await uploadJob(files, alvo, overwrite);
      setSlug(r.slug); setProbe(r.probe); setFiles([]); setChanged(false);
      const detected = r.probe
        ? orientationFromProbe(r.probe.width, r.probe.height)
        : "16x9";
      await reconcileOrientation(r.slug, detected);
    } catch (e: any) {
      // 409: o slug tem trabalho. Não é erro — é uma pergunta.
      if (e instanceof SlugOcupado) setColisao(e.existente);
      else setErr(e.message ?? "erro no upload");
    } finally {
      setBusy(false);
    }
  };

  const onUpload = () => enviar(false);

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
          value={localSlug}
          onChange={(e) => {
            editadoAMao.current = true;
            setLocalSlug(e.target.value);
            // O diálogo de colisão confirma um alvo ("O projeto X já existe").
            // Mudar o campo invalida essa confirmação — senão "Substituir"
            // pode acabar mirando num projeto diferente do que foi mostrado.
            setColisao(null);
          }}
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
        onClick={() => onUpload()} disabled={files.length === 0 || busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40"
      >
        {busy ? "Enviando..." : files.length > 1 ? `Juntar e enviar (${files.length})` : "Enviar"}
      </button>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {colisao && (
        <div role="alertdialog" aria-label="projeto já existe"
             className="rounded border border-amber-700 bg-amber-950/40 p-4 text-sm space-y-3">
          <p className="text-amber-200">
            <strong>O projeto "{colisao.slug}" já existe.</strong>{" "}
            {[
              colisao.has_trimmed && "corte",
              colisao.has_transcript && "transcrição",
              colisao.has_hook && "hook",
              colisao.has_recipe && "textos",
            ].filter(Boolean).join(", ") || "o vídeo enviado"}
            {" "}está salvo nele.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                // Exclui o slug que acabou de colidir da sugestão: sem isso,
                // com listJobs falho (slugsUsados == []) o botão podia propor
                // de volta o mesmo nome ocupado.
                setLocalSlug(proximoSlugLivre([...slugsUsados, colisao.slug]));
                setColisao(null);
              }}
              className="px-3 py-1 bg-emerald-600 rounded"
            >
              Criar novo projeto
            </button>
            <button
              onClick={() => { setSlug(colisao.slug); setColisao(null); next(); }}
              className="px-3 py-1 bg-zinc-800 rounded"
            >
              Abrir o existente
            </button>
            <button
              onClick={() => enviar(true, colisao.slug)}
              className="px-3 py-1 bg-red-900 rounded"
            >
              Substituir o vídeo
            </button>
          </div>
          <p className="text-xs text-amber-300/70">
            Substituir descarta corte, transcrição e textos. O vídeo já
            exportado em output/ é mantido.
          </p>
        </div>
      )}
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
