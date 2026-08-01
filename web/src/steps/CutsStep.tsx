import { useEffect, useRef, useState } from "react";
import { streamSSE, mediaUrl, getCuts, getJob } from "../api";
import { Slider } from "../components/Slider";
import { ProgressBar } from "../components/ProgressBar";
import { formatSeconds, percentage } from "../util";
import type { CutResult, CutParams } from "../types";
import type { StepProps } from "../App";

// Parágrafo compartilhado pelos dois diálogos de confirmação (re-detectar
// pausas e corte manual): lista o que será descartado, com a variante
// conservadora para quando não sabemos o que o projeto tem (aPerder === null).
const AvisoDescarte: React.FC<{
  acao: string; // primeira frase, própria de cada botão
  aPerder: string[] | null;
  perdeTranscricao: boolean;
}> = ({ acao, aPerder, perdeTranscricao }) => (
  <p className="text-amber-200">
    {aPerder === null ? (
      <>
        Não foi possível confirmar o que este projeto já tem salvo. {acao}, então{" "}
        <strong>a transcrição, os textos, as sugestões e a receita de render</strong>{" "}
        seriam descartados, se existirem — as legendas ficariam fora de sincronia
        com o vídeo novo.
      </>
    ) : (
      <>
        {acao}, então <strong>{aPerder.join(", ")}</strong>{" "}
        {aPerder.length > 1 ? "serão descartados" : "será descartado"} — as
        legendas ficariam fora de sincronia com o vídeo novo.
        {perdeTranscricao && " Você vai precisar transcrever outra vez."}
      </>
    )}
  </p>
);

