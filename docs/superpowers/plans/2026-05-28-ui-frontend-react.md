# UI Local — Frontend React/Vite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o wizard de 5 telas (Upload → Cortes → Transcrição → Hook → Render) em React/Vite/Tailwind, consumindo a API do Plano A. Após `npm run build`, o backend serve a SPA em `localhost:8000`.

**Architecture:** Vite + React 19 + Tailwind 4. Roteamento simples por step (estado local — não SPA router pesado). Comunicação com a API via `fetch` (JSON) e `EventSource` (SSE) num módulo `api.ts` único. Estado do job persistido em `localStorage` (último slug + step). Lógica pura (parser SSE, validações, sugestões locais) testada com vitest.

**Tech Stack:** React 19, Vite 6, TypeScript, Tailwind v4 (zero-config), vitest, @testing-library/react (opcional).

**Pré-requisitos:** Plano A (backend) implementado. Rotas funcionando em `localhost:8000`.

---

## File Structure

```
web/
  package.json, vite.config.ts, tsconfig.json, tailwind.config.ts, index.html
  src/
    main.tsx               # bootstrap
    App.tsx                # roteador por step + Stepper
    index.css              # tailwind directives
    types.ts               # tipos espelhando pydantic
    api.ts                 # client HTTP + SSE
    state.ts               # localStorage do slug/step
    util.ts                # helpers pequenos (formatTime, etc.)
    steps/
      UploadStep.tsx
      CutsStep.tsx
      TranscriptStep.tsx
      HookStep.tsx
      RenderStep.tsx
    components/
      Stepper.tsx
      Slider.tsx
      Field.tsx           # label + input
      ProgressBar.tsx
      Toast.tsx
      VideoPlayer.tsx
    __tests__/
      api.test.ts          # parser SSE
      state.test.ts
      util.test.ts
```

---

## Task 1: Scaffold Vite + Tailwind + tsconfig + smoke

**Files:** todos os de configuração + `web/src/main.tsx`, `web/src/App.tsx`, `web/src/index.css`, `web/index.html`.

- [ ] **Step 1: Criar diretório e package.json**

`web/package.json`:
```json
{
  "name": "video-edit-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Instalar dependências (na pasta web/)**

Run (com node de `.tools/`):
```bash
export PATH="$(pwd)/.tools/node-v22.11.0-darwin-arm64/bin:$PATH"
cd web
npm install react react-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom vitest tailwindcss @tailwindcss/vite
```
Expected: instala sem erro.

- [ ] **Step 3: Configurar tsconfig.json**

`web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: vite.config.ts com proxy /api**

`web/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  build: { outDir: "dist" },
});
```

- [ ] **Step 5: index.html + main.tsx + App.tsx + index.css**

`web/index.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Edit Local</title>
  </head>
  <body class="bg-zinc-950 text-zinc-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/index.css`:
```css
@import "tailwindcss";
```

