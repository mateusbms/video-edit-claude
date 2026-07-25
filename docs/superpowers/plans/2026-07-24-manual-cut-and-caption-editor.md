# Manual Fine-Cut + Caption Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (0) corrigir o `state.test.ts`; (1) corte manual fino sobre o vídeo já cortado; (2) editor de legendas mais legível.

**Architecture:** O corte manual re-corta o `trimmed.mp4` removendo trechos marcados no player (tempo do vídeo cortado), via um novo endpoint SSE `/refine` que reusa `cut_segments` + `run_with_progress`. O editor de legendas é só melhoria de layout. O fix do teste é um polyfill de localStorage no setup.

**Tech Stack:** Python/FastAPI/ffmpeg; React 19/Vite/Vitest.

---

## Task 1: fix `state.test.ts` (polyfill localStorage)

**Files:** Modify `web/src/test-setup.ts`.

- [ ] **Step 1: run the failing tests** — `cd web && npx vitest run src/__tests__/state.test.ts`
Expected: FAIL (4 tests) — `localStorage` indisponível.

- [ ] **Step 2: implement** — em `web/src/test-setup.ts`, adicione ANTES de tudo (ou após os imports) um polyfill in-memory que sempre define `localStorage`:

```ts
class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
}
Object.defineProperty(globalThis, "localStorage", {
  value: new MemStorage(), writable: true, configurable: true,
});
```
(Mantenha o `import "@testing-library/jest-dom/vitest";` e o `afterEach(cleanup)` que já existem.)

- [ ] **Step 3: verify** — `cd web && npx vitest run src/__tests__/state.test.ts`
Expected: PASS (4 passed).

- [ ] **Step 4: commit**

```bash
git add web/src/test-setup.ts
git commit -m "test(web): in-memory localStorage polyfill fixes state tests"
```

---

## Task 2: backend do corte manual (`invert_ranges` + `stage_refine` + `/refine`)

**Files:** Modify `pipeline/silence.py`, `pipeline/stages.py`, `api/models.py`, `api/routes.py`. Tests: `tests/test_silence.py`, `tests/test_refine_sse.py`.

- [ ] **Step 1: failing test (invert_ranges)** — add to `tests/test_silence.py`:

```python
from pipeline.silence import invert_ranges, Segment


def test_invert_ranges_middle():
    keep = invert_ranges([Segment(1.0, 2.0)], 3.0)
    assert [(s.start, s.end) for s in keep] == [(0.0, 1.0), (2.0, 3.0)]


def test_invert_ranges_empty_keeps_all():
    keep = invert_ranges([], 3.0)
    assert [(s.start, s.end) for s in keep] == [(0.0, 3.0)]


def test_invert_ranges_overlap_merged():
    keep = invert_ranges([Segment(1.0, 2.0), Segment(1.5, 2.5)], 3.0)
    assert [(s.start, s.end) for s in keep] == [(0.0, 1.0), (2.5, 3.0)]


def test_invert_ranges_edge():
    keep = invert_ranges([Segment(0.0, 1.0)], 3.0)
    assert [(s.start, s.end) for s in keep] == [(1.0, 3.0)]
```

- [ ] **Step 2: run to verify fail** — `.venv/bin/pytest tests/test_silence.py::test_invert_ranges_middle -v` → FAIL (não existe).

- [ ] **Step 3: implement invert_ranges** — add to `pipeline/silence.py`:

```python
def invert_ranges(remove: list[Segment], duration: float) -> list[Segment]:
    """Trechos a MANTER = complemento de `remove` sobre [0, duration]."""
    rs = sorted(
        (Segment(max(0.0, r.start), min(duration, r.end)) for r in remove if r.end > r.start),
        key=lambda s: s.start,
    )
    keep: list[Segment] = []
    cursor = 0.0
    for r in rs:
        if r.start > cursor:
            keep.append(Segment(cursor, r.start))
        cursor = max(cursor, r.end)
    if cursor < duration:
        keep.append(Segment(cursor, duration))
    return keep
```

- [ ] **Step 4: run to verify pass** — `.venv/bin/pytest tests/test_silence.py -v` → PASS.

- [ ] **Step 5: implement stage_refine + model + endpoint**

In `pipeline/stages.py`: update the silence import to include `invert_ranges` and `Segment`, e adicione `stage_refine`:
```python
from pipeline.silence import (
    detect_silences, compute_kept_segments, cut_segments, invert_ranges, Segment,
)
```
```python
def stage_refine(job: Job, remove_ranges: list, progress_cb=None) -> float:
    trimmed = job.dir / "trimmed.mp4"
    tp = load_json(job.dir / "trimmed.probe.json")
    dur = tp["duration"]
    keep = invert_ranges(remove_ranges, dur)
    if not keep:
        raise ValueError("nada sobraria após os cortes manuais")
    tmp = job.dir / "trimmed.refined.mp4"
    total = sum(s.duration for s in keep)
    cut_segments(str(trimmed), keep, str(tmp), total_duration=total, progress_cb=progress_cb)
    tmp.replace(trimmed)
    tmeta = probe_video(str(trimmed))
    write_json(job.dir / "trimmed.probe.json",
               {"width": tmeta.width, "height": tmeta.height, "fps": tmeta.fps,
                "duration": tmeta.duration, "nb_frames": tmeta.nb_frames})
    return tmeta.duration
```
(`Segment` fica importado para o endpoint construir os ranges; se ruff reclamar de import não usado em stages.py, use `Segment` só no endpoint via import em routes.py — veja abaixo — e importe em stages apenas `invert_ranges`.)