export const CutsStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [params, setParams] = useState<CutParams>({
    silence_threshold_db: -30, padding: 0.1, min_silence: 0.5,
  });
  const [result, setResult] = useState<CutResult | null>(null);
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [removeList, setRemoveList] = useState<{ start: number; end: number }[]>([]);
  const [markStart, setMarkStart] = useState<number | null>(null);
  // versão do trimmed.mp4 (mtime): entra como `?v=` no preview. O corte e o
  // refino reescrevem o arquivo no mesmo caminho, então sem isso o navegador
  // pode servir pedaços do vídeo anterior — player parado em 0:00, sem duração.
  const [trimmedVersion, setTrimmedVersion] = useState(0);
  const [refining, setRefining] = useState(false);
  const [refineProg, setRefineProg] = useState<{ n: number; total: number } | null>(null);
  // Sem o source, o "Detectar pausas" não pode acontecer — o stage_cut é o
  // único leitor dele. Oferecer o botão só para o servidor recusar com 409
  // seria empurrar o usuário para um beco.
  const [temSource, setTemSource] = useState(true);
  // O que o refino vai apagar. stage_refine remove transcrição, textos,
  // sugestões e recipe de propósito — o vídeo encurta e as legendas sairiam de
  // sincronia. Não mudamos isso; só avisamos, e só quando há o que perder.
  // `null` = não sabemos o que este projeto tem (getJob nunca respondeu com
  // sucesso). `carregandoJob`, abaixo, é quem decide se vale a pena esperar
  // por essa resposta ou se é hora de seguir sem ela.
  const [aPerder, setAPerder] = useState<string[] | null>(null);
  // Duplicata de `has_transcript`, guardada à parte da string de exibição:
  // `aPerder.includes("a transcrição")` usava o texto que aparece na tela como
  // chave de estado — reescrever a frase (achado Minor da revisão) faria o
  // aviso extra sobre re-transcrever sumir em silêncio.
  const [perdeTranscricao, setPerdeTranscricao] = useState(false);
  // `null` em `aPerder` tem dois motivos possíveis: "a resposta ainda não
  // chegou" (vale esperar) ou "o getJob falhou e não vai vir mais" (esperar
  // seria travar o botão para sempre). getJob e getCuts correm em paralelo no
  // mesmo useEffect: com um corte salvo, getCuts pode liberar o painel de
  // cortes manuais antes de getJob terminar — por isso o botão de aplicar
  // fica desabilitado só enquanto `carregandoJob`, nunca por `aPerder`
  // sozinho.
  const [carregandoJob, setCarregandoJob] = useState(true);
  const [confirmandoRefino, setConfirmandoRefino] = useState(false);
  const [confirmandoCorte, setConfirmandoCorte] = useState(false);

  // O wizard monta um passo por vez (RecordedWizard renderiza só o atual), então
  // sair para a Transcrição e voltar destrói este componente. Sem reler o
  // servidor, o trabalho de corte parecia perdido: painel vazio e sliders nos
  // valores padrão, mesmo com cuts.json em disco.
  useEffect(() => {
    let vivo = true;
    getJob(slug).then((j) => {
      if (!vivo) return;
      if (j?.config) setParams(j.config);
      setTemSource(j?.has_source !== false);
      setPerdeTranscricao(!!j?.has_transcript);
      setAPerder([
        j?.has_transcript && "a transcrição",
        j?.has_overlays && "os textos",
        j?.has_suggestions && "as sugestões",
        j?.has_recipe && "a receita de render",
      ].filter(Boolean) as string[]);
    }).catch(() => {
      // getJob falhou: aPerder fica null (não sabemos o que este projeto tem)
      // e não vai mudar sozinho — travar o botão esperando por uma resposta
      // que não vem seria pior do que aplicar sem saber. carregandoJob, logo
      // abaixo, libera o botão de qualquer forma.
    }).finally(() => {
      if (vivo) setCarregandoJob(false);
    });
    getCuts(slug).then((r) => {
      if (!vivo || !r) return;
      setResult(r);
      setTrimmedVersion(r.trimmed_mtime ?? 0);
    }).catch(() => {});
    return () => { vivo = false; };
  }, [slug]);

  // Removendo trechos com o diálogo de confirmação aberto — por exemplo
  // removendo todos com o "×" — o diálogo ficaria preso mostrando um aviso
  // sobre um "aplicar" que não existe mais.
  useEffect(() => {
    if (removeList.length === 0) setConfirmandoRefino(false);
  }, [removeList]);

  // Espelho do efeito acima para o diálogo do corte: um refino que termina
  // com ele aberto zera aPerder, e o aviso passaria a listar um vazio —
  // "então [nada] será descartado". Sem nada a perder não há o que confirmar.
  useEffect(() => {
    if (aPerder !== null && aPerder.length === 0) setConfirmandoCorte(false);
  }, [aPerder]);

  const curTime = () => videoRef.current?.currentTime ?? 0;
  const onMarkStart = () => setMarkStart(curTime());
  const onMarkEnd = () => {
    const end = curTime();
    if (markStart != null && end > markStart) {
      setRemoveList((l) => [...l, { start: markStart, end }].sort((a, b) => a.start - b.start));
      setMarkStart(null);
    }
  };
  const removeRange = (i: number) => setRemoveList((l) => l.filter((_, k) => k !== i));

  const pedirParaCortar = () => {
    // mesmo portão do pedirParaAplicar: confirmar quando há o que perder — ou
    // quando não sabemos (aPerder === null), que erra para o lado seguro
    setConfirmandoRefino(false); // um diálogo por vez
    if (aPerder === null || aPerder.length > 0) { setConfirmandoCorte(true); return; }
    onCut();
  };

  const pedirParaAplicar = () => {
    setConfirmandoCorte(false); // um diálogo por vez
    if (removeList.length === 0) return;
    // aPerder === null: getJob nunca respondeu com sucesso (falhou, ou o
    // botão foi habilitado antes da hora por algum caminho futuro). O lado
    // seguro é confirmar mesmo sem saber o que há a perder — nunca aplicar
    // direto quando não sabemos.
    if (aPerder === null || aPerder.length > 0) { setConfirmandoRefino(true); return; }
    applyRefine();
  };

  const applyRefine = async () => {
    if (removeList.length === 0) return;
    setConfirmandoRefino(false);
    setRefining(true); setErr(null); setRefineProg(null);
    try {
      await streamSSE(`/api/jobs/${slug}/refine`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remove: removeList }),
      }, {
        progress: (d) => { if (d.n != null && d.total != null) setRefineProg({ n: d.n, total: d.total }); },
        done: (d) => {
          setResult((r) => (r && d.trimmed_duration != null ? { ...r, trimmed_duration: d.trimmed_duration } : r));
          setRemoveList([]);
          if (d.trimmed_mtime != null) setTrimmedVersion(d.trimmed_mtime);
          // o refino apagou tudo isso; avisar de novo no próximo corte seria mentira
          setAPerder([]);
          setPerdeTranscricao(false);
        },
        error: (d) => setErr(d.detail ?? "erro ao aplicar cortes"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setRefining(false); setRefineProg(null); }
  };

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    v.play()?.catch(() => {});
  };

  const onCut = async () => {
    setConfirmandoCorte(false);
    setBusy(true); setErr(null); setResult(null); setProg(null);
    try {
      await streamSSE(`/api/jobs/${slug}/cut`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }, {
        progress: (d) => { if (d.n != null && d.total != null) setProg({ n: d.n, total: d.total }); },
        done: (d) => {
          const r = d as CutResult;
          setResult(r);
          // o corte reescreveu o trimmed.mp4: nova versão para o preview não
          // reaproveitar o vídeo do corte anterior
          setTrimmedVersion(r.trimmed_mtime ?? 0);
          // o corte apagou os derivados (DERIVADOS_DO_TRIMMED); avisar de
          // novo no próximo clique seria mentira — igual ao refino
          setAPerder([]);
          setPerdeTranscricao(false);
          // as marcações antigas referenciam a timeline do trimmed anterior
          setRemoveList([]);
          setMarkStart(null);
        },
        error: (d) => setErr(d.detail ?? "erro no corte"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const removed = result ? result.original_duration - result.trimmed_duration : 0;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">2. Cortar pausas</h2>
      <Slider label="Limite de silêncio (dB)" value={params.silence_threshold_db}
        min={-50} max={-10} step={1} format={(n) => `${n} dB`}
        onChange={(n) => setParams({ ...params, silence_threshold_db: n })} />
      <Slider label="Padding ao redor da fala (s)" value={params.padding}
        min={0} max={0.5} step={0.05} format={(n) => `${n.toFixed(2)} s`}
        onChange={(n) => setParams({ ...params, padding: n })} />
      <Slider label="Silêncio mínimo (s)" value={params.min_silence}
        min={0.2} max={2.0} step={0.1} format={(n) => `${n.toFixed(1)} s`}
        onChange={(n) => setParams({ ...params, min_silence: n })} />
      <button onClick={pedirParaCortar} disabled={busy || !temSource || carregandoJob}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy ? "Cortando..." : "Detectar pausas"}
      </button>
      {confirmandoCorte && (
        <div role="alertdialog" aria-label="confirmar nova detecção de pausas"
             className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm space-y-2">
          <AvisoDescarte acao="Detectar pausas refaz o corte a partir do vídeo original"
                         aPerder={aPerder} perdeTranscricao={perdeTranscricao} />
          <div className="flex gap-2">
            <button onClick={onCut} disabled={busy}
                    className="px-3 py-1 bg-amber-800 rounded disabled:opacity-40">
              Descartar e cortar
            </button>
            <button onClick={() => setConfirmandoCorte(false)} disabled={busy}
                    className="px-3 py-1 bg-zinc-800 rounded disabled:opacity-40">
              Desistir
            </button>
          </div>
        </div>
      )}
      {!temSource && (
        <p role="status" className="text-sm rounded border border-amber-700 bg-amber-950/40 p-3 text-amber-200">
          {result ? (
            <>
              O vídeo original deste projeto foi apagado para <strong>liberar espaço</strong>,
              então não dá mais para detectar pausas aqui. Os cortes manuais sobre o vídeo
              já cortado continuam funcionando.
            </>
          ) : (
            // Sem source e sem corte salvo não há vídeo nenhum neste projeto —
            // prometer "os cortes manuais continuam funcionando" seria mentira:
            // não existe trimmed.mp4 para cortar manualmente.
            <>
              O vídeo original deste projeto foi apagado para <strong>liberar espaço</strong>,
              e este projeto não tem nenhum corte salvo — não dá para detectar pausas
              nem cortar manualmente aqui: não sobrou vídeo para trabalhar.
            </>
          )}
        </p>
      )}
      {busy && prog && <ProgressBar label="Corte" n={Math.round(prog.n)} total={Math.round(prog.total)} />}
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {result && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-4 text-sm space-y-2">
          <p>
            De <strong>{formatSeconds(result.original_duration)}</strong> para{" "}
            <strong>{formatSeconds(result.trimmed_duration)}</strong>{" "}
            <span className="text-zinc-400">
              ({formatSeconds(removed)} removidos · {percentage(removed, result.original_duration)}%)
            </span>
          </p>
          <p>{result.segments.length} trechos mantidos</p>
          <div className="h-3 bg-zinc-800 rounded overflow-hidden flex">
            {(() => {
              const total = result.original_duration;
              let cursor = 0;
              let trimmedCursor = 0;
              const parts: React.ReactElement[] = [];
              result.segments.forEach((s, i) => {
                if (s.start > cursor) {
                  parts.push(<div key={`g${i}`} style={{ width: `${((s.start - cursor) / total) * 100}%` }} className="bg-zinc-700" />);
                }
                const trimmedStart = trimmedCursor;
                parts.push(
                  <div key={`s${i}`} onClick={() => seek(trimmedStart)}
                    title={`Ir para ${formatSeconds(trimmedStart)}`}
                    style={{ width: `${((s.end - s.start) / total) * 100}%`, cursor: "pointer" }}
                    className="bg-emerald-500" />
                );
                cursor = s.end;
                trimmedCursor += s.end - s.start;
              });
              if (cursor < total) parts.push(<div key="end" style={{ width: `${((total - cursor) / total) * 100}%` }} className="bg-zinc-700" />);
              return parts;
            })()}
          </div>
          <video ref={videoRef} src={`${mediaUrl(slug, "trimmed.mp4")}?v=${trimmedVersion}`} controls
            className="max-h-[60vh] max-w-full block mx-auto rounded border border-zinc-800 mt-2" />
          <div className="border-t border-zinc-800 pt-3 mt-3 space-y-2">
            <p className="font-medium">Cortes manuais (opcional)</p>
            <p className="text-zinc-400 text-xs">Dê play no vídeo, marque o início e o fim dos trechos a remover.</p>
            <div className="flex gap-2 items-center flex-wrap">
              <button onClick={onMarkStart} className="px-3 py-1 bg-zinc-800 rounded">Marcar início</button>
              <button onClick={onMarkEnd} disabled={markStart == null} className="px-3 py-1 bg-zinc-800 rounded disabled:opacity-40">Marcar fim</button>
              {markStart != null && <span className="text-xs text-zinc-400">início em {formatSeconds(markStart)}…</span>}
            </div>
            {removeList.length > 0 && (
              <>
                <ol className="space-y-1 text-sm">
                  {removeList.map((r, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-zinc-500">{i + 1}.</span>
                      <span className="flex-1">{formatSeconds(r.start)} – {formatSeconds(r.end)}</span>
                      <button aria-label={`remover trecho ${i + 1}`} onClick={() => removeRange(i)} className="text-red-400 px-2">×</button>
                    </li>
                  ))}
                </ol>
                <div className="h-2 bg-zinc-800 rounded overflow-hidden relative">
                  {removeList.map((r, i) => {
                    const dur = result.trimmed_duration || 1;
                    return <div key={i} className="absolute h-full bg-red-500"
                      style={{ left: `${(r.start / dur) * 100}%`, width: `${((r.end - r.start) / dur) * 100}%` }} />;
                  })}
                </div>
                <button onClick={pedirParaAplicar} disabled={refining || carregandoJob}
                  className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
                  {refining ? "Aplicando..." : `Aplicar cortes (${removeList.length})`}
                </button>
                {confirmandoRefino && (
                  <div role="alertdialog" aria-label="confirmar corte manual"
                       className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm space-y-2">
                    <AvisoDescarte acao="Cortar de novo encurta o vídeo"
                                   aPerder={aPerder} perdeTranscricao={perdeTranscricao} />
                    <div className="flex gap-2">
                      <button onClick={applyRefine} disabled={refining}
                              className="px-3 py-1 bg-amber-800 rounded disabled:opacity-40">
                        Descartar e cortar
                      </button>
                      <button onClick={() => setConfirmandoRefino(false)} disabled={refining}
                              className="px-3 py-1 bg-zinc-800 rounded disabled:opacity-40">
                        Desistir
                      </button>
                    </div>
                  </div>
                )}
                {refining && refineProg && <ProgressBar label="Aplicando cortes" n={Math.round(refineProg.n)} total={Math.round(refineProg.total)} />}
              </>
            )}
          </div>
        </div>
      )}
      <div className="pt-4 flex justify-between">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
        <button onClick={next} disabled={!result} className="px-4 py-2 bg-zinc-800 rounded disabled:opacity-40">Próximo →</button>
      </div>
    </section>
  );
};