`web/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`web/src/App.tsx`:
```tsx
export const App = () => (
  <main className="min-h-screen p-8 max-w-4xl mx-auto">
    <h1 className="text-3xl font-semibold">Edit Local</h1>
    <p className="mt-2 text-zinc-400">UI em construção.</p>
  </main>
);
```

- [ ] **Step 6: Build smoke**

```bash
cd web && npm run build
```
Expected: gera `dist/index.html` e `dist/assets/*` sem erro.

- [ ] **Step 7: Commit**

```bash
cd ..
git add web/package.json web/package-lock.json web/tsconfig.json web/vite.config.ts web/index.html web/src/main.tsx web/src/App.tsx web/src/index.css
git commit -m "feat(web): scaffold Vite + React + Tailwind"
```

(Trailer: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`)

---

## Task 2: types.ts + api.ts + parser SSE (com vitest)

**Files:** `web/src/types.ts`, `web/src/api.ts`, `web/src/__tests__/api.test.ts`.

- [ ] **Step 1: types.ts**

`web/src/types.ts`:
```ts
export type Probe = { width: number; height: number; fps: number; duration: number };

export type CutParams = {
  silence_threshold_db: number;
  padding: number;
  min_silence: number;
};

export type Word = { word: string; start: number; end: number };
export type CaptionLine = { text: string; start: number; end: number; words: Word[] };

export type Hook = { title: string; subtitle: string; duration_frames: number };

export type CutSegment = { start: number; end: number };

export type CutResult = {
  original_duration: number;
  trimmed_duration: number;
  segments: CutSegment[];
};

export type JobState = {
  slug: string;
  probe: Probe | null;
  config: CutParams;
  has_trimmed: boolean;
  has_transcript: boolean;
  has_hook: boolean;
  has_recipe: boolean;
  has_render_16x9: boolean;
  has_render_9x16: boolean;
};

export type SSEEvent =
  | { event: "progress"; data: { stage?: string; format?: string; n?: number; total?: number } }
  | { event: "done"; data: { ok: true } }
  | { event: "error"; data: { detail: string } };
```

- [ ] **Step 2: Test parser SSE**

`web/src/__tests__/api.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseSSEChunk } from "../api";

describe("parseSSEChunk", () => {
  it("decodifica event+data", () => {
    const out = parseSSEChunk('event: progress\ndata: {"n":1,"total":10}\n\n');
    expect(out).toEqual([
      { event: "progress", data: { n: 1, total: 10 } },
    ]);
  });

  it("decodifica vários eventos numa mesma chunk", () => {
    const out = parseSSEChunk(
      'event: progress\ndata: {"n":1,"total":10}\n\nevent: done\ndata: {"ok":true}\n\n',
    );
    expect(out.length).toBe(2);
    expect(out[1].event).toBe("done");
  });

  it("ignora linhas incompletas (sem data)", () => {
    const out = parseSSEChunk("event: progress\n\n");
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd web && npx vitest run`
Expected: FAIL — `../api` não exporta `parseSSEChunk`.

- [ ] **Step 4: api.ts (HTTP + SSE)**

`web/src/api.ts`:
```ts
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
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd web && npx vitest run`
Expected: 3 PASS.

- [ ] **Step 6: Commit**

```bash
cd ..
git add web/src/types.ts web/src/api.ts web/src/__tests__/api.test.ts
git commit -m "feat(web): types + api client + parser SSE (vitest)"
```

---

## Task 3: state.ts + util.ts (com testes)

**Files:** `web/src/state.ts`, `web/src/util.ts`, `web/src/__tests__/state.test.ts`, `web/src/__tests__/util.test.ts`.

- [ ] **Step 1: Testes**

`web/src/__tests__/state.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadState, saveState, defaultState } from "../state";

beforeEach(() => localStorage.clear());

describe("state", () => {
  it("retorna defaults se nada salvo", () => {
    expect(loadState()).toEqual(defaultState);
  });
  it("salva e recarrega", () => {
    saveState({ slug: "abc", step: 3 });
    expect(loadState()).toEqual({ slug: "abc", step: 3 });
  });
});
```

`web/src/__tests__/util.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { formatSeconds, percentage } from "../util";

describe("util", () => {
  it("formatSeconds mostra mm:ss", () => {
    expect(formatSeconds(75)).toBe("01:15");
    expect(formatSeconds(3)).toBe("00:03");
  });
  it("percentage clamp 0-100 e arredonda", () => {
    expect(percentage(50, 100)).toBe(50);
    expect(percentage(0, 0)).toBe(0);
    expect(percentage(150, 100)).toBe(100);
  });
});
```

- [ ] **Step 2: Falha (Cannot find module).**

- [ ] **Step 3: Implementar**

`web/src/util.ts`:
```ts
export function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s - m * 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function percentage(n: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((n / total) * 100)));
}
```

`web/src/state.ts`:
```ts
export type AppState = { slug: string; step: number };
export const defaultState: AppState = { slug: "", step: 0 };
const KEY = "edit-local:state";

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...(JSON.parse(raw) as AppState) };
  } catch {
    return defaultState;
  }
}

export function saveState(s: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearState(): void {
  localStorage.removeItem(KEY);
}
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit**

```bash
git add web/src/state.ts web/src/util.ts web/src/__tests__/state.test.ts web/src/__tests__/util.test.ts
git commit -m "feat(web): state (localStorage) + util (TDD)"
```

---

## Task 4: Stepper + App com roteamento por step

**Files:** `web/src/components/Stepper.tsx`, modify `web/src/App.tsx`.

- [ ] **Step 1: Stepper.tsx**

`web/src/components/Stepper.tsx`:
```tsx
const STEPS = ["Upload", "Cortes", "Transcrição", "Hook", "Render"];

export const Stepper: React.FC<{ step: number; onJump: (s: number) => void }> = ({ step, onJump }) => (
  <ol className="flex gap-2 mb-8">
    {STEPS.map((label, i) => {
      const done = i < step;
      const current = i === step;
      return (
        <li key={label} className="flex-1">
          <button
            onClick={() => i <= step && onJump(i)}
            disabled={i > step}
            className={[
              "w-full px-3 py-2 rounded text-sm font-medium",
              current ? "bg-emerald-600 text-white" :
              done ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700" :
              "bg-zinc-900 text-zinc-500 cursor-not-allowed",
            ].join(" ")}
          >
            {i + 1}. {label}
          </button>
        </li>
      );
    })}
  </ol>
);
```

- [ ] **Step 2: App.tsx com roteamento por estado**

`web/src/App.tsx`:
```tsx
import { useEffect, useState } from "react";
import { Stepper } from "./components/Stepper";
import { loadState, saveState } from "./state";
import { UploadStep } from "./steps/UploadStep";
import { CutsStep } from "./steps/CutsStep";
import { TranscriptStep } from "./steps/TranscriptStep";
import { HookStep } from "./steps/HookStep";
import { RenderStep } from "./steps/RenderStep";

export type StepProps = {
  slug: string; setSlug: (s: string) => void;
  next: () => void; back: () => void;
};

export const App = () => {
  const initial = loadState();
  const [slug, setSlug] = useState(initial.slug);
  const [step, setStep] = useState(initial.step);

  useEffect(() => { saveState({ slug, step }); }, [slug, step]);

  const next = () => setStep((s) => Math.min(4, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const Steps = [UploadStep, CutsStep, TranscriptStep, HookStep, RenderStep];
  const Current = Steps[step];

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6">Edit Local</h1>
      <Stepper step={step} onJump={setStep} />
      <Current slug={slug} setSlug={setSlug} next={next} back={back} />
    </main>
  );
};
```

- [ ] **Step 3: Stubs vazios dos steps (pra build não quebrar)**

Criar cada um dos 5 arquivos em `web/src/steps/`. Conteúdo idêntico exceto pelo nome do componente:

`web/src/steps/UploadStep.tsx`:
```tsx
import type { StepProps } from "../App";
export const UploadStep: React.FC<StepProps> = () => <div>Upload (TODO)</div>;
```

`web/src/steps/CutsStep.tsx`:
```tsx
import type { StepProps } from "../App";
export const CutsStep: React.FC<StepProps> = () => <div>Cortes (TODO)</div>;
```

`web/src/steps/TranscriptStep.tsx`:
```tsx
import type { StepProps } from "../App";
export const TranscriptStep: React.FC<StepProps> = () => <div>Transcrição (TODO)</div>;
```

`web/src/steps/HookStep.tsx`:
```tsx
import type { StepProps } from "../App";
export const HookStep: React.FC<StepProps> = () => <div>Hook (TODO)</div>;
```

`web/src/steps/RenderStep.tsx`:
```tsx
import type { StepProps } from "../App";
export const RenderStep: React.FC<StepProps> = () => <div>Render (TODO)</div>;
```

- [ ] **Step 4: Build**

```bash
cd web && npm run build
```
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
cd ..
git add web/src/App.tsx web/src/components/Stepper.tsx web/src/steps/
git commit -m "feat(web): Stepper + App com roteamento por step (stubs)"
```

---

## Task 5: UploadStep

**Files:** `web/src/steps/UploadStep.tsx`.

- [ ] **Step 1: Implementar**

```tsx
import { useState } from "react";
import { uploadJob } from "../api";
import { formatSeconds } from "../util";
import type { StepProps } from "../App";

type Probe = { width: number; height: number; fps: number; duration: number };

export const UploadStep: React.FC<StepProps> = ({ slug, setSlug, next }) => {
  const [file, setFile] = useState<File | null>(null);
  const [localSlug, setLocalSlug] = useState(slug || "video1");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onUpload = async () => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const r = await uploadJob(file, localSlug);
      setSlug(r.slug); setProbe(r.probe);
    } catch (e: any) {
      setErr(e.message ?? "erro no upload");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">1. Subir o vídeo</h2>
      <label className="block">
        <span className="text-sm text-zinc-400">Nome do projeto (slug)</span>
        <input
          className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={localSlug} onChange={(e) => setLocalSlug(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-400">Arquivo de vídeo</span>
        <input
          type="file" accept="video/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 block"
        />
      </label>
      <button
        onClick={onUpload} disabled={!file || busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40"
      >
        {busy ? "Enviando..." : "Enviar"}
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
```

- [ ] **Step 2: Build**

```bash
cd web && npm run build
```
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
cd ..
git add web/src/steps/UploadStep.tsx
git commit -m "feat(web): UploadStep (upload + probe)"
```

---

## Task 6: CutsStep

**Files:** `web/src/steps/CutsStep.tsx`, `web/src/components/Slider.tsx`.

- [ ] **Step 1: Slider component**

`web/src/components/Slider.tsx`:
```tsx
export const Slider: React.FC<{
  label: string; value: number; min: number; max: number; step: number;
  onChange: (n: number) => void; format?: (n: number) => string;
}> = ({ label, value, min, max, step, onChange, format }) => (
  <label className="block">
    <div className="flex justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-mono">{format ? format(value) : value}</span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full"
    />
  </label>
);
```

- [ ] **Step 2: CutsStep**

`web/src/steps/CutsStep.tsx`:
```tsx
import { useState } from "react";
import { runCut } from "../api";
import { Slider } from "../components/Slider";
import { formatSeconds, percentage } from "../util";
import type { CutResult, CutParams } from "../types";

import type { StepProps } from "../App";

export const CutsStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [params, setParams] = useState<CutParams>({
    silence_threshold_db: -30, padding: 0.1, min_silence: 0.5,
  });
  const [result, setResult] = useState<CutResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onCut = async () => {
    setBusy(true); setErr(null);
    try { setResult(await runCut(slug, params)); }
    catch (e: any) { setErr(e.message); }
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
      <button onClick={onCut} disabled={busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy ? "Detectando..." : "Detectar pausas"}
      </button>
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
              const parts: JSX.Element[] = [];
              result.segments.forEach((s, i) => {
                if (s.start > cursor) {
                  parts.push(<div key={`g${i}`} style={{ width: `${((s.start - cursor) / total) * 100}%` }} className="bg-zinc-700" />);
                }
                parts.push(<div key={`s${i}`} style={{ width: `${((s.end - s.start) / total) * 100}%` }} className="bg-emerald-500" />);
                cursor = s.end;
              });
              if (cursor < total) parts.push(<div key="end" style={{ width: `${((total - cursor) / total) * 100}%` }} className="bg-zinc-700" />);
              return parts;
            })()}
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
```

- [ ] **Step 3: Build.**

- [ ] **Step 4: Commit**

```bash
git add web/src/steps/CutsStep.tsx web/src/components/Slider.tsx
git commit -m "feat(web): CutsStep com sliders e régua visual"
```

---

## Task 7: TranscriptStep

**Files:** `web/src/steps/TranscriptStep.tsx`.

- [ ] **Step 1: Implementar**

```tsx
import { useEffect, useState } from "react";
import { getTranscript, putTranscript, streamSSE } from "../api";
import type { CaptionLine } from "../types";

import type { StepProps } from "../App";

export const TranscriptStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [model, setModel] = useState("small");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [lines, setLines] = useState<CaptionLine[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ao montar, tenta carregar transcript existente
  useEffect(() => {
    getTranscript(slug).then(setLines).catch(() => {});
  }, [slug]);

  const transcribe = async () => {
    setBusy(true); setErr(null); setStage("solicitado");
    try {
      await streamSSE(`/api/jobs/${slug}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_size: model, language: "pt" }),
      }, {
        progress: (d) => setStage(d.stage ?? "processando"),
        done: async () => { setLines(await getTranscript(slug)); },
        error: (d) => setErr(d.detail ?? "erro na transcrição"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); setStage(""); }
  };

  const editWord = (li: number, wi: number, val: string) => {
    if (!lines) return;
    const copy = lines.map(l => ({ ...l, words: [...l.words] }));
    copy[li].words[wi] = { ...copy[li].words[wi], word: val };
    copy[li].text = copy[li].words.map(w => w.word).join(" ");
    setLines(copy);
  };

  const save = async () => {
    if (!lines) return;
    await putTranscript(slug, lines);
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">3. Transcrição</h2>
      <div className="flex gap-2 items-end">
        <label className="block">
          <span className="text-sm text-zinc-400">Modelo</span>
          <select className="block bg-zinc-900 border border-zinc-800 rounded px-2 py-2"
            value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="tiny">tiny (rápido)</option>
            <option value="base">base</option>
            <option value="small">small (padrão)</option>
            <option value="medium">medium (melhor)</option>
          </select>
        </label>
        <button onClick={transcribe} disabled={busy}
          className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
          {busy ? `Transcrevendo... ${stage}` : "Transcrever"}
        </button>
      </div>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {lines && (
        <div className="space-y-3 max-h-[50vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded p-4">
          {lines.map((l, li) => (
            <div key={li} className="flex flex-wrap gap-1 items-baseline">
              <span className="text-xs text-zinc-500 font-mono mr-2">{l.start.toFixed(1)}s</span>
              {l.words.map((w, wi) => (
                <input
                  key={wi} value={w.word} onChange={(e) => editWord(li, wi, e.target.value)}
                  onBlur={save}
                  className="bg-transparent border-b border-zinc-700 focus:border-emerald-500 outline-none px-1"
                  style={{ width: `${Math.max(2, w.word.length)}ch` }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="pt-4 flex justify-between">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
        <button onClick={next} disabled={!lines} className="px-4 py-2 bg-zinc-800 rounded disabled:opacity-40">Próximo →</button>
      </div>
    </section>
  );
};
```

- [ ] **Step 2: Build.**

- [ ] **Step 3: Commit**

```bash
git add web/src/steps/TranscriptStep.tsx
git commit -m "feat(web): TranscriptStep (SSE de progresso + edit palavra-a-palavra)"
```

---

## Task 8: HookStep com prévia ao vivo

**Files:** `web/src/steps/HookStep.tsx`.

- [ ] **Step 1: Implementar**

```tsx
import { useEffect, useState } from "react";
import { getHook, putHook, runRecipe, stillUrl } from "../api";
import type { Hook } from "../types";

import type { StepProps } from "../App";

export const HookStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [hook, setHook] = useState<Hook>({ title: "", subtitle: "", duration_frames: 90 });
  const [imgKey, setImgKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { getHook(slug).then(setHook).catch(() => {}); }, [slug]);

  // Debounce: a cada mudança, salva + rebuild a recipe + força refresh do still
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        await putHook(slug, hook);
        await runRecipe(slug);
        setImgKey(k => k + 1);
      } catch (e: any) { setErr(e.message); }
    }, 700);
    return () => clearTimeout(t);
  }, [hook, slug]);

  const goNext = async () => {
    setBusy(true);
    try { await putHook(slug, hook); await runRecipe(slug); next(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">4. Hook (abertura)</h2>
      <label className="block">
        <span className="text-sm text-zinc-400">Título</span>
        <input className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={hook.title} onChange={(e) => setHook({ ...hook, title: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-400">Subtítulo</span>
        <input className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={hook.subtitle} onChange={(e) => setHook({ ...hook, subtitle: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-400">Duração do card (frames a 30fps)</span>
        <input type="number" className="mt-1 block w-32 bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={hook.duration_frames}
          onChange={(e) => setHook({ ...hook, duration_frames: Number(e.target.value) })} />
      </label>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div>
        <p className="text-sm text-zinc-400 mb-2">Prévia (atualiza ~1s após você parar de digitar):</p>
        <img
          key={imgKey} src={`${stillUrl(slug, 30, "main16x9")}&_=${imgKey}`}
          alt="prévia"
          className="rounded border border-zinc-800 w-full max-w-2xl"
        />
      </div>
      <div className="pt-4 flex justify-between">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
        <button onClick={goNext} disabled={busy} className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
          {busy ? "Salvando..." : "Próximo →"}
        </button>
      </div>
    </section>
  );
};
```

- [ ] **Step 2: Build.**

- [ ] **Step 3: Commit**

```bash
git add web/src/steps/HookStep.tsx
git commit -m "feat(web): HookStep com prévia ao vivo (still on-demand)"
```

---

## Task 9: RenderStep com SSE de progresso

**Files:** `web/src/steps/RenderStep.tsx`, `web/src/components/ProgressBar.tsx`.

- [ ] **Step 1: ProgressBar**

`web/src/components/ProgressBar.tsx`:
```tsx
export const ProgressBar: React.FC<{ label: string; n: number; total: number }> = ({ label, n, total }) => {
  const pct = total > 0 ? Math.min(100, Math.round((n / total) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono">{n}/{total} ({pct}%)</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded overflow-hidden">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
```

- [ ] **Step 2: RenderStep**

```tsx
import { useState } from "react";
import { streamSSE, fileUrl } from "../api";
import { ProgressBar } from "../components/ProgressBar";

import type { StepProps } from "../App";

export const RenderStep: React.FC<StepProps> = ({ slug, back }) => {
  const [prog, setProg] = useState<Record<string, { n: number; total: number }>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const render = async () => {
    setBusy(true); setErr(null); setDone(false); setProg({});
    try {
      await streamSSE(`/api/jobs/${slug}/render`, { method: "POST" }, {
        progress: (d) => {
          if (d.format && d.n != null && d.total != null) {
            setProg(prev => ({ ...prev, [d.format]: { n: d.n, total: d.total } }));
          }
        },
        done: () => setDone(true),
        error: (d) => setErr(d.detail ?? "erro no render"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">5. Renderizar</h2>
      <button onClick={render} disabled={busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy ? "Renderizando..." : "Renderizar 16:9 + 9:16"}
      </button>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="space-y-3">
        {prog["Main16x9"] && <ProgressBar label="16:9" n={prog["Main16x9"].n} total={prog["Main16x9"].total} />}
        {prog["Vertical9x16"] && <ProgressBar label="9:16" n={prog["Vertical9x16"].n} total={prog["Vertical9x16"].total} />}
      </div>
      {done && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-zinc-400 mb-1">16:9</p>
            <video controls src={fileUrl(slug, `${slug}-16x9.mp4`)} className="w-full rounded" />
            <a href={fileUrl(slug, `${slug}-16x9.mp4`)} download
               className="inline-block mt-2 px-3 py-1 bg-zinc-800 rounded text-sm">Baixar</a>
          </div>
          <div>
            <p className="text-sm text-zinc-400 mb-1">9:16</p>
            <video controls src={fileUrl(slug, `${slug}-9x16.mp4`)} className="w-full rounded" />
            <a href={fileUrl(slug, `${slug}-9x16.mp4`)} download
               className="inline-block mt-2 px-3 py-1 bg-zinc-800 rounded text-sm">Baixar</a>
          </div>
        </div>
      )}
      <div className="pt-4">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
      </div>
    </section>
  );
};
```

- [ ] **Step 3: Build.**

- [ ] **Step 4: Commit**

```bash
git add web/src/steps/RenderStep.tsx web/src/components/ProgressBar.tsx
git commit -m "feat(web): RenderStep (SSE de progresso + players + download)"
```

---

## Task 10: Smoke end-to-end (boot + visita)

**Files:** nenhum novo (verificação).

- [ ] **Step 1: Build do front + boot do servidor**

```bash
./scripts/ui.sh &
sleep 5
```

- [ ] **Step 2: Verificar que a SPA serve**

```bash
curl -sf http://localhost:8000 | grep -q '<div id="root">'
curl -sf http://localhost:8000/api/health
kill %1
```
Expected: index.html servido contém `<div id="root">`; `/api/health` retorna `{"status":"ok"}`.

- [ ] **Step 3: Verificação visual (manual)**

Abrir `http://localhost:8000` no Simple Browser do Cursor (`Cmd+Shift+P → Simple Browser: Show`).
Conferir:
- Stepper aparece com 5 itens, "1. Upload" em verde.
- UploadStep mostra inputs e botão.
- Avançar usando o vídeo `input/unzipped/IMG_5509.MOV` (ou um curto qualquer) — passa em cada step até gerar render.

Se alguma tela não funcionar como esperado, voltar à task correspondente e ajustar.

- [ ] **Step 4: Commit (se houve qualquer ajuste no caminho)**

```bash
git status  # se mudou algo, commit; caso contrário pular
```

---

## Self-Review (resultado)

- **Cobertura do spec:** As 5 telas do wizard estão na implementação (Tasks 5–9). O Stepper (Task 4) e o roteamento estão. SSE de progresso no transcribe (Task 7) e no render (Task 9). Sugestão automática do hook é entregue pelo backend (Task 9 do Plano A: `GET /hook` retorna sugestão se não há `hook.json`); a UI consome em `getHook` no `useEffect` da Task 8. Persistência de slug/step via `state.ts` (Task 3). Boot via `scripts/ui.sh` (já criado no Plano A Task 15), servindo a SPA buildada.
- **Placeholders:** nenhum.
- **Consistência:** tipos `CutParams`, `CaptionLine`, `Hook`, `JobState`, `SSEEvent` definidos em `types.ts` e usados consistentes em todas as telas e em `api.ts`. URLs (`/api/...`) idênticas ao Plano A.
- **Verificação visual vs TDD:** a lógica pura (`parseSSEChunk`, `formatSeconds`, `percentage`, `loadState/saveState`) é testada com vitest. Os componentes visuais são verificados manualmente no Task 10 (smoke). Isso é proporcional — UI pura visual com Tailwind não rende ROI alto em testes unitários.
- **Nota:** o front foi escrito assumindo que o backend está rodando em `localhost:8000` (proxy no `vite dev` e servido junto pelo FastAPI em prod). Em produção (Coolify), a mesma SPA sobe junto com a API no mesmo container — sem mudanças no código.
