import type {
  Hook, JobState, CaptionLine, CutResult, SSEEvent, Overlay, JobSummary,
} from "./types";
import type { Suggestion, SuggestDefaults } from "./suggestions";

const BASE = "/api";

async function jsonOrThrow<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let detail = r.statusText;
    try { detail = (await r.json()).detail ?? detail; } catch {}
    throw new Error(detail);
  }
  return r.json() as Promise<T>;
}

/** O slug já tem trabalho e o upload não foi confirmado como sobrescrita. */
export class SlugOcupado extends Error {
  constructor(readonly existente: JobSummary) {
    super(`o projeto ${existente.slug} já existe`);
    this.name = "SlugOcupado";
  }
}

export async function listJobs(): Promise<JobSummary[]> {
  return jsonOrThrow(await fetch(`${BASE}/jobs`));
}

export async function uploadJob(
  files: File[], slug: string, overwrite = false, papel: "normal" | "matriz" = "normal",
): Promise<{ slug: string; probe: any }> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("slug", slug);
  fd.append("overwrite", String(overwrite));
  fd.append("papel", papel);
  const r = await fetch(`${BASE}/jobs`, { method: "POST", body: fd });
  // 409 não é erro de rede: é a pergunta "sobrescrever?" e vem com o projeto
  // existente no corpo, para a tela montar o diálogo sem outra chamada.
  if (r.status === 409) {
    const body = await r.json();
    throw new SlugOcupado(body.detail as JobSummary);
  }
  return jsonOrThrow(r);
}

export async function getJob(slug: string): Promise<JobState> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}`));
}

/** Estado do corte para o passo 2 remontar. `null` = ainda não cortou. */
export async function getCuts(slug: string): Promise<CutResult | null> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/cuts`));
}

export async function getTranscript(slug: string): Promise<CaptionLine[]> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/transcript`));
}

export async function putTranscript(slug: string, lines: CaptionLine[]): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/transcript`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lines),
  }));
}

export async function putCaptionStyle(slug: string, style: any): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/caption-style`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(style),
  }));
}

export async function putBrandKit(slug: string, kitSlug: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/brand-kit`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: kitSlug }),
  }));
}

export async function putOrientation(slug: string, orientation: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/orientation`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orientation }),
  }));
}

export async function putTitle(slug: string, title: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/title`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }));
}

export async function deleteJob(slug: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}`, { method: "DELETE" }));
}

export async function deleteSource(slug: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/source`, { method: "DELETE" }));
}

export async function getHook(slug: string): Promise<Hook> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/hook`));
}

export async function putHook(slug: string, hook: Hook): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/hook`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(hook),
  }));
}

export async function getOverlays(slug: string): Promise<Overlay[]> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/overlays`));
}

export async function putOverlays(slug: string, overlays: Overlay[]): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/overlays`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(overlays),
  }));
}

export async function getSuggestions(slug: string): Promise<Suggestion[]> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/suggestions`));
}

export async function putSuggestions(slug: string, items: Suggestion[]): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/suggestions`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  }));
}

export async function getSuggestDefaults(slug: string): Promise<SuggestDefaults> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/suggest-defaults`));
}

export async function putSuggestDefaults(slug: string, d: SuggestDefaults): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/suggest-defaults`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  }));
}

// Dispara a geração de sugestões pelo `claude` local (backend chama o CLI).
// Devolve a lista já validada; o painel popula direto, sem novo GET.
export async function generateSuggestions(slug: string): Promise<Suggestion[]> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/suggest`, { method: "POST" }));
}

export async function runRecipe(slug: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/recipe`, { method: "POST" }));
}

// Cria uma variação do projeto matriz `slug` a partir de um novo clipe de
// hook: o backend funde hook+corpo, desloca transcrição/overlays e devolve
// (via SSE) o novo projeto pronto para abrir no passo do texto do hook.
export function createVariant(
  slug: string, file: File, novoSlug: string,
  handlers: Parameters<typeof streamSSE>[2],
): Promise<void> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("novo_slug", novoSlug);
  return streamSSE(`${BASE}/jobs/${slug}/variants`, { method: "POST", body: fd }, handlers);
}

// o formato vem da orientação do job, não da query — GET /still não aceita mais `format`
export function stillUrl(slug: string, frame: number): string {
  return `${BASE}/jobs/${slug}/still?frame=${frame}`;
}

export function fileUrl(slug: string, name: string): string {
  return `${BASE}/jobs/${slug}/files/${name}`;
}

export function mediaUrl(slug: string, name: string): string {
  return `${BASE}/jobs/${slug}/files/${name}`;
}

/** Parser puro de chunk SSE — exportado para teste. */
export function parseSSEChunk(chunk: string): SSEEvent[] {
  const out: SSEEvent[] = [];
  for (const raw of chunk.split("\n\n")) {
    if (!raw.trim()) continue;
    let event = "message"; let data = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) continue;
    try { out.push({ event, data: JSON.parse(data) } as SSEEvent); }
    catch { /* ignora data não-JSON */ }
  }
  return out;
}

/** Consome um endpoint SSE via fetch+stream. */
export async function streamSSE(
  url: string,
  opts: RequestInit,
  on: { progress?: (d: any) => void; done?: (d: any) => void; error?: (d: any) => void },
): Promise<void> {
  const r = await fetch(url, opts);
  if (!r.ok) {
    // O corpo do erro (ex.: o 409 de "sem vídeo original") é JSON com
    // `detail`, igual ao resto da API — sem ler, a tela mostra só o status
    // HTTP, e a mensagem cuidadosa que o backend escreveu nunca chega.
    let detail = `SSE falhou (${r.status})`;
    try {
      const body = await r.json();
      if (body?.detail) detail = body.detail;
    } catch { /* corpo não é JSON utilizável: mantém a mensagem de status */ }
    throw new Error(detail);
  }
  if (!r.body) throw new Error(`SSE falhou (${r.status})`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const sepIdx = buffer.lastIndexOf("\n\n");
    if (sepIdx === -1) continue;
    const ready = buffer.slice(0, sepIdx + 2);
    buffer = buffer.slice(sepIdx + 2);
    for (const ev of parseSSEChunk(ready)) {
      if (ev.event === "progress") on.progress?.(ev.data);
      else if (ev.event === "done") on.done?.(ev.data);
      else if (ev.event === "error") on.error?.(ev.data);
    }
  }
}
