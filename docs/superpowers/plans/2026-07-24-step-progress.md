# Step Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barra de progresso percentual real nos passos de corte, transcrição e render.

**Architecture:** Um helper `run_with_progress(blocking_fn)` roda trabalho bloqueante numa thread e emite SSE (`progress {n,total}` → `done`/`error`), drenando uma fila thread→async. Corte reporta via `-progress` do ffmpeg; transcrição via `info.duration` + `segment.end`; render já emite `Rendered N/total` (só corrige a chave). Frontend usa a `ProgressBar` existente.

**Tech Stack:** Python/FastAPI/faster-whisper/ffmpeg; React 19/Vite/Vitest.

---

## File Structure

- **Create** `api/progress.py` — `run_with_progress`.
- **Modify** `pipeline/silence.py` — `parse_ffmpeg_progress`, `cut_segments` (Popen+progress).
- **Modify** `pipeline/stages.py` — `stage_cut`/`stage_transcribe` recebem `progress_cb`.
- **Modify** `pipeline/transcribe.py` — `transcribe_audio` recebe `progress_cb`.
- **Modify** `api/routes.py` — `/cut` → SSE, `/transcribe` progresso, `run_render` chave lógica.
- **Modify** `api/tests/test_routes.py` — `test_cut_after_ingest` consome SSE.
- **Modify** `web/src/api.ts` — remove `runCut`.
- **Modify** `web/src/steps/CutsStep.tsx`, `TranscriptStep.tsx`, `RenderStep.tsx`.
- **Tests:** `tests/test_progress.py`, `tests/test_silence.py`, `tests/test_transcribe.py`, `tests/test_cut_sse.py`, `web/src/__tests__/{CutsStep,TranscriptStep,RenderStep}.test.tsx`.

---

## Task 1: infra de progresso (`parse_ffmpeg_progress` + `run_with_progress`)

**Files:** Create `api/progress.py`; modify `pipeline/silence.py`; test `tests/test_progress.py`.

- [ ] **Step 1: failing test** — create `tests/test_progress.py`:

```python
import asyncio

from pipeline.silence import parse_ffmpeg_progress
from api.progress import run_with_progress


def test_parse_ffmpeg_progress():
    assert parse_ffmpeg_progress("out_time_us=1500000") == 1.5
    assert parse_ffmpeg_progress("out_time_us=N/A") is None
    assert parse_ffmpeg_progress("frame=10") is None


def test_run_with_progress_emits_progress_then_done():
    def work(cb):
        cb(1, 4)
        cb(2, 4)
        return {"result": 42}

    async def collect():
        out = []
        async for chunk in run_with_progress(work):
            out.append(chunk)
        return out

    joined = "".join(asyncio.run(collect()))
    assert "event: progress" in joined
    assert '"n": 1' in joined
    assert "event: done" in joined
    assert '"result": 42' in joined


def test_run_with_progress_reports_errors():
    def work(cb):
        raise RuntimeError("boom")

    async def collect():
        return [c async for c in run_with_progress(work)]

    joined = "".join(asyncio.run(collect()))
    assert "event: error" in joined
    assert "boom" in joined
```

- [ ] **Step 2: run to verify fail**

Run: `.venv/bin/pytest tests/test_progress.py -v`
Expected: FAIL — módulos/funções não existem.

- [ ] **Step 3: implement**

Add to `pipeline/silence.py` (near the top-level functions):

```python
def parse_ffmpeg_progress(line: str) -> float | None:
    """Segundos processados a partir de uma linha `out_time_us=` do -progress do ffmpeg."""
    line = line.strip()
    if line.startswith("out_time_us="):
        try:
            return int(line.split("=", 1)[1]) / 1_000_000
        except ValueError:
            return None
    return None
```

Create `api/progress.py`:

