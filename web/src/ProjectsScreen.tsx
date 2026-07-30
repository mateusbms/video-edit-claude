import { useEffect, useState } from "react";
import { listJobs } from "./api";
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

export const ProjectsScreen: React.FC<{
  onOpen: (slug: string) => void;
  onNew: () => void;
}> = ({ onOpen, onNew }) => {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listJobs()
      .then((l) => { if (vivo) setJobs(l); })
      .catch(() => { if (vivo) setErr("não consegui carregar os projetos"); });
    return () => { vivo = false; };
  }, []);

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Projetos</h1>
        <button
          onClick={onNew}
          className="px-4 py-2 bg-emerald-600 rounded font-medium"
        >
          Novo projeto
        </button>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}

      {jobs && jobs.length === 0 && (
        <p className="text-zinc-400">
          Nenhum projeto ainda. Crie o primeiro para começar.
        </p>
      )}

      <ul className="space-y-2">
        {(jobs ?? []).map((j) => (
          <li
            key={j.slug}
            className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded p-4"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-100 truncate">
                {j.title || j.slug}
              </p>
              <p className="text-sm text-zinc-400">
                {LABEL_FORMATO[j.orientation] ?? j.orientation} · {progresso(j)}
                {" · "}{tamanho(j.bytes_total)}
                {quando(j.updated_at) && ` · ${quando(j.updated_at)}`}
              </p>
            </div>
            <button
              aria-label={`abrir ${j.slug}`}
              onClick={() => onOpen(j.slug)}
              className="px-3 py-1 bg-zinc-800 rounded text-sm"
            >
              Abrir
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
};
