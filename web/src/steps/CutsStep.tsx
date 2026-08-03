import { useEffect, useRef, useState } from "react";
import { streamSSE, mediaUrl, getCuts, getJob, recutHook, detectLocal } from "../api";
import type { Emenda } from "../api";
import { Slider } from "../components/Slider";
import { ProgressBar } from "../components/ProgressBar";
import { EmendaPreview } from "../components/EmendaPreview";
import { formatSeconds, percentage } from "../util";
import type { CutResult, CutParams } from "../types";
import type { StepProps } from "../App";
import { oQueSePerde, listarPerdas, TUDO_QUE_SE_PERDE } from "../perda";
import { useAlertDialog } from "../useAlertDialog";

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
        <strong>{TUDO_QUE_SE_PERDE}</strong>{" "}
        seriam descartados, se existirem — as legendas ficariam fora de sincronia
        com o vídeo novo.
      </>
    ) : (
      <>
        {acao}, então <strong>{listarPerdas(aPerder)}</strong>{" "}
        {aPerder.length > 1 ? "serão descartados" : "será descartado"} — as
        legendas ficariam fora de sincronia com o vídeo novo.
        {perdeTranscricao && " Você vai precisar transcrever outra vez."}
      </>
    )}
  </p>
);

// Os dois diálogos de confirmação (re-detectar pausas e corte manual) são o
// mesmo alertdialog com rótulo/ação/gatilho diferentes — viram um componente
// à parte para poder chamar useAlertDialog, que precisa montar e desmontar
// junto com o próprio diálogo (chamar o hook direto no corpo de CutsStep
// violaria as Rules of Hooks, já que os dois só existem condicionalmente).
const ConfirmarDescarte: React.FC<{
  ariaLabel: string;
  acao: string;
  aPerder: string[] | null;
  perdeTranscricao: boolean;
  busy: boolean;
  onConfirmar: () => void;
  onDesistir: () => void;
}> = ({ ariaLabel, acao, aPerder, perdeTranscricao, busy, onConfirmar, onDesistir }) => {
  const ref = useAlertDialog<HTMLDivElement>(onDesistir, busy);
  return (
    <div ref={ref} role="alertdialog" aria-modal="true" aria-label={ariaLabel}
         className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm space-y-2">
      <AvisoDescarte acao={acao} aPerder={aPerder} perdeTranscricao={perdeTranscricao} />
      <div className="flex gap-2">
        <button onClick={onConfirmar} disabled={busy}
                className="px-3 py-1 bg-amber-800 rounded disabled:opacity-40">
          Descartar e cortar
        </button>
        <button onClick={onDesistir} disabled={busy}
                className="px-3 py-1 bg-zinc-800 rounded disabled:opacity-40">
          Desistir
        </button>
      </div>
    </div>
  );
};

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
  const [fps, setFps] = useState(30);
  // emenda proposta pela detecção local, em pré-visualização; null = sem proposta
  const [emenda, setEmenda] = useState<Emenda | null>(null);
  const [detectando, setDetectando] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineProg, setRefineProg] = useState<{ n: number; total: number } | null>(null);
  // Sem o source, o "Detectar pausas" não pode acontecer — o stage_cut é o
  // único leitor dele. Oferecer o botão só para o servidor recusar com 409
  // seria empurrar o usuário para um beco.
  const [temSource, setTemSource] = useState(true);
  // Slug da matriz que originou esta variação (spec 2026-08-01), ou "" para
  // projeto normal. Uma variação nasce sem source.mp4 de propósito — o vídeo
  // já foi cortado e montado na criação — então o aviso de !temSource precisa
  // explicar a origem em vez de falar em "liberar espaço", que nunca aconteceu.
  const [origemMatriz, setOrigemMatriz] = useState("");
  // Variação com clipe bruto do hook guardado (hook_source.mp4): o passo Cortes
  // deixa de ser só-leitura e oferece re-cortar o silêncio do hook. matriz-
  // Disponivel diz se a matriz de origem ainda pode alimentar o re-corte.
  const [hasHookSource, setHasHookSource] = useState(false);
  const [matrizDisponivel, setMatrizDisponivel] = useState(false);
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
      setOrigemMatriz(j?.origem_matriz ?? "");
      setHasHookSource(!!j?.has_hook_source);
      setMatrizDisponivel(!!j?.matriz_disponivel);
      setPerdeTranscricao(!!j?.has_transcript);
      setAPerder(oQueSePerde(j ?? {}));
      if (j?.probe?.fps) setFps(j.probe.fps);
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

  const detectarLocal = async () => {
    setErr(null); setDetectando(true);
    try {
      setEmenda(await detectLocal(slug, curTime()));
    } catch (e: any) { setErr(e.message); }
    finally { setDetectando(false); }
  };

  const aplicarEmenda = () => {
    if (!emenda) return;
    const { start, end } = emenda;
    if (end > start) {
      setRemoveList((l) => [...l, { start, end }].sort((a, b) => a.start - b.start));
    }
    setEmenda(null);
  };

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

  const modoHook = hasHookSource;

  const recut = async () => {
    setConfirmandoCorte(false);
    setBusy(true); setErr(null); setProg(null);
    try {
      await recutHook(slug, params, {
        progress: (d) => { if (d.n != null && d.total != null) setProg({ n: d.n, total: d.total }); },
        done: async (d) => {
          // o re-corte reescreveu o trimmed e re-derivou os artefatos da base
          const r = await getCuts(slug).catch(() => null);
          if (r) { setResult(r); setTrimmedVersion(r.trimmed_mtime ?? 0); }
          else if (d.trimmed_mtime != null) setTrimmedVersion(d.trimmed_mtime);
          // recompor apagou os derivados (DERIVADOS_DO_TRIMMED); não avisar de novo
          setAPerder([]); setPerdeTranscricao(false);
          setRemoveList([]); setMarkStart(null);
        },
        error: (d) => setErr(d.detail ?? "erro ao re-cortar o hook"),
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
        hint="O que conta como pausa: mais alto corta mais (até respiração e fala baixa); mais baixo, só silêncio quase absoluto."
        onChange={(n) => setParams({ ...params, silence_threshold_db: n })} />
      <Slider label="Padding ao redor da fala (s)" value={params.padding}
        min={0} max={0.5} step={0.05} format={(n) => `${n.toFixed(2)} s`}
        hint="Margem mantida antes e depois de cada fala: mais alto respira melhor; abaixo de ~0.10 s arrisca comer o começo das palavras."
        onChange={(n) => setParams({ ...params, padding: n })} />
      <Slider label="Silêncio mínimo (s)" value={params.min_silence}
        min={0.2} max={2.0} step={0.1} format={(n) => `${n.toFixed(1)} s`}
        hint="Só pausas mais longas que isto são cortadas: mais baixo acelera o ritmo (some tudo); mais alto preserva os respiros naturais."
        onChange={(n) => setParams({ ...params, min_silence: n })} />
      {/* refining na guarda: corte e refino reescrevem o mesmo trimmed.mp4 —
          um de cada vez. Em modo hook sem matriz disponível o botão some por
          completo (não só desabilita) — não há como re-cortar sem a matriz. */}
      {(!modoHook || matrizDisponivel) && (
        <button onClick={pedirParaCortar}
          disabled={busy || carregandoJob || refining || (modoHook ? !matrizDisponivel : !temSource)}
          className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
          {busy ? "Cortando..." : modoHook ? "Detectar pausas (do hook)" : "Detectar pausas"}
        </button>
      )}
      {confirmandoCorte && (
        <ConfirmarDescarte
          ariaLabel="confirmar nova detecção de pausas"
          acao={modoHook
            ? "Re-cortar o hook refaz o corte do hook e remonta a variação a partir da matriz"
            : "Detectar pausas refaz o corte a partir do vídeo original"}
          aPerder={aPerder} perdeTranscricao={perdeTranscricao}
          busy={busy}
          onConfirmar={modoHook ? recut : onCut}
          onDesistir={() => setConfirmandoCorte(false)}
        />
      )}
      {modoHook && !matrizDisponivel && (
        <p role="status" className="text-sm rounded border border-amber-700 bg-amber-950/40 p-3 text-amber-200">
          A matriz <strong>{origemMatriz}</strong> foi excluída, então não dá para
          re-cortar o hook desta variação. A variação continua renderizável, e os
          cortes manuais sobre o vídeo montado continuam funcionando.
        </p>
      )}
      {!modoHook && !temSource && (
        <p role="status" className="text-sm rounded border border-amber-700 bg-amber-950/40 p-3 text-amber-200">
          {origemMatriz ? (
            // Variação antiga (criada antes da edição escopada): nasceu sem
            // hook_source.mp4, então não dá para re-cortar o hook aqui.
            <>
              Esta variação já nasce cortada e montada a partir da matriz{" "}
              <strong>{origemMatriz}</strong> — não há vídeo original para
              re-detectar pausas. Os cortes manuais continuam funcionando.
            </>
          ) : result ? (
            <>
              O vídeo original deste projeto foi apagado para <strong>liberar espaço</strong>,
              então não dá mais para detectar pausas aqui. Os cortes manuais sobre o vídeo
              já cortado continuam funcionando.
            </>
          ) : (
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
              <button onClick={detectarLocal} disabled={detectando || refining || busy}
                className="px-3 py-1 bg-sky-700 rounded disabled:opacity-40">
                {detectando ? "Analisando..." : "Remover trecho aqui"}
              </button>
              <span className="text-xs text-zinc-500">
                Pause perto do trecho ruim e clique — acho as bordas exatas em volta.
              </span>
            </div>
            {emenda && (
              <EmendaPreview
                slug={slug} version={trimmedVersion} fps={fps}
                start={emenda.start} end={emenda.end}
                limpoInicio={emenda.limpo_inicio} limpoFim={emenda.limpo_fim}
                onChange={(start, end) => setEmenda((e) => (e ? { ...e, start, end } : e))}
                onAplicar={aplicarEmenda}
                onCancelar={() => setEmenda(null)}
              />
            )}
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
                {/* busy na guarda é cinto e suspensório: onCut zera o result e
                    este painel desmonta durante o corte — mas se isso mudar um
                    dia, o botão não pode disparar um refino concorrente */}
                <button onClick={pedirParaAplicar} disabled={refining || carregandoJob || busy}
                  className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
                  {refining ? "Aplicando..." : `Aplicar cortes (${removeList.length})`}
                </button>
                {confirmandoRefino && (
                  <ConfirmarDescarte
                    ariaLabel="confirmar corte manual"
                    acao="Cortar de novo encurta o vídeo"
                    aPerder={aPerder} perdeTranscricao={perdeTranscricao}
                    busy={refining}
                    onConfirmar={applyRefine}
                    onDesistir={() => setConfirmandoRefino(false)}
                  />
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