```python
import asyncio
from typing import Any, Callable

from api.sse import sse_event


async def run_with_progress(blocking_fn: Callable[[Callable[[float, float], None]], Any]):
    """Roda blocking_fn(progress_cb) numa thread, emitindo eventos SSE.
    progress_cb(n, total) -> evento 'progress'. Retorno de blocking_fn -> 'done'.
    Exceção -> 'error'."""
    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def progress_cb(n: float, total: float) -> None:
        loop.call_soon_threadsafe(
            queue.put_nowait, ("progress", {"n": round(n, 3), "total": round(total, 3)})
        )

    def worker() -> None:
        try:
            result = blocking_fn(progress_cb)
            payload = result if result is not None else {"ok": True}
            loop.call_soon_threadsafe(queue.put_nowait, ("done", payload))
        except Exception as exc:  # noqa: BLE001
            loop.call_soon_threadsafe(queue.put_nowait, ("error", {"detail": str(exc)}))
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    loop.run_in_executor(None, worker)

    while True:
        item = await queue.get()
        if item is None:
            break
        event, data = item
        yield sse_event(event, data)
```

- [ ] **Step 4: run to verify pass**

Run: `.venv/bin/pytest tests/test_progress.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: commit**

```bash
git add api/progress.py pipeline/silence.py tests/test_progress.py
git commit -m "feat(progress): run_with_progress helper + ffmpeg progress parser"
```

---

## Task 2: progresso no corte (`cut_segments` + `stage_cut`)

**Files:** Modify `pipeline/silence.py` (`cut_segments`), `pipeline/stages.py` (`stage_cut`). Test: `tests/test_silence.py`.

- [ ] **Step 1: failing test** — add to `tests/test_silence.py` (o guard `_needs_ffmpeg` e o `_REPO_BIN` já existem no arquivo; reutilize):

```python
from pipeline.job import init_job
from pipeline.stages import stage_cut


@_needs_ffmpeg
def test_stage_cut_reports_progress(tmp_path):
    src = tmp_path / "jobs" / "v1" / "source.mp4"
    src.parent.mkdir(parents=True)
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", "color=c=black:s=320x240:d=3",
         "-f", "lavfi", "-i", "sine=frequency=440:d=3",
         "-af", "volume='if(lt(t,1)+gt(t,2),1,0)':eval=frame",
         "-shortest", "-pix_fmt", "yuv420p", str(src)],
        capture_output=True, check=True,
    )
    job = init_job(tmp_path / "jobs", "v1")
    # probe.json é necessário para stage_cut
    from pipeline.probe import probe_video
    from pipeline.job import write_json
    m = probe_video(str(src))
    write_json(job.dir / "probe.json",
               {"width": m.width, "height": m.height, "fps": m.fps,
                "duration": m.duration, "nb_frames": m.nb_frames})

    calls = []
    stage_cut(job, progress_cb=lambda n, total: calls.append((n, total)))

    assert (job.dir / "trimmed.mp4").exists()
    assert calls, "progress_cb não foi chamado"
    n, total = calls[-1]
    assert total > 0 and 0 <= n <= total
