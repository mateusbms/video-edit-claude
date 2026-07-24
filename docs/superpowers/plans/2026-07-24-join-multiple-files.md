# Join Multiple Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir N arquivos de vídeo e concatená-los, na ordem escolhida, num único `source.mp4` que segue pelo pipeline de edição existente.

**Architecture:** A junção ocorre num único ponto — o `stage_ingest`. Um novo módulo `pipeline/concat.py` concatena os arquivos (rápido com `-c copy` quando os parâmetros batem; re-encode com filtro `concat` normalizando para o 1º arquivo caso divirjam). O endpoint `POST /jobs` passa a aceitar lista de arquivos e o `UploadStep` ganha seleção múltipla com reordenação por setas. Nada a jusante muda.

**Tech Stack:** Python 3 / FastAPI / pytest (backend); React 19 / Vite / Vitest / Testing Library (frontend); ffmpeg + ffprobe (via `bin/` no PATH).

---

## File Structure

- **Create** `pipeline/concat.py` — helper de concatenação (`build_concat_filter`, `_probe_params`, `concat_videos`).
- **Create** `tests/test_concat.py` — testes do módulo de concatenação.
- **Modify** `pipeline/stages.py` — `stage_ingest` passa a receber `list[str]`.
- **Modify** `pipeline/cli.py` — caller de `stage_ingest`.
- **Modify** `api/routes.py` — `POST /jobs` aceita `list[UploadFile]`.
- **Create** `tests/test_jobs_api.py` — teste do endpoint com múltiplos arquivos.
- **Modify** `web/src/api.ts` — `uploadJob` envia múltiplos arquivos.
- **Modify** `web/src/steps/UploadStep.tsx` — seleção múltipla + reordenação + remover.
- **Create** `web/src/__tests__/UploadStep.test.tsx` — testes da lista de arquivos.

---

## Task 1: filtro de concatenação (função pura)

**Files:**
- Create: `pipeline/concat.py`
- Test: `tests/test_concat.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_concat.py
from pipeline.concat import build_concat_filter


def test_build_concat_filter_two_inputs():
    f = build_concat_filter(2, 1920, 1080, 30)
    assert f.count("scale=1920:1080") == 2
    assert "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" in f


def test_build_concat_filter_three_inputs():
    f = build_concat_filter(3, 1280, 720, 25)
    assert f.count("aresample=async=1") == 3
    assert "concat=n=3:v=1:a=1[v][a]" in f
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_concat.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'pipeline.concat'`

- [ ] **Step 3: Write minimal implementation**

```python
# pipeline/concat.py
import json
import shutil
import subprocess
from pathlib import Path


def build_concat_filter(n: int, width: int, height: int, fps: float) -> str:
    """String -filter_complex que escala/preenche cada input para width x height
    a `fps`, depois concatena vídeo + áudio de todos os inputs."""
    parts = []
    for i in range(n):
        parts.append(
            f"[{i}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}[v{i}];"
            f"[{i}:a]aresample=async=1[a{i}];"
        )
    streams = "".join(f"[v{i}][a{i}]" for i in range(n))
    parts.append(f"{streams}concat=n={n}:v=1:a=1[v][a]")
    return "".join(parts)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest tests/test_concat.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add pipeline/concat.py tests/test_concat.py
git commit -m "feat(concat): build_concat_filter for ffmpeg concat"
```

---

## Task 2: `concat_videos` (probe + copy rápido + fallback re-encode)

**Files:**
- Modify: `pipeline/concat.py`
- Test: `tests/test_concat.py`

- [ ] **Step 1: Write the failing test**

Adicione ao topo de `tests/test_concat.py` (acima dos testes existentes) o guard e o helper, e ao final os testes de integração:

```python
# tests/test_concat.py  (topo do arquivo, antes dos imports de teste existentes)
import os
import shutil
import subprocess
from pathlib import Path
import pytest

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_FFMPEG = shutil.which("ffmpeg")
_needs_ffmpeg = pytest.mark.skipif(_FFMPEG is None, reason="ffmpeg indisponível")


def _make_clip(path: Path, w: int, h: int, dur: float) -> None:
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", f"testsrc=size={w}x{h}:rate=30:duration={dur}",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={dur}",
         "-shortest", "-pix_fmt", "yuv420p", str(path)],
        capture_output=True, check=True,
    )


def _duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())
```

