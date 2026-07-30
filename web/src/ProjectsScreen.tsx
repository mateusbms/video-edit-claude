import { useEffect, useState } from "react";
import { listJobs, putTitle, deleteJob, deleteSource } from "./api";
import type { JobSummary } from "./types";

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

  const salvarTitulo = async (j: JobSummary) => {
    const novo = rascunho.trim();
    setModo(null);
    try {
      await putTitle(j.slug, novo);
      setJobs((l) => (l ?? []).map((x) => (x.slug === j.slug ? { ...x, title: novo } : x)));
    } catch {
      setErr("não consegui salvar o nome");
    }
  };

  const excluir = async (j: JobSummary) => {
    setModo(null);
    try {
      await deleteJob(j.slug);
      setJobs((l) => (l ?? []).filter((x) => x.slug !== j.slug));
    } catch {
      setErr("não consegui apagar o projeto");
    }
  };

  const liberar = async (j: JobSummary) => {
    setModo(null);
    try {
      await deleteSource(j.slug);
      setJobs((l) => (l ?? []).map((x) => (
        x.slug === j.slug
          ? { ...x, has_source: false, bytes_source: 0, bytes_total: x.bytes_total - x.bytes_source }
          : x
      )));
    } catch {
      setErr("não consegui liberar o espaço");
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
                      {quando(j.updated_at) && ` · ${quando(j.updated_at)}`}
                    </p>
                  </>
                )}
              </div>

              {!emModo(j, "renomeando") && (
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
              <div role="alertdialog" aria-label={`confirmar exclusão de ${j.slug}`}
                   className="rounded border border-red-800 bg-red-950/40 p-3 text-sm space-y-2">
                <p className="text-red-200">
                  Apagar <strong>{j.title || j.slug}</strong> descarta o vídeo, o corte, a
                  transcrição e os textos. O vídeo já exportado é mantido.
                </p>
                <div className="flex gap-2">
                  <button
                    aria-label={`confirmar exclusão de ${j.slug}`}
                    onClick={() => excluir(j)}
                    className="px-3 py-1 bg-red-900 rounded"
                  >
                    Apagar mesmo assim
                  </button>
                  <button onClick={() => setModo(null)} className="px-3 py-1 bg-zinc-800 rounded">
                    Desistir
                  </button>
                </div>
              </div>
            )}

            {emModo(j, "liberando") && (
              <div role="alertdialog" aria-label={`confirmar liberar espaço de ${j.slug}`}
                   className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm space-y-2">
                <p className="text-amber-200">
                  Libera <strong>{tamanho(j.bytes_source)}</strong> apagando o vídeo original.
                  Você continua podendo editar textos, legendas e renderizar — mas
                  <strong> Detectar pausas</strong> deixa de funcionar neste projeto, e a
                  resolução original se perde.
                </p>
                <div className="flex gap-2">
                  <button
                    aria-label={`confirmar liberar espaço de ${j.slug}`}
                    onClick={() => liberar(j)}
                    className="px-3 py-1 bg-amber-800 rounded"
                  >
                    Confirmar
                  </button>
                  <button onClick={() => setModo(null)} className="px-3 py-1 bg-zinc-800 rounded">
                    Desistir
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
};