```

- [ ] **Step 2: run to verify fail**

Run: `.venv/bin/pytest tests/test_silence.py::test_stage_cut_reports_progress -v`
Expected: FAIL — `stage_cut()` não aceita `progress_cb`.

- [ ] **Step 3: implement**

In `pipeline/silence.py`, replace `cut_segments`:

```python
def cut_segments(src, segments, out_path, total_duration=None, progress_cb=None) -> None:
    if not segments:
        raise ValueError("nenhum segmento para cortar")
    between = build_select_expr(segments)
    vf = f"select='{between}',setpts=N/FRAME_RATE/TB"
    af = f"aselect='{between}',asetpts=N/SR/TB"
    proc = subprocess.Popen(
        ["ffmpeg", "-y", "-i", src, "-vf", vf, "-af", af,
         "-progress", "pipe:1", "-nostats", out_path],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
    )
    for line in proc.stdout:
        t = parse_ffmpeg_progress(line)
        if t is not None and progress_cb and total_duration:
            progress_cb(min(t, total_duration), total_duration)
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg cut falhou (rc={proc.returncode})")
```

In `pipeline/stages.py`, replace `stage_cut`:

```python
def stage_cut(job: Job, progress_cb=None) -> None:
    src = job.dir / "source.mp4"
    meta = load_json(job.dir / "probe.json")
    silences = detect_silences(str(src), job.config.silence_threshold_db, job.config.min_silence)
    kept = compute_kept_segments(silences, meta["duration"], job.config.padding, job.config.min_segment)
    write_json(job.dir / "cuts.json", [{"start": s.start, "end": s.end} for s in kept])
    total = sum(s.duration for s in kept)
    cut_segments(str(src), kept, str(job.dir / "trimmed.mp4"),
                 total_duration=total, progress_cb=progress_cb)
    tmeta = probe_video(str(job.dir / "trimmed.mp4"))
    write_json(job.dir / "trimmed.probe.json",
               {"width": tmeta.width, "height": tmeta.height, "fps": tmeta.fps,
                "duration": tmeta.duration, "nb_frames": tmeta.nb_frames})
```

- [ ] **Step 4: run to verify pass**

Run: `.venv/bin/pytest tests/test_silence.py -v`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add pipeline/silence.py pipeline/stages.py tests/test_silence.py
git commit -m "feat(cut): report ffmpeg progress through stage_cut"
```

---

## Task 3: progresso na transcrição (`transcribe_audio` + `stage_transcribe`)

**Files:** Modify `pipeline/transcribe.py`, `pipeline/stages.py`. Test: `tests/test_transcribe.py`.

- [ ] **Step 1: failing test** — add to `tests/test_transcribe.py`:

```python
import sys
import types
from types import SimpleNamespace


def test_transcribe_reports_progress(monkeypatch):
    from pipeline import transcribe as T
    T._MODEL_CACHE.clear()

    seg1 = SimpleNamespace(text="a", start=0.0, end=1.0,
                           words=[SimpleNamespace(word="a", start=0.0, end=1.0)])
    seg2 = SimpleNamespace(text="b", start=1.0, end=2.0,
                           words=[SimpleNamespace(word="b", start=1.0, end=2.0)])

    class FakeModel:
        def __init__(self, *a, **k):
            pass

        def transcribe(self, path, **kwargs):
            return ([seg1, seg2], SimpleNamespace(duration=2.0))

    monkeypatch.setitem(sys.modules, "faster_whisper",
                        types.SimpleNamespace(WhisperModel=FakeModel))

    calls = []
    out = T.transcribe_audio("x.wav", progress_cb=lambda n, total: calls.append((n, total)))

    assert out[0]["text"] == "a" and out[1]["text"] == "b"
    assert calls == [(1.0, 2.0), (2.0, 2.0)]
```

- [ ] **Step 2: run to verify fail**

Run: `.venv/bin/pytest tests/test_transcribe.py::test_transcribe_reports_progress -v`
Expected: FAIL — `transcribe_audio` não aceita `progress_cb`.

- [ ] **Step 3: implement**

In `pipeline/transcribe.py`, replace `transcribe_audio`:

```python
def transcribe_audio(path: str, model_size: str = "base", language: str = "pt",
                     progress_cb=None) -> list[dict]:
    model = _get_model(model_size)
    segments, info = model.transcribe(
        path, language=language, word_timestamps=True,
        vad_filter=True, beam_size=1,
    )
    total = float(getattr(info, "duration", 0) or 0)

    def _tracked(segs):
        for seg in segs:
            yield seg
            if progress_cb and total:
                progress_cb(min(seg.end, total), total)

    return words_from_segments(_tracked(segments))
```

In `pipeline/stages.py`, replace `stage_transcribe`:

```python
def stage_transcribe(job: Job, progress_cb=None) -> None:
    trimmed = job.dir / "trimmed.mp4"
    words = transcribe_audio(str(trimmed), job.config.whisper_model,
                             job.config.language, progress_cb=progress_cb)
    write_json(job.dir / "transcript.json", words)
```

- [ ] **Step 4: run to verify pass**

Run: `.venv/bin/pytest tests/test_transcribe.py -v`
Expected: PASS (todos, incluindo cache/base já existentes).

- [ ] **Step 5: commit**

```bash
git add pipeline/transcribe.py pipeline/stages.py tests/test_transcribe.py
git commit -m "feat(transcribe): report per-segment progress"
```

---

## Task 4: endpoints (cut→SSE, transcribe progresso, render chave lógica)

**Files:** Modify `api/routes.py`; modify `api/tests/test_routes.py`. Test: `tests/test_cut_sse.py`.

- [ ] **Step 1: failing test** — create `tests/test_cut_sse.py`:

```python
import os
import shutil
import subprocess
from pathlib import Path
import pytest

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg indisponível")


@_needs_ffmpeg
def test_cut_streams_progress_and_done(tmp_path, monkeypatch):
    monkeypatch.setenv("JOBS_ROOT", str(tmp_path / "jobs"))
    monkeypatch.setenv("INPUT_ROOT", str(tmp_path / "input"))
    monkeypatch.setenv("OUTPUT_ROOT", str(tmp_path / "output"))
    monkeypatch.setenv("TTS_MODE", "mock")
    from starlette.testclient import TestClient
    from api.app import app

    clip = tmp_path / "c.mp4"
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", "color=c=black:s=320x240:d=3",
         "-f", "lavfi", "-i", "sine=frequency=440:d=3",
         "-af", "volume='if(lt(t,1)+gt(t,2),1,0)':eval=frame",
         "-shortest", "-pix_fmt", "yuv420p", str(clip)],
        capture_output=True, check=True,
    )
    client = TestClient(app)
    with clip.open("rb") as f:
        client.post("/api/jobs", data={"slug": "c1"},
                    files=[("files", ("c.mp4", f, "video/mp4"))])

    with client.stream("POST", "/api/jobs/c1/cut",
                       json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3}) as r:
        events = []
        data_lines = []
        for line in r.iter_lines():
            if line.startswith("event:"):
                events.append(line.split(":", 1)[1].strip())
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
    assert "progress" in events
    assert "done" in events
    import json
    done_payload = json.loads(data_lines[-1])
    assert "original_duration" in done_payload
    assert "segments" in done_payload
```

- [ ] **Step 2: run to verify fail**

Run: `.venv/bin/pytest tests/test_cut_sse.py -v`
Expected: FAIL — `/cut` ainda retorna JSON (sem eventos `progress`).

- [ ] **Step 3: implement**

In `api/routes.py`, replace `run_cut`:

```python
@router.post("/jobs/{slug}/cut")
def run_cut(slug: str, params: CutParams):
    jobs_root, *_ = _roots()
    update_config(slug, jobs_root, params)
    job = init_job(jobs_root, slug)

    def work(progress_cb):
        stage_cut(job, progress_cb=progress_cb)
        cuts = load_json(job.dir / "cuts.json")
        probe = load_json(job.dir / "probe.json")
        tprobe = load_json(job.dir / "trimmed.probe.json")
        return CutResult(
            original_duration=probe["duration"],
            trimmed_duration=tprobe["duration"],
            segments=[CutSegmentOut(**c) for c in cuts],
        ).model_dump()

    return StreamingResponse(run_with_progress(work), media_type="text/event-stream")
```

Replace `run_transcribe` so it emits per-segment progress (mantendo o `loading_model` inicial):

```python
@router.post("/jobs/{slug}/transcribe")
def run_transcribe(slug: str, params: TranscribeParams):
    jobs_root, *_ = _roots()
    update_whisper_model(slug, jobs_root, params.model_size, params.language)
    job = init_job(jobs_root, slug)

    def work(progress_cb):
        stage_transcribe(job, progress_cb=progress_cb)
        return {"ok": True}

    async def gen():
        yield sse_event("progress", {"stage": "loading_model"})
        async for chunk in run_with_progress(work):
            yield chunk

    return StreamingResponse(gen(), media_type="text/event-stream")
```