```python
# tests/test_concat.py  (final do arquivo)
from pipeline.concat import concat_videos


@_needs_ffmpeg
def test_concat_single_file_copies(tmp_path):
    a = tmp_path / "a.mp4"; _make_clip(a, 640, 360, 1.0)
    dest = tmp_path / "out.mp4"
    concat_videos([str(a)], str(dest))
    assert dest.exists()
    assert abs(_duration(dest) - 1.0) < 0.3


@_needs_ffmpeg
def test_concat_uniform_sums_duration(tmp_path):
    a = tmp_path / "a.mp4"; _make_clip(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _make_clip(b, 640, 360, 1.0)
    dest = tmp_path / "out.mp4"
    concat_videos([str(a), str(b)], str(dest))
    assert abs(_duration(dest) - 2.0) < 0.4


@_needs_ffmpeg
def test_concat_mismatched_resolution_reencodes_to_first(tmp_path):
    a = tmp_path / "a.mp4"; _make_clip(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _make_clip(b, 320, 240, 1.0)
    dest = tmp_path / "out.mp4"
    concat_videos([str(a), str(b)], str(dest))
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", str(dest)],
        capture_output=True, text=True, check=True,
    )
    s = __import__("json").loads(out.stdout)["streams"][0]
    assert (s["width"], s["height"]) == (640, 360)
    assert abs(_duration(dest) - 2.0) < 0.4


def test_concat_empty_raises():
    with pytest.raises(ValueError):
        concat_videos([], "out.mp4")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_concat.py -v`
Expected: FAIL — `ImportError: cannot import name 'concat_videos'`

- [ ] **Step 3: Write minimal implementation**

Acrescente a `pipeline/concat.py`:

```python
def _probe_params(path: str) -> tuple:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate,codec_name",
         "-of", "json", path],
        capture_output=True, text=True, check=True,
    )
    try:
        s = json.loads(result.stdout)["streams"][0]
    except (IndexError, KeyError):
        raise ValueError(f"arquivo sem stream de vídeo: {path}")
    num, den = s["r_frame_rate"].split("/")
    fps = round(float(num) / float(den), 3)
    return (s["width"], s["height"], fps, s["codec_name"])


def _try_copy_concat(paths: list[str], dest: str) -> bool:
    listfile = Path(dest).with_suffix(".concat.txt")
    listfile.write_text(
        "".join(f"file '{Path(p).resolve()}'\n" for p in paths), encoding="utf-8"
    )
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listfile),
             "-c", "copy", dest],
            capture_output=True, check=True,
        )
        return True
    except subprocess.CalledProcessError:
        return False
    finally:
        listfile.unlink(missing_ok=True)


def _reencode_concat(paths: list[str], dest: str, first_params: tuple) -> None:
    width, height, fps, _codec = first_params
    filt = build_concat_filter(len(paths), width, height, fps)
    cmd = ["ffmpeg", "-y"]
    for p in paths:
        cmd += ["-i", p]
    cmd += ["-filter_complex", filt, "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-c:a", "aac", dest]
    subprocess.run(cmd, capture_output=True, check=True)


def concat_videos(paths: list[str], dest: str) -> None:
    """Concatena `paths` em `dest`. 1 arquivo → cópia. N iguais → concat -c copy.
    N divergentes (ou copy falha) → re-encode normalizando para o 1º arquivo."""
    if not paths:
        raise ValueError("nenhum arquivo para concatenar")
    if len(paths) == 1:
        shutil.copy(paths[0], dest)
        return
    params = [_probe_params(p) for p in paths]
    uniform = all(p == params[0] for p in params)
    if uniform and _try_copy_concat(paths, dest):
        return
    _reencode_concat(paths, dest, params[0])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest tests/test_concat.py -v`
Expected: PASS (6 passed; testes de integração pulam se ffmpeg ausente)

- [ ] **Step 5: Commit**

```bash
git add pipeline/concat.py tests/test_concat.py
git commit -m "feat(concat): concat_videos with fast-copy and re-encode fallback"
```

---

## Task 3: `stage_ingest` aceita lista de arquivos

**Files:**
- Modify: `pipeline/stages.py:1-17`
- Modify: `pipeline/cli.py:20`
- Test: `tests/test_stages.py`

