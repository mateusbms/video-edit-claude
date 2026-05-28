import type {
  CutParams, CutResult, Hook, JobState, CaptionLine, SSEEvent,
} from "./types";

const BASE = "/api";

async function jsonOrThrow<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let detail = r.statusText;
    try { detail = (await r.json()).detail ?? detail; } catch {}
    throw new Error(detail);
  }
  return r.json() as Promise<T>;
}

export async function uploadJob(file: File, slug: string): Promise<{ slug: string; probe: any }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("slug", slug);
  return jsonOrThrow(await fetch(`${BASE}/jobs`, { method: "POST", body: fd }));
}

export async function getJob(slug: string): Promise<JobState> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}`));
}

export async function runCut(slug: string, params: CutParams): Promise<CutResult> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/cut`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }));
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

export async function getHook(slug: string): Promise<Hook> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/hook`));
}

export async function putHook(slug: string, hook: Hook): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/hook`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(hook),
  }));
}

export async function runRecipe(slug: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/recipe`, { method: "POST" }));
}

export function stillUrl(slug: string, frame: number, format: "main16x9" | "vertical9x16"): string {
  return `${BASE}/jobs/${slug}/still?frame=${frame}&format=${format}`;
}

export function fileUrl(slug: string, name: string): string {
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
  if (!r.ok || !r.body) throw new Error(`SSE falhou (${r.status})`);
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