In `run_render`, emit the logical format key. Change `jobs_to_run` and the loop:

```python
    jobs_to_run = [
        (f, FORMAT_MAP[f][0], f"{slug}-{FORMAT_MAP[f][1]}.mp4")
        for f in selected if f in FORMAT_MAP
    ]
```
```python
        for fmt_key, composition, out_name in jobs_to_run:
            out_path = output_root_abs / out_name
            try:
                proc = await render_mod.run_remotion(composition, out_path, props_path, remotion_dir, env)
            except Exception as e:
                yield sse_event("error", {"detail": str(e)})
                return
            tail: deque[str] = deque(maxlen=15)
            while True:
                raw = await proc.stdout.readline()
                if not raw:
                    break
                line = raw.decode(errors="ignore").strip()
                if not line:
                    continue
                p = render_mod.parse_progress(line)
                if p:
                    kind, n, total = p
                    yield sse_event("progress",
                                    {"format": fmt_key, "kind": kind, "n": n, "total": total})
                else:
                    tail.append(line)
            rc = await proc.wait()
            if rc != 0:
                yield sse_event("error", {"detail": f"render {fmt_key} retornou {rc}", "log": "\n".join(tail)})
                return
            yield sse_event("progress",
                            {"format": fmt_key, "kind": "encoded", "n": 1, "total": 1, "done_format": True})
```

Ensure `run_with_progress` is imported in `api/routes.py`: add `from api.progress import run_with_progress`. `sse_event`, `StreamingResponse`, `stage_cut`, `stage_transcribe`, `load_json`, `CutResult`, `CutSegmentOut` já são importados.

Then update `api/tests/test_routes.py::test_cut_after_ingest` (o único que afirma o JSON do /cut) para consumir SSE:

```python
def test_cut_after_ingest(client, sample_mp4):
    _upload(client, sample_mp4, "t3")
    import json
    done = None
    with client.stream(
        "POST", "/api/jobs/t3/cut",
        json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3},
    ) as r:
        assert r.status_code == 200
        last_data = None
        got_done = False
        for line in r.iter_lines():
            if line.startswith("event:") and line.split(":", 1)[1].strip() == "done":
                got_done = True
            elif line.startswith("data:"):
                last_data = line.split(":", 1)[1].strip()
        assert got_done
        done = json.loads(last_data)
    assert done["original_duration"] > 0
    assert done["trimmed_duration"] >= 0
    assert isinstance(done["segments"], list)
```

- [ ] **Step 4: run to verify pass**

Run: `.venv/bin/pytest tests/test_cut_sse.py api/tests/test_routes.py api/tests/test_sse.py -v`
Expected: PASS. Depois rode a suíte inteira `.venv/bin/pytest -q` e reporte o resumo.

- [ ] **Step 5: commit**

```bash
git add api/routes.py api/tests/test_routes.py tests/test_cut_sse.py
git commit -m "feat(api): stream cut progress via SSE; per-segment transcribe progress; logical render key"
```

---

## Task 5: frontend CutsStep (streamSSE + ProgressBar)

**Files:** Modify `web/src/api.ts` (remove `runCut`), `web/src/steps/CutsStep.tsx`. Test: `web/src/__tests__/CutsStep.test.tsx`.

- [ ] **Step 1: failing test** — replace `web/src/__tests__/CutsStep.test.tsx` conteúdo por:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  streamSSE: vi.fn(async (_url: string, _opts: any, on: any) => {
    on.progress?.({ n: 3, total: 6 });
    on.done?.({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 3 }, { start: 5, end: 8 }],
    });
  }),
}));

