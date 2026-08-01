import { useEffect, useRef, useState } from "react";
import { listJobs, putTitle, deleteJob, deleteSource } from "./api";
import type { JobSummary } from "./types";
import { oQueSePerde, listarPerdas } from "./perda";
import { useAlertDialog } from "./useAlertDialog";

const LABEL_FORMATO: Record<string, string> = {
  "16x9": "16:9",
  "9x16": "9:16",
};

/** Em que ponto do wizard o projeto parou, para a lista dar contexto. */
function progresso(j: JobSummary): string {
  if (j.has_render_16x9 || j.has_render_9x16) return "renderizado";
  if (j.has_recipe) return "pronto para renderizar";
  if (j.has_hook) return "com hook";
  if (j.has_transcript) return "transcrito";
  if (j.has_trimmed) return "cortado";
  if (!j.has_source) return "sem vídeo";
  return "só o vídeo";
}

function tamanho(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function quando(epochSegundos: number): string {
  if (!epochSegundos) return "";
  return new Date(epochSegundos * 1000).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * O que se perde ao apagar o projeto — a partir do que ele de fato tem, não
 * de uma lista fixa. Um projeto recém-criado não tem transcrição pra perder,
 * e um projeto que nunca gerou receita de render não tem hook nem textos.
 * "a transcrição"/"os textos"/"as sugestões"/"a receita de render" saem de
 * `oQueSePerde` (web/src/perda.ts) — a mesma fonte que CutsStep e UploadStep
 * usam para esses quatro itens, para não divergir de novo em silêncio.
 */
function itensPerdidos(j: JobSummary): string[] {
  return [
    j.has_source && "o vídeo original",
    j.has_trimmed && "o corte",
    j.has_hook && "o hook",
    ...oQueSePerde(j),
  ].filter((x): x is string => Boolean(x));
}

/** A frase de "o que se perde", incluindo o caso de um projeto sem nada ainda. */
function fraseDeExclusao(j: JobSummary): string {
  const itens = itensPerdidos(j);
  if (itens.length === 0) return "não tem nada a perder — o projeto ainda está vazio";
  return `descarta ${listarPerdas(itens)}`;
}

// Os dois diálogos de confirmação viram componentes à parte (em vez de JSX
// inline no .map()) para poder chamar useAlertDialog: o hook precisa montar
// e desmontar junto com o próprio diálogo — chamá-lo direto dentro do .map()
// violaria as Rules of Hooks (número de chamadas variável por render).
const ConfirmarExclusao: React.FC<{
  job: JobSummary;
  emAndamento: boolean;
  onConfirmar: () => void;
  onDesistir: () => void;
}> = ({ job, emAndamento, onConfirmar, onDesistir }) => {
  const ref = useAlertDialog<HTMLDivElement>(onDesistir, emAndamento);
  return (
    <div ref={ref} role="alertdialog" aria-modal="true" aria-label={`confirmar exclusão de ${job.slug}`}
         className="rounded border border-red-800 bg-red-950/40 p-3 text-sm space-y-2">
      <p className="text-red-200">
        Apagar <strong>{job.title || job.slug}</strong> {fraseDeExclusao(job)}.
        {(job.has_render_16x9 || job.has_render_9x16) &&
          ` O vídeo já exportado (${tamanho(job.bytes_render)}) é mantido.`}
      </p>
      <div className="flex gap-2">
        {/* Sem aria-label: o texto visível "Apagar mesmo assim" já é o nome
            acessível. Um aria-label diferente do rótulo visível quebra comando
            por voz (WCAG 2.5.3) e, dentro deste alertdialog, duplicava o nome
            dele — o próprio div já se anuncia como "confirmar exclusão de X". */}
        <button
          onClick={onConfirmar}
          disabled={emAndamento}
          className="px-3 py-1 bg-red-900 rounded disabled:opacity-50"
        >
          Apagar mesmo assim
        </button>
        <button
          onClick={onDesistir}
          disabled={emAndamento}
          className="px-3 py-1 bg-zinc-800 rounded disabled:opacity-50"
        >
          Desistir
        </button>
      </div>
    </div>
  );
};

const ConfirmarLiberar: React.FC<{
  job: JobSummary;
  emAndamento: boolean;
  onConfirmar: () => void;
  onDesistir: () => void;
}> = ({ job, emAndamento, onConfirmar, onDesistir }) => {
  const ref = useAlertDialog<HTMLDivElement>(onDesistir, emAndamento);
  return (
    <div ref={ref} role="alertdialog" aria-modal="true" aria-label={`confirmar liberar espaço de ${job.slug}`}
         className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm space-y-2">
      <p className="text-amber-200">
        Libera <strong>{tamanho(job.bytes_source + job.bytes_parts)}</strong> apagando o
        vídeo original{job.bytes_parts > 0 && " e as cópias do upload"}.
        Você continua podendo transcrever, fazer cortes manuais, editar textos,
        legendas e renderizar — mas
        <strong> Detectar pausas</strong> deixa de funcionar neste projeto, e a
        resolução original se perde.
      </p>
      <div className="flex gap-2">
        <button
          onClick={onConfirmar}
          disabled={emAndamento}
          className="px-3 py-1 bg-amber-800 rounded disabled:opacity-50"
        >
          Confirmar
        </button>
        <button
          onClick={onDesistir}
          disabled={emAndamento}
          className="px-3 py-1 bg-zinc-800 rounded disabled:opacity-50"
        >
          Desistir
        </button>
      </div>
    </div>
  );
};

// Uma linha por vez em modo de edição ou confirmação — duas confirmações
// destrutivas abertas ao mesmo tempo é convite para clicar na errada.
type Modo = { slug: string; tipo: "renomeando" | "excluindo" | "liberando" } | null;

export const ProjectsScreen: React.FC<{
  onOpen: (slug: string) => void;
  onNew: () => void;
}> = ({ onOpen, onNew }) => {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [rascunho, setRascunho] = useState("");
  // Slugs com uma ação destrutiva em curso — um Set, não um valor único: cada
  // linha guarda a si mesma, então a exclusão de A em voo não pode bloquear
  // silenciosamente a exclusão de B. É ref (não só state) de propósito: dois
  // cliques no mesmo evento (antes do repaint) veem o mesmo state até o
  // componente re-renderizar, mas a ref muda na hora — o segundo clique
  // precisa enxergar a mudança do primeiro imediatamente, não só depois do
  // próximo render. O state espelha a ref só para alimentar o `disabled`.
  const emAndamentoRef = useRef<Set<string>>(new Set());
  const [emAndamento, setEmAndamento] = useState<Set<string>>(new Set());

  const marcarEmAndamento = (slug: string) => {
    emAndamentoRef.current.add(slug);
    setEmAndamento(new Set(emAndamentoRef.current));
  };
  const desmarcarEmAndamento = (slug: string) => {
    emAndamentoRef.current.delete(slug);
    setEmAndamento(new Set(emAndamentoRef.current));
  };

  useEffect(() => {
    let vivo = true;
    listJobs()
      .then((l) => { if (vivo) setJobs(l); })
      .catch(() => { if (vivo) setErr("não consegui carregar os projetos"); });
    return () => { vivo = false; };
  }, []);

  type Tipo = "renomeando" | "excluindo" | "liberando";
  const emModo = (j: JobSummary, tipo: Tipo) =>
    modo?.slug === j.slug && modo?.tipo === tipo;
  // Qualquer modo (renomear ou uma das confirmações) — usado para esconder a
  // barra de ações e evitar dois blocos de UI concorrendo na mesma linha.
  const emAlgumModo = (j: JobSummary) => modo?.slug === j.slug;

  const salvarTitulo = async (j: JobSummary) => {
    const novo = rascunho.trim();
    setModo(null);
    setErr(null);
    try {
      await putTitle(j.slug, novo);
      setJobs((l) => (l ?? []).map((x) => (x.slug === j.slug ? { ...x, title: novo } : x)));
    } catch {
      setErr("não consegui salvar o nome");
    }
  };

  // Uma ação falhou e a lista pode não refletir mais o disco (um 409 de
  // "arquivo em uso" pode deixar a árvore parcialmente apagada) — recarrega
  // em vez de manter os metadados antigos, que deixariam o usuário clicar em
  // "Abrir" num projeto destruído pela metade. Se nem o reload funcionar
  // (backend fora do ar), mantém a lista anterior em vez de apagá-la.
  const recarregarAposFalha = async () => {
    try {
      setJobs(await listJobs());
    } catch {
      // sem sorte — a lista em tela fica desatualizada, mas visível
    }
  };

  const excluir = async (j: JobSummary) => {
    // Clique duplo no "Apagar mesmo assim" antes do repaint: o diálogo some
    // só depois do estado atualizar, então o segundo clique pode chegar
    // enquanto o botão ainda está na tela. A ref pega isso na hora — mas só
    // para ESTA linha: outra linha em voo não pode bloquear esta.
    if (emAndamentoRef.current.has(j.slug)) return;
    marcarEmAndamento(j.slug);
    setErr(null);
    try {
      await deleteJob(j.slug);
      setJobs((l) => (l ?? []).filter((x) => x.slug !== j.slug));
    } catch {
      setErr("não consegui apagar o projeto");
      await recarregarAposFalha();
    } finally {
      desmarcarEmAndamento(j.slug);
      // Incondicional fechava o diálogo aberto (e ainda não confirmado) de
      // outra linha: terminar a exclusão de A não pode fechar a confirmação
      // de B que o usuário abriu enquanto A ainda estava em voo.
      setModo((m) => (m?.slug === j.slug ? null : m));
    }
  };

  const liberar = async (j: JobSummary) => {
    if (emAndamentoRef.current.has(j.slug)) return;
    marcarEmAndamento(j.slug);
    setErr(null);
    try {
      await deleteSource(j.slug);
      setJobs((l) => (l ?? []).map((x) => (
        x.slug === j.slug
          ? {
              ...x,
              has_source: false,
              bytes_source: 0,
              bytes_parts: 0,
              // "Liberar espaço" agora apaga o source E as partes de upload
              // (input/<slug>-part*) — os dois somem de bytes_total juntos.
              bytes_total: x.bytes_total - x.bytes_source - x.bytes_parts,
            }
          : x
      )));
    } catch {
      setErr("não consegui liberar o espaço");
      await recarregarAposFalha();
    } finally {
      desmarcarEmAndamento(j.slug);
      setModo((m) => (m?.slug === j.slug ? null : m));
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Projetos</h1>
        <button onClick={onNew} className="px-4 py-2 bg-emerald-600 rounded font-medium">
          Novo projeto
        </button>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}

      {jobs && jobs.length === 0 && (
        <p className="text-zinc-400">Nenhum projeto ainda. Crie o primeiro para começar.</p>
      )}

      <ul className="space-y-2">
        {(jobs ?? []).map((j) => (
          <li key={j.slug} className="bg-zinc-900 border border-zinc-800 rounded p-4 space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                {emModo(j, "renomeando") ? (
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={`título de ${j.slug}`}
                      className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm"
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      placeholder={j.slug}
                    />
                    <button
                      aria-label={`salvar nome de ${j.slug}`}
                      onClick={() => salvarTitulo(j)}
                      className="px-3 py-1 bg-emerald-600 rounded text-sm"
                    >
                      Salvar
                    </button>
                    <button onClick={() => setModo(null)} className="px-3 py-1 bg-zinc-800 rounded text-sm">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-zinc-100 truncate">{j.title || j.slug}</p>
                    <p className="text-sm text-zinc-400">
                      {j.title ? `${j.slug} · ` : ""}
                      {LABEL_FORMATO[j.orientation] ?? j.orientation} · {progresso(j)}
                      {" · "}{tamanho(j.bytes_total)}
                      {/* bytes_render fica fora de bytes_total (sobrevive a excluir o
                          projeto) — mostrado à parte para não ser confundido com o que
                          "Liberar espaço"/"Excluir" realmente afetam. */}
                      {j.bytes_render > 0 && ` (+ ${tamanho(j.bytes_render)} exportado)`}
                      {quando(j.updated_at) && ` · ${quando(j.updated_at)}`}
                    </p>
                  </>
                )}
              </div>

              {!emAlgumModo(j) && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    aria-label={`abrir ${j.slug}`}
                    onClick={() => onOpen(j.slug)}
                    className="px-3 py-1 bg-zinc-800 rounded text-sm"
                  >
                    Abrir
                  </button>
                  <button
                    aria-label={`renomear ${j.slug}`}
                    onClick={() => { setRascunho(j.title); setModo({ slug: j.slug, tipo: "renomeando" }); }}
                    className="px-3 py-1 bg-zinc-800 rounded text-sm"
                  >
                    Renomear
                  </button>
                  {j.has_source && (
                    <button
                      aria-label={`liberar espaço de ${j.slug}`}
                      onClick={() => setModo({ slug: j.slug, tipo: "liberando" })}
                      className="px-3 py-1 bg-zinc-800 rounded text-sm"
                    >
                      Liberar espaço
                    </button>
                  )}
                  <button
                    aria-label={`excluir ${j.slug}`}
                    onClick={() => setModo({ slug: j.slug, tipo: "excluindo" })}
                    className="px-3 py-1 bg-zinc-800 rounded text-sm text-red-400"
                  >
                    Excluir
                  </button>
                </div>
              )}
            </div>

            {emModo(j, "excluindo") && (
              <ConfirmarExclusao
                job={j}
                emAndamento={emAndamento.has(j.slug)}
                onConfirmar={() => excluir(j)}
                onDesistir={() => setModo(null)}
              />
            )}

            {emModo(j, "liberando") && (
              <ConfirmarLiberar
                job={j}
                emAndamento={emAndamento.has(j.slug)}
                onConfirmar={() => liberar(j)}
                onDesistir={() => setModo(null)}
              />
            )}
          </li>
        ))}
      </ul>
    </main>
  );
};