In `api/models.py`, add after `CutResult`:
```python
class RefineParams(BaseModel):
    remove: list[CutSegmentOut] = Field(default_factory=list)
```
(`Field` já é importado no arquivo — confirme; se não, adicione `from pydantic import BaseModel, Field`.)

In `api/routes.py`:
- imports: add `from pipeline.silence import Segment` and include `stage_refine` in the `from pipeline.stages import ...` line; add `RefineParams` to the `from api.models import ...` line.
- add the endpoint (perto de `run_cut`):
```python
@router.post("/jobs/{slug}/refine")
def run_refine(slug: str, params: RefineParams):
    jobs_root, *_ = _roots()
    job = init_job(jobs_root, slug)
    remove = [Segment(r.start, r.end) for r in params.remove]
    if not remove:
        raise HTTPException(status_code=400, detail="nenhum trecho para remover")

    def work(progress_cb):
        new_dur = stage_refine(job, remove, progress_cb=progress_cb)
        return {"trimmed_duration": new_dur}

    return StreamingResponse(run_with_progress(work), media_type="text/event-stream")
```

- [ ] **Step 6: failing test (/refine SSE)** — create `tests/test_refine_sse.py`:

```python
import json
import os
import shutil
import subprocess
from pathlib import Path
import pytest

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg indisponível")


@_needs_ffmpeg
def test_refine_streams_and_shortens(tmp_path, monkeypatch):
    monkeypatch.setenv("JOBS_ROOT", str(tmp_path / "jobs"))
    monkeypatch.setenv("INPUT_ROOT", str(tmp_path / "input"))
    monkeypatch.setenv("OUTPUT_ROOT", str(tmp_path / "output"))
    monkeypatch.setenv("TTS_MODE", "mock")
    from starlette.testclient import TestClient
    from api.app import app

    clip = tmp_path / "c.mp4"
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", "color=c=black:s=320x240:d=4",
         "-f", "lavfi", "-i", "sine=frequency=440:d=4",
         "-shortest", "-pix_fmt", "yuv420p", str(clip)],
        capture_output=True, check=True,
    )
    client = TestClient(app)
    with clip.open("rb") as f:
        client.post("/api/jobs", data={"slug": "r1"},
                    files=[("files", ("c.mp4", f, "video/mp4"))])
    # corte automático (produz trimmed.mp4) — consome o SSE
    with client.stream("POST", "/api/jobs/r1/cut",
                       json={"silence_threshold_db": -60.0, "padding": 0.0, "min_silence": 2.0}) as r:
        for _ in r.iter_lines():
            pass
    before = json.loads((tmp_path / "jobs" / "r1" / "trimmed.probe.json").read_text())["duration"]

    # remove 1s do meio
    with client.stream("POST", "/api/jobs/r1/refine",
                       json={"remove": [{"start": 1.0, "end": 2.0}]}) as r:
        events, datas = [], []
        for line in r.iter_lines():
            if line.startswith("event:"):
                events.append(line.split(":", 1)[1].strip())
            elif line.startswith("data:"):
                datas.append(line.split(":", 1)[1].strip())
    assert "progress" in events
    assert "done" in events
    new_dur = json.loads(datas[-1])["trimmed_duration"]
    assert new_dur < before
```

- [ ] **Step 7: run to verify pass** — `.venv/bin/pytest tests/test_refine_sse.py tests/test_silence.py -v` → PASS. Depois `.venv/bin/pytest -q` (sem regressões) e reporte o resumo.

- [ ] **Step 8: commit**

```bash
git add pipeline/silence.py pipeline/stages.py api/models.py api/routes.py tests/test_silence.py tests/test_refine_sse.py
git commit -m "feat(refine): manual fine-cut endpoint re-cuts trimmed via SSE"
```

---

## Task 3: frontend do corte manual (CutsStep)

**Files:** Modify `web/src/steps/CutsStep.tsx`. Test: `web/src/__tests__/CutsStep.test.tsx`.