- [ ] **Step 1: Write the failing test**

Adicione a `tests/test_stages.py`:

```python
import os
import shutil
import subprocess
from pathlib import Path
import pytest
from pipeline.job import init_job, load_json
from pipeline.stages import stage_ingest

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg indisponível")


def _clip(path: Path, w: int, h: int, dur: float) -> None:
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", f"testsrc=size={w}x{h}:rate=30:duration={dur}",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={dur}",
         "-shortest", "-pix_fmt", "yuv420p", str(path)],
        capture_output=True, check=True,
    )


@_needs_ffmpeg
def test_stage_ingest_joins_multiple(tmp_path):
    a = tmp_path / "a.mp4"; _clip(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _clip(b, 640, 360, 1.0)
    job = init_job(tmp_path / "jobs", "v1")
    stage_ingest(job, [str(a), str(b)])
    assert (job.dir / "source.mp4").exists()
    probe = load_json(job.dir / "probe.json")
    assert probe["width"] == 640
    assert probe["duration"] > 1.5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_stages.py::test_stage_ingest_joins_multiple -v`
Expected: FAIL — `TypeError: stage_ingest() ... str expected` (assinatura antiga recebe lista)

- [ ] **Step 3: Write minimal implementation**

Em `pipeline/stages.py`, troque o topo e a função `stage_ingest`. Remova `import shutil` (fica sem uso) e importe `concat_videos`:

```python
from pathlib import Path

from pipeline.job import Job, write_json, load_json
from pipeline.probe import probe_video
from pipeline.silence import detect_silences, compute_kept_segments, cut_segments
from pipeline.transcribe import transcribe_audio
from pipeline.recipe import build_recipe
from pipeline.concat import concat_videos


def stage_ingest(job: Job, src_paths: list[str]) -> None:
    dest = job.dir / "source.mp4"
    concat_videos([str(p) for p in src_paths], str(dest))
    meta = probe_video(str(dest))
    write_json(job.dir / "probe.json",
               {"width": meta.width, "height": meta.height, "fps": meta.fps,
                "duration": meta.duration, "nb_frames": meta.nb_frames})
```

Em `pipeline/cli.py:20`, troque:

```python
        stage_ingest(job, [args.src])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest tests/test_stages.py -v`
Expected: PASS (todos, incluindo o novo teste ou skip sem ffmpeg)

- [ ] **Step 5: Commit**

```bash
git add pipeline/stages.py pipeline/cli.py tests/test_stages.py
git commit -m "feat(ingest): stage_ingest accepts a list of files to concatenate"
```

---

## Task 4: `POST /jobs` aceita múltiplos arquivos

**Files:**
- Modify: `api/routes.py:31-45`
- Test: `tests/test_jobs_api.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_jobs_api.py
import os
import shutil
import subprocess
from pathlib import Path
import pytest
from starlette.testclient import TestClient

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg indisponível")


def _clip(path: Path, w: int, h: int, dur: float) -> None:
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", f"testsrc=size={w}x{h}:rate=30:duration={dur}",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={dur}",
         "-shortest", "-pix_fmt", "yuv420p", str(path)],
        capture_output=True, check=True,
    )


@_needs_ffmpeg
def test_post_jobs_joins_multiple_files(tmp_path, monkeypatch):
    monkeypatch.setenv("JOBS_ROOT", str(tmp_path / "jobs"))
    monkeypatch.setenv("INPUT_ROOT", str(tmp_path / "input"))
    monkeypatch.setenv("OUTPUT_ROOT", str(tmp_path / "output"))
    monkeypatch.setenv("TTS_MODE", "mock")
    from api.app import app  # importado após setenv para satisfazer REQUIRED_ENV

    a = tmp_path / "a.mp4"; _clip(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _clip(b, 640, 360, 1.0)
    client = TestClient(app)
    with a.open("rb") as fa, b.open("rb") as fb:
        r = client.post(
            "/api/jobs",
            data={"slug": "multi"},
            files=[("files", ("a.mp4", fa, "video/mp4")),
                   ("files", ("b.mp4", fb, "video/mp4"))],
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["slug"] == "multi"
    assert body["probe"]["duration"] > 1.5


def test_post_jobs_requires_a_file(tmp_path, monkeypatch):
    monkeypatch.setenv("TTS_MODE", "mock")
    from api.app import app
    client = TestClient(app)
    r = client.post("/api/jobs", data={"slug": "empty"}, files=[])
    assert r.status_code in (400, 422)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_jobs_api.py -v`