import { CutsStep } from "../steps/CutsStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };
beforeEach(() => vi.clearAllMocks());

describe("CutsStep", () => {
  it("mostra resumo e <video> do trimmed após o corte (via SSE)", async () => {
    const { container } = render(<CutsStep {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
    await waitFor(() => {
      expect(screen.getByText(/trechos mantidos/i)).toBeInTheDocument();
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      expect(v!.getAttribute("src")).toContain("/files/trimmed.mp4");
    });
  });
});
```

- [ ] **Step 2: run to verify fail**

Run: `cd web && npx vitest run src/__tests__/CutsStep.test.tsx`
Expected: FAIL — CutsStep ainda usa `runCut`.

- [ ] **Step 3: implement**

In `web/src/api.ts`, remove a função `runCut` inteira (o import de `CutParams`/`CutResult` pode continuar se usado noutro lugar; se ficar sem uso, remova-o para o build passar).

Replace `web/src/steps/CutsStep.tsx` (troca `runCut` por `streamSSE` + `ProgressBar`):

```tsx
import { useRef, useState } from "react";
import { streamSSE, mediaUrl } from "../api";
import { Slider } from "../components/Slider";
import { ProgressBar } from "../components/ProgressBar";
import { formatSeconds, percentage } from "../util";
import type { CutResult, CutParams } from "../types";
import type { StepProps } from "../App";

export const CutsStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [params, setParams] = useState<CutParams>({
    silence_threshold_db: -30, padding: 0.1, min_silence: 0.5,
  });
  const [result, setResult] = useState<CutResult | null>(null);
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const seek = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = t;
    v.play()?.catch(() => {});
  };

  const onCut = async () => {
    setBusy(true); setErr(null); setResult(null); setProg(null);
    try {
      await streamSSE(`/api/jobs/${slug}/cut`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }, {
        progress: (d) => { if (d.n != null && d.total != null) setProg({ n: d.n, total: d.total }); },
        done: (d) => setResult(d as CutResult),
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
      <button onClick={onCut} disabled={busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy ? "Cortando..." : "Detectar pausas"}
      </button>
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
          <video ref={videoRef} src={mediaUrl(slug, "trimmed.mp4")} controls
            className="w-full rounded border border-zinc-800 mt-2" />
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

- [ ] **Step 4: run to verify pass**

Run: `cd web && npx vitest run src/__tests__/CutsStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add web/src/api.ts web/src/steps/CutsStep.tsx web/src/__tests__/CutsStep.test.tsx
git commit -m "feat(web): stream cut progress with a progress bar in CutsStep"
```

---

## Task 6: frontend TranscriptStep (ProgressBar)

**Files:** Modify `web/src/steps/TranscriptStep.tsx`. Test: `web/src/__tests__/TranscriptStep.test.tsx`.

- [ ] **Step 1: failing test** — replace `web/src/__tests__/TranscriptStep.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

let sseHandlers: any = null;
vi.mock("../api", () => ({
  getTranscript: vi.fn(async () => ([])),
  putTranscript: vi.fn(async () => {}),
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  streamSSE: vi.fn((_url: string, _opts: any, on: any) => {
    sseHandlers = on;
    on.progress?.({ n: 5, total: 10 });
    // promise pendente: a transcrição fica "em andamento" (busy=true) para o
    // teste conseguir ver a ProgressBar, que só aparece durante busy.
    return new Promise<void>(() => {});
  }),
}));

import { TranscriptStep } from "../steps/TranscriptStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("TranscriptStep progress", () => {
  it("mostra a ProgressBar durante a transcrição", async () => {
    render(<TranscriptStep {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /transcrever/i }));
    await waitFor(() => {
      expect(screen.getByText(/50%/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: run to verify fail**

Run: `cd web && npx vitest run src/__tests__/TranscriptStep.test.tsx`
Expected: FAIL — sem ProgressBar/percentual.

- [ ] **Step 3: implement**

In `web/src/steps/TranscriptStep.tsx`: importe `ProgressBar` e adicione estado de progresso. Troque o import e o `useState` do estágio:

```tsx
import { ProgressBar } from "../components/ProgressBar";
```

Adicione junto aos outros `useState`:
```tsx
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null);
```

No `transcribe`, ao iniciar zere e no handler de progresso guarde `{n,total}`:
```tsx
  const transcribe = async () => {
    setBusy(true); setErr(null); setStage("solicitado"); setProg(null);
    try {
      await streamSSE(`/api/jobs/${slug}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_size: model, language: "pt" }),
      }, {
        progress: (d) => {
          if (d.n != null && d.total != null) setProg({ n: d.n, total: d.total });
          else setStage(d.stage ?? "processando");
        },
        done: async () => { setLines(await getTranscript(slug)); },
        error: (d) => setErr(d.detail ?? "erro na transcrição"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); setStage(""); setProg(null); }
  };
```

Logo abaixo do bloco do botão/`{err}` e ANTES do preview de vídeo, adicione a barra enquanto ocupado:
```tsx
      {busy && prog && (
        <ProgressBar label="Transcrição" n={Math.round(prog.n)} total={Math.round(prog.total)} />
      )}
```

- [ ] **Step 4: run to verify pass**

Run: `cd web && npx vitest run src/__tests__/TranscriptStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add web/src/steps/TranscriptStep.tsx web/src/__tests__/TranscriptStep.test.tsx
git commit -m "feat(web): show transcription progress bar"
```

---

## Task 7: frontend RenderStep (chave lógica)

**Files:** Modify `web/src/steps/RenderStep.tsx`. Test: `web/src/__tests__/RenderStep.test.tsx` (novo).

- [ ] **Step 1: failing test** — create `web/src/__tests__/RenderStep.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  fileUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  streamSSE: vi.fn(async (_url: string, _opts: any, on: any) => {
    on.progress?.({ format: "main16x9", kind: "rendered", n: 5, total: 10 });
  }),
}));

import { RenderStep } from "../steps/RenderStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("RenderStep progress", () => {
  it("mostra a barra 16:9 indexada pela chave lógica main16x9", async () => {
    render(<RenderStep {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /renderizar/i }));
    await waitFor(() => {
      expect(screen.getByText(/5\/10/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: run to verify fail**

Run: `cd web && npx vitest run src/__tests__/RenderStep.test.tsx`
Expected: FAIL — RenderStep indexa por `prog["Main16x9"]`, não `main16x9`.

- [ ] **Step 3: implement**

In `web/src/steps/RenderStep.tsx`, troque as duas linhas de barra:

```tsx
        {prog["main16x9"] && <ProgressBar label="16:9" n={prog["main16x9"].n} total={prog["main16x9"].total} />}
        {prog["vertical9x16"] && <ProgressBar label="9:16" n={prog["vertical9x16"].n} total={prog["vertical9x16"].total} />}
```

- [ ] **Step 4: run to verify pass**

Run: `cd web && npx vitest run src/__tests__/RenderStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add web/src/steps/RenderStep.tsx web/src/__tests__/RenderStep.test.tsx
git commit -m "fix(web): index render progress bars by logical format key"
```

---

## Task 8: verificação final

- [ ] **Step 1:** `.venv/bin/pytest -q` → tudo passa (ffmpeg-guardados pulam se ausente).
- [ ] **Step 2:** `cd web && npx vitest run` → tudo passa (lembrar: `state.test.ts` tem falhas PRÉ-EXISTENTES de localStorage; se o cleanup do setup já as corrigiu, melhor).
- [ ] **Step 3:** `cd web && npm run build` → sucesso (tsc + vite); corrigir qualquer `runCut`/import órfão.
- [ ] **Step 4:** Rebuild + copiar para `api/static`, reiniciar uvicorn, smoke: rodar corte (barra %), transcrição (barra %), render (barra por formato de novo visível).