- [ ] **Step 1: failing test** — replace `web/src/__tests__/CutsStep.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

const streamSSE = vi.fn(async (url: string, _opts: any, on: any) => {
  if (url.includes("/cut")) {
    on.progress?.({ n: 3, total: 6 });
    on.done?.({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 3 }, { start: 5, end: 8 }],
    });
  } else if (url.includes("/refine")) {
    on.progress?.({ n: 1, total: 4 });
    on.done?.({ trimmed_duration: 5 });
  }
});
vi.mock("../api", () => ({
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  streamSSE,
}));

import { CutsStep } from "../steps/CutsStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };
beforeEach(() => vi.clearAllMocks());

async function doCut(container: HTMLElement) {
  fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
  await waitFor(() => expect(screen.getByText(/trechos mantidos/i)).toBeInTheDocument());
  return container.querySelector("video") as HTMLVideoElement;
}

describe("CutsStep manual cut", () => {
  it("marca um trecho a remover (início + fim) e lista", async () => {
    const { container } = render(<CutsStep {...props} />);
    const video = await doCut(container);
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    expect(screen.getByRole("button", { name: /remover trecho 1/i })).toBeInTheDocument();
  });

  it("aplica os cortes chamando streamSSE em /refine", async () => {
    const { container } = render(<CutsStep {...props} />);
    const video = await doCut(container);
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    await waitFor(() => {
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: run to verify fail** — `cd web && npx vitest run src/__tests__/CutsStep.test.tsx` → FAIL (sem os botões).

- [ ] **Step 3: implement** — em `web/src/steps/CutsStep.tsx`.

Adicione `ProgressBar` ao import (já usado): garanta `import { ProgressBar } from "../components/ProgressBar";`.

Adicione estado (após os `useState` existentes):
```tsx
  const [removeList, setRemoveList] = useState<{ start: number; end: number }[]>([]);
  const [markStart, setMarkStart] = useState<number | null>(null);
  const [refineVersion, setRefineVersion] = useState(0);
  const [refining, setRefining] = useState(false);
  const [refineProg, setRefineProg] = useState<{ n: number; total: number } | null>(null);

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

  const applyRefine = async () => {
    if (removeList.length === 0) return;
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
          setRefineVersion((v) => v + 1);
        },
        error: (d) => setErr(d.detail ?? "erro ao aplicar cortes"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setRefining(false); setRefineProg(null); }
  };
```

Troque o `<video>` do preview para incluir o cache-bust:
```tsx
          <video ref={videoRef} src={`${mediaUrl(slug, "trimmed.mp4")}${refineVersion ? `?v=${refineVersion}` : ""}`} controls
            className="w-full rounded border border-zinc-800 mt-2" />
```

Logo abaixo do `<video>` (ainda dentro do `{result && (...)}`), adicione a seção de cortes manuais:
```tsx
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
                <button onClick={applyRefine} disabled={refining}
                  className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
                  {refining ? "Aplicando..." : `Aplicar cortes (${removeList.length})`}
                </button>
                {refining && refineProg && <ProgressBar label="Aplicando cortes" n={Math.round(refineProg.n)} total={Math.round(refineProg.total)} />}
              </>
            )}
          </div>
```

- [ ] **Step 4: run to verify pass** — `cd web && npx vitest run src/__tests__/CutsStep.test.tsx` → PASS (2 passed).

- [ ] **Step 5: commit**

```bash
git add web/src/steps/CutsStep.tsx web/src/__tests__/CutsStep.test.tsx
git commit -m "feat(web): manual fine-cut UI (mark ranges, apply, re-cut) in CutsStep"
```

---

## Task 4: editor de legendas mais legível (TranscriptStep)

**Files:** Modify `web/src/steps/TranscriptStep.tsx` (só o bloco da lista de edição).

- [ ] **Step 1: implement** — troque o bloco `{lines && (<div className="space-y-3 max-h-[50vh] ...">...)}` (a LISTA DE EDIÇÃO, não o bloco do vídeo) por:

```tsx
      {lines && (
        <div className="max-h-[65vh] overflow-y-auto bg-zinc-900 border border-zinc-800 rounded p-4 text-base leading-relaxed space-y-1">
          {lines.map((l, li) => (
            <div key={li} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-2 py-2 rounded hover:bg-zinc-800/50">
              <span className="text-xs text-zinc-500 font-mono w-12 shrink-0">{l.start.toFixed(1)}s</span>
              {l.words.map((w, wi) => (
                <input
                  key={wi} value={w.word} onChange={(e) => editWord(li, wi, e.target.value)}
                  onBlur={save}
                  className="bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-emerald-500 outline-none px-0.5 text-zinc-100"
                  style={{ width: `${Math.max(3, w.word.length + 1)}ch` }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
```

- [ ] **Step 2: verify existing test still passes** — `cd web && npx vitest run src/__tests__/TranscriptStep.test.tsx` → PASS (o teste de progresso não depende do layout da lista).

- [ ] **Step 3: commit**

```bash
git add web/src/steps/TranscriptStep.tsx
git commit -m "feat(web): roomier, more readable caption editor layout"
```

---

## Task 5: verificação final

- [ ] **Step 1:** `.venv/bin/pytest -q` → tudo passa.
- [ ] **Step 2:** `cd web && npx vitest run` → tudo passa, incluindo `state.test.ts` (agora verde) e sem regressões.
- [ ] **Step 3:** `cd web && npm run build` → sucesso (tsc + vite); corrigir imports órfãos.
- [ ] **Step 4:** Rebuild + copiar para `api/static`, reiniciar uvicorn, smoke: cortar → marcar um trecho no player → aplicar (vídeo encurta) → transcrever (editor arejado).