Expected: FAIL — endpoint atual usa `file: UploadFile`, então o form com `files` retorna 422.

- [ ] **Step 3: Write minimal implementation**

Substitua `create_job` em `api/routes.py` (linhas 30-45):

```python
@router.post("/jobs")
async def create_job(
    files: list[UploadFile] = File(...), slug: str = Form(default="job")
):
    jobs_root, input_root, _ = _roots()
    input_root.mkdir(parents=True, exist_ok=True)
    if not files:
        raise HTTPException(status_code=400, detail="envie ao menos um arquivo")
    paths: list[str] = []
    for i, f in enumerate(files):
        suffix = Path(f.filename or "").suffix or ".mp4"
        upload_path = input_root / f"{slug}-part{i}{suffix}"
        with upload_path.open("wb") as out:
            shutil.copyfileobj(f.file, out)
        paths.append(str(upload_path))
    job = init_job(jobs_root, slug)
    try:
        stage_ingest(job, paths)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ingest falhou: {e}")
    state = get_state(slug, jobs_root)
    return {"slug": slug, "probe": state.probe.model_dump() if state.probe else None}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/pytest tests/test_jobs_api.py -v`
Expected: PASS (2 passed / integração pula sem ffmpeg)

- [ ] **Step 5: Commit**

```bash
git add api/routes.py tests/test_jobs_api.py
git commit -m "feat(api): POST /jobs accepts multiple files to concatenate"
```

---

## Task 5: `uploadJob` envia múltiplos arquivos (frontend)

**Files:**
- Modify: `web/src/api.ts:16-21`

- [ ] **Step 1: Write the failing test**

Crie `web/src/__tests__/uploadJob.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadJob } from "../api";

afterEach(() => vi.restoreAllMocks());

describe("uploadJob", () => {
  it("envia todos os arquivos no campo 'files' na ordem", async () => {
    const captured: FormData[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      captured.push(init.body as FormData);
      return { ok: true, json: async () => ({ slug: "s", probe: {} }) } as Response;
    }));
    const a = new File(["a"], "a.mp4", { type: "video/mp4" });
    const b = new File(["b"], "b.mp4", { type: "video/mp4" });
    await uploadJob([a, b], "s");
    const names = captured[0].getAll("files").map((f) => (f as File).name);
    expect(names).toEqual(["a.mp4", "b.mp4"]);
    expect(captured[0].get("slug")).toBe("s");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/uploadJob.test.ts`
Expected: FAIL — assinatura atual é `uploadJob(file: File, slug)`, tipos/campos não batem.

- [ ] **Step 3: Write minimal implementation**

Substitua `uploadJob` em `web/src/api.ts`:

```typescript
export async function uploadJob(files: File[], slug: string): Promise<{ slug: string; probe: any }> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("slug", slug);
  return jsonOrThrow(await fetch(`${BASE}/jobs`, { method: "POST", body: fd }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/__tests__/uploadJob.test.ts`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add web/src/api.ts web/src/__tests__/uploadJob.test.ts
git commit -m "feat(web): uploadJob sends multiple files"
```

---

## Task 6: `UploadStep` com seleção múltipla e reordenação

**Files:**
- Modify: `web/src/steps/UploadStep.tsx` (reescrita completa)
- Test: `web/src/__tests__/UploadStep.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// web/src/__tests__/UploadStep.test.tsx
import { describe, it, expect } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { UploadStep } from "../steps/UploadStep";

const props = { slug: "", setSlug: () => {}, next: () => {}, back: () => {} };

function addFiles(names: string[]) {
  const input = screen.getByLabelText(/arquivos de vídeo/i) as HTMLInputElement;
  const files = names.map((n) => new File(["x"], n, { type: "video/mp4" }));
  fireEvent.change(input, { target: { files } });
}

describe("UploadStep", () => {
  it("lista arquivos na ordem selecionada", () => {
    render(<UploadStep {...props} />);
    addFiles(["a.mp4", "b.mp4"]);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("a.mp4");
    expect(items[1]).toContain("b.mp4");
  });

  it("reordena com a seta descer", () => {
    render(<UploadStep {...props} />);
    addFiles(["a.mp4", "b.mp4"]);
    fireEvent.click(screen.getByLabelText("descer a.mp4"));
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("b.mp4");
    expect(items[1]).toContain("a.mp4");
  });

  it("remove um arquivo", () => {
    render(<UploadStep {...props} />);
    addFiles(["a.mp4", "b.mp4"]);
    fireEvent.click(screen.getByLabelText("remover a.mp4"));
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("b.mp4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/UploadStep.test.tsx`
Expected: FAIL — não há `listitem` nem botões `descer/remover` (UI antiga é single-file).

- [ ] **Step 3: Write minimal implementation**

Reescreva `web/src/steps/UploadStep.tsx`:

```tsx
import { useState } from "react";
import { uploadJob } from "../api";
import { formatSeconds } from "../util";
import type { StepProps } from "../App";

type Probe = { width: number; height: number; fps: number; duration: number };

export const UploadStep: React.FC<StepProps> = ({ slug, setSlug, next }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [localSlug, setLocalSlug] = useState(slug || "video1");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  };
  const move = (i: number, dir: -1 | 1) => {
    setFiles((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };
  const remove = (i: number) => setFiles((prev) => prev.filter((_, k) => k !== i));

  const onUpload = async () => {
    if (files.length === 0) return;
    setBusy(true); setErr(null);
    try {
      const r = await uploadJob(files, localSlug);
      setSlug(r.slug); setProbe(r.probe);
    } catch (e: any) {
      setErr(e.message ?? "erro no upload");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">1. Subir o(s) vídeo(s)</h2>
      <label className="block">
        <span className="text-sm text-zinc-400">Nome do projeto (slug)</span>
        <input
          className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={localSlug} onChange={(e) => setLocalSlug(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-400">Arquivos de vídeo (pode selecionar vários)</span>
        <input
          type="file" accept="video/*" multiple
          onChange={(e) => addFiles(e.target.files)}
          className="mt-1 block"
        />
      </label>

      {files.length > 0 && (
        <ol className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm"
            >
              <span className="text-zinc-500 w-5">{i + 1}.</span>
              <span className="flex-1 truncate">{f.name}</span>
              <button
                aria-label={`subir ${f.name}`} onClick={() => move(i, -1)}
                disabled={i === 0} className="px-2 disabled:opacity-30"
              >↑</button>
              <button
                aria-label={`descer ${f.name}`} onClick={() => move(i, 1)}
                disabled={i === files.length - 1} className="px-2 disabled:opacity-30"
              >↓</button>
              <button
                aria-label={`remover ${f.name}`} onClick={() => remove(i)}
                className="px-2 text-red-400"
              >×</button>
            </li>
          ))}
        </ol>
      )}

      <button
        onClick={onUpload} disabled={files.length === 0 || busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40"
      >
        {busy ? "Enviando..." : files.length > 1 ? `Juntar e enviar (${files.length})` : "Enviar"}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/__tests__/UploadStep.test.tsx`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add web/src/steps/UploadStep.tsx web/src/__tests__/UploadStep.test.tsx
git commit -m "feat(web): UploadStep multi-file selection with reorder"
```

---

## Task 7: verificação final (suíte completa + build)

**Files:** nenhum (só verificação)

- [ ] **Step 1: Rodar toda a suíte de backend**

Run: `.venv/bin/pytest -q`
Expected: todos passam (integração de concat/ingest/api pula se ffmpeg ausente).

- [ ] **Step 2: Rodar toda a suíte de frontend**

Run: `cd web && npx vitest run`
Expected: todos passam, incluindo os novos testes.

- [ ] **Step 3: Lint backend**

Run: `.venv/bin/ruff check pipeline api tests`
Expected: sem erros (confirmar que `import shutil` foi removido de `pipeline/stages.py`).

- [ ] **Step 4: Build do frontend**

Run: `cd web && npm run build`
Expected: build conclui sem erros de tipo.

- [ ] **Step 5: Smoke manual (opcional, requer ffmpeg)**

Suba a UI (`set -a && . ./.env && set +a && .venv/bin/uvicorn api.app:app --port 8000`), abra `http://localhost:8000`, entre em "Editar gravação", selecione 2 arquivos, reordene, clique "Juntar e enviar" e confirme que o probe do resultado aparece com a duração somada.
