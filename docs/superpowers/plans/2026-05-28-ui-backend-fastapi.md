# UI Local — Backend FastAPI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor o motor Python existente (`pipeline/`) através de uma API HTTP local (FastAPI) com rotas por estágio e SSE para progresso de transcrição e render. Entregar API utilizável via `curl`/TestClient antes do front-end.

**Architecture:** Um pacote `api/` com FastAPI. As rotas envelopam funções de `pipeline/stages.py` e o orquestrador de render. Estágios curtos (cut, recipe) são síncronos; longos (transcribe, render) usam `StreamingResponse` (SSE) com eventos `progress` e `done`. Modelos de request/response em pydantic. Persistência reutiliza `jobs/<slug>/`.

**Tech Stack:** Python 3.14, FastAPI, uvicorn, python-multipart (upload), pydantic v2, pytest + `fastapi.testclient.TestClient`. Reutiliza `pipeline/` e os binários em `bin/` (ffmpeg) e `.tools/node*/bin` (node, p/ render).

**Pré-requisitos:** Plano 1 (motor Python) e Plano 2 (Remotion) já implementados e validados. O job de amostra `jobs/sample/` e a fixture `tests/fixtures/make_sample.sh` existem.

**Contrato HTTP (definido aqui; consumido pelo Plano B):**
- `POST /api/jobs` (multipart `file`, opcional `slug`) → `{slug, probe}`
- `GET /api/jobs/{slug}` → `JobState`
- `POST /api/jobs/{slug}/cut` body `CutParams` → `{original_duration, trimmed_duration, segments}`
- `POST /api/jobs/{slug}/transcribe` body `TranscribeParams` → SSE
- `GET /api/jobs/{slug}/transcript` → `[CaptionLine]`
- `PUT /api/jobs/{slug}/transcript` body `[CaptionLine]` → `{ok: true}`
- `GET /api/jobs/{slug}/hook` → `Hook` (sugere se ausente)
- `PUT /api/jobs/{slug}/hook` body `Hook` → `{ok: true}`
- `POST /api/jobs/{slug}/recipe` → `{ok: true}`
- `POST /api/jobs/{slug}/render` → SSE
- `GET /api/jobs/{slug}/files/{name}` → stream do arquivo permitido
- `GET /api/jobs/{slug}/still?frame=N&format=main16x9|vertical9x16` → PNG

---

## File Structure

- `requirements.txt` — adicionar `fastapi`, `uvicorn`, `python-multipart`, `pydantic`.
- `api/__init__.py`
- `api/app.py` — cria FastAPI, monta rotas, monta `static/` (Plano B).
- `api/models.py` — pydantic: `ProbeOut`, `JobState`, `CutParams`, `CutResult`, `TranscribeParams`, `CaptionLine`, `WordOut`, `Hook`.
- `api/routes.py` — todos os endpoints.
- `api/jobs.py` — serviço: `get_state`, `save_video`, `update_config`, `read_transcript`, `write_transcript`, `read_hook`, `write_hook`, `allowed_file_path`, `suggest_hook`.
- `api/sse.py` — helpers para `StreamingResponse` SSE.
- `api/render.py` — invoca `npx remotion render`, parsa stdout, emite eventos.
- `api/tests/__init__.py`
- `api/tests/conftest.py` — fixture `client`, `tmp_job` (cria job temporário com artefatos pré-prontos).
- `api/tests/test_smoke.py`
- `api/tests/test_jobs.py`
- `api/tests/test_routes.py`

---

## Task 1: Dependências + scaffold + smoke

**Files:**
- Modify: `requirements.txt`
- Create: `api/__init__.py`, `api/app.py`, `api/tests/__init__.py`, `api/tests/conftest.py`, `api/tests/test_smoke.py`

- [ ] **Step 1: Adicionar deps**

Editar `requirements.txt` para:
```
pytest
faster-whisper
fastapi
uvicorn[standard]
python-multipart
pydantic>=2
```

Instalar:
```bash
.venv/bin/pip install -r requirements.txt
```
Expected: instala fastapi, uvicorn, python-multipart, pydantic v2.

- [ ] **Step 2: Pacote vazio + smoke test**

`api/__init__.py` vazio.
`api/tests/__init__.py` vazio.
`api/tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient
from api.app import app


@pytest.fixture
def client():
    return TestClient(app)
```

`api/tests/test_smoke.py`:
```python
def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `.venv/bin/pytest api/tests/test_smoke.py -v`
Expected: FAIL (ModuleNotFoundError: `api.app`).

- [ ] **Step 4: Implementar app.py**

`api/app.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="Video Edit Local UI")


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `.venv/bin/pytest api/tests/test_smoke.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add requirements.txt api/
git commit -m "feat(api): scaffold FastAPI + smoke /api/health"
```

(Trailer: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`)

---

## Task 2: Modelos pydantic

**Files:**
- Create: `api/models.py`
- Test: `api/tests/test_models.py`

- [ ] **Step 1: Teste**

`api/tests/test_models.py`:
```python
from api.models import JobState, CutParams, Hook, CaptionLine, WordOut


def test_cut_params_defaults():
    p = CutParams()
    assert p.silence_threshold_db == -30.0
    assert p.padding == 0.1
    assert p.min_silence == 0.5


def test_job_state_minimal():
    s = JobState(slug="x", probe=None, config=CutParams())
    assert s.has_trimmed is False
    assert s.has_transcript is False


def test_caption_line_roundtrip():
    line = CaptionLine(
        text="ola",
        start=0.0,
        end=0.5,
        words=[WordOut(word="ola", start=0.0, end=0.5)],
    )
    assert line.model_dump()["words"][0]["word"] == "ola"


def test_hook_defaults():
    h = Hook(title="x", subtitle="y")
    assert h.duration_frames == 90
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/pytest api/tests/test_models.py -v`
Expected: FAIL ModuleNotFoundError.

- [ ] **Step 3: Implementar models.py**

`api/models.py`:
```python
from pydantic import BaseModel, Field


class ProbeOut(BaseModel):
    width: int
    height: int
    fps: float
    duration: float


class CutParams(BaseModel):
    silence_threshold_db: float = -30.0
    padding: float = 0.1
    min_silence: float = 0.5


class TranscribeParams(BaseModel):
    model_size: str = "small"  # tiny|base|small|medium
    language: str = "pt"


class WordOut(BaseModel):
    word: str
    start: float
    end: float


class CaptionLine(BaseModel):
    text: str
    start: float
    end: float
    words: list[WordOut]


class Hook(BaseModel):
    title: str
    subtitle: str = ""
    duration_frames: int = 90


class CutSegmentOut(BaseModel):
    start: float
    end: float


class CutResult(BaseModel):
    original_duration: float
    trimmed_duration: float
    segments: list[CutSegmentOut]


class JobState(BaseModel):
    slug: str
    probe: ProbeOut | None = None
    config: CutParams = Field(default_factory=CutParams)
    has_trimmed: bool = False
    has_transcript: bool = False
    has_hook: bool = False
    has_recipe: bool = False
    has_render_16x9: bool = False
    has_render_9x16: bool = False
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/pytest api/tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/models.py api/tests/test_models.py
git commit -m "feat(api): modelos pydantic (JobState, CutParams, CaptionLine, Hook)"
```

---

## Task 3: Serviço de jobs (estado + I/O + sugestão de hook)

**Files:**
- Create: `api/jobs.py`, `api/tests/test_jobs.py`

- [ ] **Step 1: Testes (lógica pura)**

`api/tests/test_jobs.py`:
```python
import json
from pathlib import Path

from api.jobs import get_state, suggest_hook, allowed_file_path
from api.models import ProbeOut


def _write(p: Path, data):
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def test_get_state_empty(tmp_path):
    s = get_state("v1", tmp_path)
    assert s.slug == "v1"
    assert s.probe is None
    assert s.has_trimmed is False


def test_get_state_after_artifacts(tmp_path):
    job = tmp_path / "v1"
    job.mkdir()
    _write(job / "probe.json", {"width": 1920, "height": 1080, "fps": 30.0, "duration": 10.0})
    (job / "trimmed.mp4").write_bytes(b"x")
    _write(job / "transcript.json", [])
    s = get_state("v1", tmp_path)
    assert s.probe == ProbeOut(width=1920, height=1080, fps=30.0, duration=10.0)
    assert s.has_trimmed is True
    assert s.has_transcript is True


def test_suggest_hook_takes_first_sentence():
    transcript = [
        {"text": "Por que isso funciona? Eu vou contar.", "start": 0.0, "end": 2.5, "words": []},
    ]
    h = suggest_hook(transcript)
    assert h.title == "Por que isso funciona?"


def test_suggest_hook_empty():
    h = suggest_hook([])
    assert h.title == ""


def test_allowed_file_path_blocks_traversal(tmp_path):
    job = tmp_path / "v1"; job.mkdir()
    assert allowed_file_path(job, "trimmed.mp4") == job / "trimmed.mp4"
    assert allowed_file_path(job, "../etc/passwd") is None
    assert allowed_file_path(job, "source.mp4") is None  # source não é exposto
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/pytest api/tests/test_jobs.py -v`
Expected: FAIL ModuleNotFoundError.

- [ ] **Step 3: Implementar jobs.py**

`api/jobs.py`:
```python
import json
import re
from dataclasses import asdict
from pathlib import Path

from pipeline.job import JobConfig, init_job, load_json, write_json
from api.models import CutParams, Hook, JobState, ProbeOut


ALLOWED_FILES = {
    "trimmed.mp4",
    # arquivos de output são servidos por caminho separado, não aqui
}


def get_state(slug: str, jobs_root: Path) -> JobState:
    job_dir = Path(jobs_root) / slug
    probe = None
    if (job_dir / "probe.json").exists():
        d = load_json(job_dir / "probe.json")
        probe = ProbeOut(**d)
    config = CutParams()
    cfg_path = job_dir / "job.config.json"
    if cfg_path.exists():
        cfg = load_json(cfg_path)
        config = CutParams(
            silence_threshold_db=cfg.get("silence_threshold_db", -30.0),
            padding=cfg.get("padding", 0.1),
            min_silence=cfg.get("min_silence", 0.5),
        )
    return JobState(
        slug=slug,
        probe=probe,
        config=config,
        has_trimmed=(job_dir / "trimmed.mp4").exists(),
        has_transcript=(job_dir / "transcript.json").exists(),
        has_hook=(job_dir / "hook.json").exists(),
        has_recipe=(job_dir / "edit-recipe.json").exists(),
        has_render_16x9=False,  # preenchido pelo caller com OUTPUT_ROOT
        has_render_9x16=False,
    )


def update_config(slug: str, jobs_root: Path, params: CutParams) -> None:
    init_job(jobs_root, slug)  # garante existência
    cfg_path = Path(jobs_root) / slug / "job.config.json"
    cfg = load_json(cfg_path)
    cfg["silence_threshold_db"] = params.silence_threshold_db
    cfg["padding"] = params.padding
    cfg["min_silence"] = params.min_silence
    write_json(cfg_path, cfg)


def update_whisper_model(slug: str, jobs_root: Path, model_size: str, language: str) -> None:
    cfg_path = Path(jobs_root) / slug / "job.config.json"
    cfg = load_json(cfg_path)
    cfg["whisper_model"] = model_size
    cfg["language"] = language
    write_json(cfg_path, cfg)


def update_hook_card_frames(slug: str, jobs_root: Path, frames: int) -> None:
    cfg_path = Path(jobs_root) / slug / "job.config.json"
    cfg = load_json(cfg_path)
    cfg["hook_card_frames"] = frames
    write_json(cfg_path, cfg)


def suggest_hook(transcript: list[dict]) -> Hook:
    if not transcript:
        return Hook(title="", subtitle="")
    first_line = transcript[0]["text"]
    m = re.search(r"[.!?]", first_line)
    title = first_line[: m.end()] if m else first_line
    return Hook(title=title.strip(), subtitle="")


def allowed_file_path(job_dir: Path, name: str) -> Path | None:
    if name not in ALLOWED_FILES:
        return None
    candidate = (job_dir / name).resolve()
    try:
        candidate.relative_to(job_dir.resolve())
    except ValueError:
        return None
    return candidate
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/pytest api/tests/test_jobs.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/jobs.py api/tests/test_jobs.py
git commit -m "feat(api): serviço de jobs (estado, config, sugestão de hook)"
```

---

## Task 4: POST /api/jobs (upload + ingest)

**Files:**
- Create: `api/routes.py`
- Modify: `api/app.py`
- Test: `api/tests/test_routes.py`

- [ ] **Step 1: Teste**

Adicionar fixture em `api/tests/conftest.py`:
```python
import shutil
import os
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from api.app import app


@pytest.fixture
def tmp_root(tmp_path, monkeypatch):
    jobs = tmp_path / "jobs"
    inp = tmp_path / "input"
    outp = tmp_path / "output"
    for p in (jobs, inp, outp):
        p.mkdir()
    monkeypatch.setenv("JOBS_ROOT", str(jobs))
    monkeypatch.setenv("INPUT_ROOT", str(inp))
    monkeypatch.setenv("OUTPUT_ROOT", str(outp))
    return tmp_path


@pytest.fixture
def client(tmp_root):
    return TestClient(app)


@pytest.fixture
def sample_mp4():
    """Mini mp4 gerado pela fixture do Plano 1."""
    fixture = Path("tests/fixtures/sample-short.mp4")
    if not fixture.exists():
        # cria com ffmpeg se o helper existir
        os.makedirs("tests/fixtures", exist_ok=True)
        import subprocess
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=gray:s=320x240:d=2",
            "-f", "lavfi", "-i", "sine=frequency=300:d=2",
            "-shortest", "-pix_fmt", "yuv420p", str(fixture)
        ], check=True, capture_output=True)
    return fixture
```

`api/tests/test_routes.py`:
```python
def test_post_jobs_uploads_and_ingests(client, sample_mp4):
    with open(sample_mp4, "rb") as f:
        r = client.post("/api/jobs", data={"slug": "t1"}, files={"file": ("sample.mp4", f, "video/mp4")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["slug"] == "t1"
    assert body["probe"]["width"] > 0
    assert body["probe"]["height"] > 0
    assert body["probe"]["duration"] > 0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/pytest api/tests/test_routes.py::test_post_jobs_uploads_and_ingests -v`
Expected: FAIL 404 ou ImportError.

- [ ] **Step 3: Implementar routes.py (upload)**

`api/routes.py`:
```python
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from api.jobs import get_state
from api.models import ProbeOut
from pipeline.job import init_job
from pipeline.stages import stage_ingest

router = APIRouter(prefix="/api")


def _roots() -> tuple[Path, Path, Path]:
    return (
        Path(os.environ.get("JOBS_ROOT", "jobs")),
        Path(os.environ.get("INPUT_ROOT", "input")),
        Path(os.environ.get("OUTPUT_ROOT", "output")),
    )


@router.post("/jobs")
async def create_job(file: UploadFile = File(...), slug: str = Form(default="job")):
    jobs_root, input_root, _ = _roots()
    input_root.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "").suffix or ".mp4"
    upload_path = input_root / f"{slug}{suffix}"
    with upload_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    job = init_job(jobs_root, slug)
    try:
        stage_ingest(job, str(upload_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ingest falhou: {e}")
    state = get_state(slug, jobs_root)
    return {"slug": slug, "probe": state.probe.model_dump() if state.probe else None}
```

`api/app.py` (modificar para incluir router):
```python
from fastapi import FastAPI
from api.routes import router

app = FastAPI(title="Video Edit Local UI")
app.include_router(router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/pytest api/tests/test_routes.py -v`
Expected: PASS (1 passa).

(Nota: o teste precisa do ffmpeg para gerar a fixture; o ambiente atual tem ffmpeg em `bin/`. O test runner deve estar com PATH apropriado.)

- [ ] **Step 5: Commit**

```bash
git add api/routes.py api/app.py api/tests/conftest.py api/tests/test_routes.py
git commit -m "feat(api): POST /api/jobs (upload + ingest)"
```

---

## Task 5: GET /api/jobs/{slug}

**Files:** Modify `api/routes.py`, add test em `api/tests/test_routes.py`.

- [ ] **Step 1: Teste**

Adicionar em `test_routes.py`:
```python
def test_get_job_state_after_upload(client, sample_mp4):
    with open(sample_mp4, "rb") as f:
        client.post("/api/jobs", data={"slug": "t2"}, files={"file": ("s.mp4", f, "video/mp4")})
    r = client.get("/api/jobs/t2")
    assert r.status_code == 200
    s = r.json()
    assert s["slug"] == "t2"
    assert s["probe"]["width"] > 0
    assert s["has_trimmed"] is False
```

- [ ] **Step 2: Rodar e ver falhar** (404).

- [ ] **Step 3: Implementar**

Adicionar em `api/routes.py`:
```python
@router.get("/jobs/{slug}")
def read_job(slug: str):
    jobs_root, _, output_root = _roots()
    state = get_state(slug, jobs_root)
    # marcar renders se existem
    state.has_render_16x9 = (output_root / f"{slug}-16x9.mp4").exists()
    state.has_render_9x16 = (output_root / f"{slug}-9x16.mp4").exists()
    return state.model_dump()
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit**

```bash
git add api/routes.py api/tests/test_routes.py
git commit -m "feat(api): GET /api/jobs/{slug}"
```

---

## Task 6: POST /api/jobs/{slug}/cut

**Files:** Modify `api/routes.py`, add test.

- [ ] **Step 1: Teste**

Adicionar em `test_routes.py`:
```python
def test_cut_after_ingest(client, sample_mp4):
    with open(sample_mp4, "rb") as f:
        client.post("/api/jobs", data={"slug": "t3"}, files={"file": ("s.mp4", f, "video/mp4")})
    r = client.post("/api/jobs/t3/cut", json={
        "silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["original_duration"] > 0
    assert body["trimmed_duration"] >= 0
    assert isinstance(body["segments"], list)
```

- [ ] **Step 2: Falha.**

- [ ] **Step 3: Implementar**

Adicionar em `api/routes.py`:
```python
from api.models import CutParams, CutResult, CutSegmentOut
from api.jobs import update_config
from pipeline.stages import stage_cut
from pipeline.job import init_job, load_json


@router.post("/jobs/{slug}/cut")
def run_cut(slug: str, params: CutParams):
    jobs_root, *_ = _roots()
    update_config(slug, jobs_root, params)
    job = init_job(jobs_root, slug)
    try:
        stage_cut(job)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"cut falhou: {e}")
    cuts = load_json(job.dir / "cuts.json")
    probe = load_json(job.dir / "probe.json")
    tprobe = load_json(job.dir / "trimmed.probe.json")
    return CutResult(
        original_duration=probe["duration"],
        trimmed_duration=tprobe["duration"],
        segments=[CutSegmentOut(**c) for c in cuts],
    ).model_dump()
```

- [ ] **Step 4: Passa.**

- [ ] **Step 5: Commit**

```bash
git add api/routes.py api/tests/test_routes.py
git commit -m "feat(api): POST /api/jobs/{slug}/cut"
```

---

## Task 7: SSE helpers + POST /api/jobs/{slug}/transcribe

**Files:** Create `api/sse.py`, modify `api/routes.py`, tests com mock.

- [ ] **Step 1: Implementar SSE helper**

`api/sse.py`:
```python
import json
from typing import AsyncIterator


def sse_event(event: str, data) -> str:
    payload = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


async def to_sse(stream: AsyncIterator[tuple[str, object]]) -> AsyncIterator[str]:
    async for event, data in stream:
        yield sse_event(event, data)
```

- [ ] **Step 2: Teste do transcribe (mocka pipeline.stages.transcribe_audio)**

Em `api/tests/test_routes.py`:
```python
import json


def test_transcribe_sse_returns_done_event(client, sample_mp4, monkeypatch):
    # mocka faster-whisper (lento)
    from pipeline import stages
    fake = [{"text": "ola", "start": 0.0, "end": 0.5,
             "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}]
    monkeypatch.setattr(stages, "transcribe_audio", lambda *a, **k: fake)

    with open(sample_mp4, "rb") as f:
        client.post("/api/jobs", data={"slug": "t4"}, files={"file": ("s.mp4", f, "video/mp4")})
    client.post("/api/jobs/t4/cut", json={
        "silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3
    })

    with client.stream("POST", "/api/jobs/t4/transcribe",
                       json={"model_size": "tiny", "language": "pt"}) as r:
        events = []
        for chunk in r.iter_lines():
            if chunk.startswith("event:"):
                events.append(chunk.split(":", 1)[1].strip())
    assert "done" in events
    # transcript.json foi escrito
    r2 = client.get("/api/jobs/t4/transcript")
    assert r2.status_code == 200
    assert r2.json()[0]["text"] == "ola"
```

(Esse teste também valida `GET /transcript` da Task 8 — escreva-o agora.)

- [ ] **Step 3: Falha.**

- [ ] **Step 4: Implementar transcribe (SSE)**

Adicionar em `api/routes.py`:
```python
import asyncio
from fastapi.responses import StreamingResponse
from api.models import TranscribeParams
from api.jobs import update_whisper_model
from api.sse import sse_event
from pipeline.stages import stage_transcribe


@router.post("/jobs/{slug}/transcribe")
async def run_transcribe(slug: str, params: TranscribeParams):
    jobs_root, *_ = _roots()
    update_whisper_model(slug, jobs_root, params.model_size, params.language)
    job = init_job(jobs_root, slug)

    async def gen():
        yield sse_event("progress", {"stage": "loading_model"})
        # roda em thread pra não bloquear o event loop
        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, stage_transcribe, job)
        except Exception as e:
            yield sse_event("error", {"detail": str(e)})
            return
        yield sse_event("done", {"ok": True})

    return StreamingResponse(gen(), media_type="text/event-stream")
```

- [ ] **Step 5: Passa.**

- [ ] **Step 6: Commit**

```bash
git add api/sse.py api/routes.py api/tests/test_routes.py
git commit -m "feat(api): SSE helpers + POST /transcribe"
```

---

## Task 8: GET/PUT /api/jobs/{slug}/transcript

**Files:** Modify `api/routes.py`. (Test do GET já no Task 7; adicionar PUT.)

- [ ] **Step 1: Teste PUT**

Adicionar em `test_routes.py`:
```python
def test_put_transcript_overwrites(client, sample_mp4, monkeypatch):
    from pipeline import stages
    fake = [{"text": "ola", "start": 0.0, "end": 0.5,
             "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}]
    monkeypatch.setattr(stages, "transcribe_audio", lambda *a, **k: fake)
    with open(sample_mp4, "rb") as f:
        client.post("/api/jobs", data={"slug": "t5"}, files={"file": ("s.mp4", f, "video/mp4")})
    client.post("/api/jobs/t5/cut", json={
        "silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3
    })
    with client.stream("POST", "/api/jobs/t5/transcribe",
                       json={"model_size": "tiny", "language": "pt"}) as r:
        list(r.iter_lines())

    new = [{"text": "tchau", "start": 0.0, "end": 0.4,
            "words": [{"word": "tchau", "start": 0.0, "end": 0.4}]}]
    r = client.put("/api/jobs/t5/transcript", json=new)
    assert r.status_code == 200

    r2 = client.get("/api/jobs/t5/transcript")
    assert r2.json()[0]["text"] == "tchau"
```

- [ ] **Step 2: Falha (PUT não existe).**

- [ ] **Step 3: Implementar GET + PUT**

Adicionar em `api/routes.py`:
```python
from pathlib import Path as _P


@router.get("/jobs/{slug}/transcript")
def get_transcript(slug: str):
    jobs_root, *_ = _roots()
    p = _P(jobs_root) / slug / "transcript.json"
    if not p.exists():
        raise HTTPException(status_code=404, detail="transcript inexistente")
    return load_json(p)


@router.put("/jobs/{slug}/transcript")
def put_transcript(slug: str, lines: list[dict]):
    jobs_root, *_ = _roots()
    p = _P(jobs_root) / slug / "transcript.json"
    from pipeline.job import write_json
    write_json(p, lines)
    return {"ok": True}
```

- [ ] **Step 4: Passa.**

- [ ] **Step 5: Commit**

```bash
git add api/routes.py api/tests/test_routes.py
git commit -m "feat(api): GET/PUT /transcript"
```

---

## Task 9: GET/PUT /api/jobs/{slug}/hook + sugestão

**Files:** Modify `api/routes.py`, test.

- [ ] **Step 1: Teste**

Em `test_routes.py`:
```python
def test_hook_get_suggests_then_put_saves(client, sample_mp4, monkeypatch):
    from pipeline import stages
    fake = [{"text": "Por que isso funciona? Eu explico.", "start": 0.0, "end": 2.5,
             "words": [{"word": "Por", "start": 0.0, "end": 0.2}]}]
    monkeypatch.setattr(stages, "transcribe_audio", lambda *a, **k: fake)
    with open(sample_mp4, "rb") as f:
        client.post("/api/jobs", data={"slug": "t6"}, files={"file": ("s.mp4", f, "video/mp4")})
    client.post("/api/jobs/t6/cut", json={
        "silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3
    })
    with client.stream("POST", "/api/jobs/t6/transcribe",
                       json={"model_size": "tiny", "language": "pt"}) as r:
        list(r.iter_lines())

    r = client.get("/api/jobs/t6/hook")
    assert r.status_code == 200
    assert r.json()["title"] == "Por que isso funciona?"

    r2 = client.put("/api/jobs/t6/hook",
                    json={"title": "Outro título", "subtitle": "sub", "duration_frames": 60})
    assert r2.status_code == 200

    r3 = client.get("/api/jobs/t6/hook")
    assert r3.json()["title"] == "Outro título"
```

- [ ] **Step 2: Falha.**

- [ ] **Step 3: Implementar**

Adicionar em `api/routes.py`:
```python
from api.models import Hook
from api.jobs import suggest_hook, update_hook_card_frames


@router.get("/jobs/{slug}/hook")
def get_hook(slug: str):
    jobs_root, *_ = _roots()
    job_dir = _P(jobs_root) / slug
    p = job_dir / "hook.json"
    if p.exists():
        d = load_json(p)
        return Hook(title=d["title"], subtitle=d.get("subtitle", ""),
                    duration_frames=d.get("duration_frames", 90)).model_dump()
    # sugerir a partir do transcript se existir
    tpath = job_dir / "transcript.json"
    if tpath.exists():
        return suggest_hook(load_json(tpath)).model_dump()
    return Hook(title="", subtitle="").model_dump()


@router.put("/jobs/{slug}/hook")
def put_hook(slug: str, hook: Hook):
    jobs_root, *_ = _roots()
    from pipeline.job import write_json
    write_json(_P(jobs_root) / slug / "hook.json",
               {"title": hook.title, "subtitle": hook.subtitle,
                "duration_frames": hook.duration_frames})
    update_hook_card_frames(slug, jobs_root, hook.duration_frames)
    return {"ok": True}
```

- [ ] **Step 4: Passa.**

- [ ] **Step 5: Commit**

```bash
git add api/routes.py api/tests/test_routes.py
git commit -m "feat(api): GET/PUT /hook com sugestão automática"
```

---

## Task 10: POST /api/jobs/{slug}/recipe

**Files:** Modify `api/routes.py`, test.

- [ ] **Step 1: Teste**

```python
def test_recipe_after_hook_set(client, sample_mp4, monkeypatch):
    from pipeline import stages
    fake = [{"text": "ola", "start": 0.0, "end": 0.5,
             "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}]
    monkeypatch.setattr(stages, "transcribe_audio", lambda *a, **k: fake)
    with open(sample_mp4, "rb") as f:
        client.post("/api/jobs", data={"slug": "t7"}, files={"file": ("s.mp4", f, "video/mp4")})
    client.post("/api/jobs/t7/cut", json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3})
    with client.stream("POST", "/api/jobs/t7/transcribe",
                       json={"model_size": "tiny", "language": "pt"}) as r:
        list(r.iter_lines())
    client.put("/api/jobs/t7/hook", json={"title": "T", "subtitle": "S", "duration_frames": 60})
    r = client.post("/api/jobs/t7/recipe")
    assert r.status_code == 200
    s = client.get("/api/jobs/t7")
    assert s.json()["has_recipe"] is True
```

- [ ] **Step 2: Falha.**

- [ ] **Step 3: Implementar**

```python
from pipeline.stages import stage_recipe


@router.post("/jobs/{slug}/recipe")
def run_recipe(slug: str):
    jobs_root, *_ = _roots()
    job = init_job(jobs_root, slug)
    try:
        stage_recipe(job)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"recipe falhou: {e}")
    return {"ok": True}
```

- [ ] **Step 4: Passa.**

- [ ] **Step 5: Commit**

```bash
git add api/routes.py api/tests/test_routes.py
git commit -m "feat(api): POST /recipe"
```

---

## Task 11: GET /api/jobs/{slug}/files/{name}

**Files:** Modify `api/routes.py`, test.

- [ ] **Step 1: Teste**

```python
def test_files_serves_trimmed_only(client, sample_mp4):
    with open(sample_mp4, "rb") as f:
        client.post("/api/jobs", data={"slug": "t8"}, files={"file": ("s.mp4", f, "video/mp4")})
    client.post("/api/jobs/t8/cut", json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3})
    r = client.get("/api/jobs/t8/files/trimmed.mp4")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("video/")
    r2 = client.get("/api/jobs/t8/files/source.mp4")
    assert r2.status_code == 404
    r3 = client.get("/api/jobs/t8/files/../etc/passwd")
    assert r3.status_code in (400, 404)
```

- [ ] **Step 2: Falha.**

- [ ] **Step 3: Implementar**

```python
from fastapi.responses import FileResponse


@router.get("/jobs/{slug}/files/{name}")
def get_file(slug: str, name: str):
    jobs_root, _, output_root = _roots()
    # job-scoped (trimmed.mp4)
    job_dir = _P(jobs_root) / slug
    from api.jobs import allowed_file_path
    p = allowed_file_path(job_dir, name)
    if p and p.exists():
        return FileResponse(p, media_type="video/mp4", filename=name)
    # outputs (<slug>-16x9.mp4 e <slug>-9x16.mp4)
    if name in {f"{slug}-16x9.mp4", f"{slug}-9x16.mp4"}:
        op = output_root / name
        if op.exists():
            return FileResponse(op, media_type="video/mp4", filename=name)
    raise HTTPException(status_code=404, detail="arquivo não disponível")
```

- [ ] **Step 4: Passa.**

- [ ] **Step 5: Commit**

```bash
git add api/routes.py api/tests/test_routes.py
git commit -m "feat(api): GET /files/{name} (trimmed + renders, sandbox)"
```

---

## Task 12: POST /api/jobs/{slug}/render (SSE) + parser de progresso

**Files:** Create `api/render.py`, modify `api/routes.py`, tests com mock de subprocess.

- [ ] **Step 1: Teste do parser (lógica pura)**

`api/tests/test_render.py`:
```python
from api.render import parse_progress


def test_parse_progress_encoded():
    assert parse_progress("Encoded 310/664") == ("encoded", 310, 664)


def test_parse_progress_rendered():
    assert parse_progress("Rendered 200/664, time remaining: 0s") == ("rendered", 200, 664)


def test_parse_progress_irrelevant_line():
    assert parse_progress("hello world") is None
```

- [ ] **Step 2: Falha (ModuleNotFoundError).**

- [ ] **Step 3: Implementar parser + render runner**

`api/render.py`:
```python
import asyncio
import os
import re
from pathlib import Path

PROG_RE = re.compile(r"^(Rendered|Encoded)\s+(\d+)/(\d+)")


def parse_progress(line: str):
    m = PROG_RE.match(line.strip())
    if not m:
        return None
    kind = m.group(1).lower()
    return (kind, int(m.group(2)), int(m.group(3)))


async def run_remotion(composition: str, out_path: Path, props_path: Path, remotion_dir: Path,
                       env: dict) -> asyncio.subprocess.Process:
    cmd = ["npx", "remotion", "render", composition, str(out_path), f"--props={props_path}"]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        cwd=str(remotion_dir), env=env,
    )
    return proc
```

- [ ] **Step 4: Passa.**

- [ ] **Step 5: Teste do endpoint (mocka subprocess)**

Em `api/tests/test_routes.py`:
```python
def test_render_sse_emits_progress_and_done(client, sample_mp4, monkeypatch, tmp_path):
    # mock: substitui run_remotion por um fake que emite linhas + sucesso
    from api import render as render_mod

    class FakeProc:
        def __init__(self, lines):
            self._lines = list(lines)
            self.stdout = self
            self.returncode = 0
        async def readline(self):
            if self._lines:
                return (self._lines.pop(0) + "\n").encode()
            return b""
        async def wait(self):
            return 0

    fake_lines = ["Rendered 0/2", "Encoded 1/2", "Encoded 2/2"]

    async def fake_run(composition, out_path, props_path, remotion_dir, env):
        # também cria o arquivo de saída para a verificação posterior
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"x")
        return FakeProc(fake_lines)

    monkeypatch.setattr(render_mod, "run_remotion", fake_run)

    # preparar o job com edit-recipe + trimmed.mp4
    from pipeline import stages
    fake = [{"text": "ola", "start": 0.0, "end": 0.5,
             "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}]
    monkeypatch.setattr(stages, "transcribe_audio", lambda *a, **k: fake)
    with open(sample_mp4, "rb") as f:
        client.post("/api/jobs", data={"slug": "t9"}, files={"file": ("s.mp4", f, "video/mp4")})
    client.post("/api/jobs/t9/cut", json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3})
    with client.stream("POST", "/api/jobs/t9/transcribe",
                       json={"model_size": "tiny", "language": "pt"}) as r:
        list(r.iter_lines())
    client.put("/api/jobs/t9/hook", json={"title": "T", "subtitle": "S", "duration_frames": 60})
    client.post("/api/jobs/t9/recipe")

    with client.stream("POST", "/api/jobs/t9/render") as r:
        events = []
        for line in r.iter_lines():
            if line.startswith("event:"):
                events.append(line.split(":", 1)[1].strip())
    assert events.count("progress") >= 2
    assert events[-1] == "done"
```

- [ ] **Step 6: Falha.**

- [ ] **Step 7: Implementar endpoint**

Adicionar em `api/routes.py`:
```python
import os as _os
from api.render import run_remotion, parse_progress
from api.sse import sse_event


@router.post("/jobs/{slug}/render")
async def run_render(slug: str):
    jobs_root, _, output_root = _roots()
    output_root.mkdir(parents=True, exist_ok=True)
    job_dir = _P(jobs_root) / slug
    props_path = job_dir / "edit-recipe.json"
    if not props_path.exists():
        raise HTTPException(status_code=409, detail="edit-recipe.json não existe; rode /recipe antes")

    remotion_dir = _P("remotion")
    # publica trimmed + brand para o Remotion (como faz scripts/edit-video.sh)
    pub = remotion_dir / "public"
    pub.mkdir(parents=True, exist_ok=True)
    shutil.copy(job_dir / "trimmed.mp4", pub / "trimmed.mp4")
    shutil.copy("brand/brand.json", remotion_dir / "src" / "brand.json")

    env = _os.environ.copy()
    # garante node + ffmpeg no PATH
    extras = [str(_P("bin").resolve())]
    node_bin = next(_P(".tools").glob("node-*/bin"), None)
    if node_bin:
        extras.append(str(node_bin.resolve()))
    env["PATH"] = ":".join(extras + [env.get("PATH", "")])

    async def gen():
        for fmt, out_name in [("Main16x9", f"{slug}-16x9.mp4"),
                              ("Vertical9x16", f"{slug}-9x16.mp4")]:
            out_path = output_root / out_name
            try:
                proc = await run_remotion(fmt, out_path, props_path, remotion_dir, env)
            except Exception as e:
                yield sse_event("error", {"detail": str(e)})
                return
            while True:
                raw = await proc.stdout.readline()
                if not raw:
                    break
                line = raw.decode(errors="ignore").strip()
                p = parse_progress(line)
                if p:
                    kind, n, total = p
                    yield sse_event("progress", {"format": fmt, "kind": kind, "n": n, "total": total})
            rc = await proc.wait()
            if rc != 0:
                yield sse_event("error", {"detail": f"render {fmt} retornou {rc}"})
                return
            yield sse_event("progress", {"format": fmt, "kind": "encoded", "n": 1, "total": 1, "done_format": True})
        yield sse_event("done", {"ok": True})

    return StreamingResponse(gen(), media_type="text/event-stream")
```

- [ ] **Step 8: Passa.**

- [ ] **Step 9: Commit**

```bash
git add api/render.py api/routes.py api/tests/test_render.py api/tests/test_routes.py
git commit -m "feat(api): POST /render (SSE com progresso via parser do stdout)"
```

---

## Task 13: GET /api/jobs/{slug}/still (prévia do hook)

**Files:** Modify `api/routes.py`, modify `api/render.py`, test.

- [ ] **Step 1: Teste (mocka subprocess do still)**

```python
def test_still_renders_png(client, sample_mp4, monkeypatch, tmp_path):
    from api import render as render_mod

    class FakeProc:
        returncode = 0
        async def wait(self): return 0
        async def communicate(self): return (b"", b"")

    async def fake_run_still(comp, out_path, frame, props_path, remotion_dir, env):
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"\x89PNG\r\n\x1a\nfake")
        return FakeProc()

    monkeypatch.setattr(render_mod, "run_remotion_still", fake_run_still)

    # job pronto até recipe
    from pipeline import stages
    monkeypatch.setattr(stages, "transcribe_audio",
                        lambda *a, **k: [{"text": "ola", "start": 0.0, "end": 0.5,
                                          "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}])
    with open(sample_mp4, "rb") as f:
        client.post("/api/jobs", data={"slug": "t10"}, files={"file": ("s.mp4", f, "video/mp4")})
    client.post("/api/jobs/t10/cut", json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3})
    with client.stream("POST", "/api/jobs/t10/transcribe",
                       json={"model_size": "tiny", "language": "pt"}) as r:
        list(r.iter_lines())
    client.put("/api/jobs/t10/hook", json={"title": "T", "subtitle": "S", "duration_frames": 60})
    client.post("/api/jobs/t10/recipe")

    r = client.get("/api/jobs/t10/still?frame=30&format=main16x9")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content.startswith(b"\x89PNG")
```

- [ ] **Step 2: Falha.**

- [ ] **Step 3: Implementar run_remotion_still + endpoint**

Adicionar em `api/render.py`:
```python
async def run_remotion_still(composition: str, out_path: Path, frame: int,
                             props_path: Path, remotion_dir: Path, env: dict):
    cmd = ["npx", "remotion", "still", composition, str(out_path),
           f"--frame={frame}", f"--props={props_path}"]
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        cwd=str(remotion_dir), env=env,
    )
    await proc.wait()
    return proc
```

Adicionar em `api/routes.py`:
```python
import tempfile
from api.render import run_remotion_still


@router.get("/jobs/{slug}/still")
async def get_still(slug: str, frame: int = 0, format: str = "main16x9"):
    if format not in {"main16x9", "vertical9x16"}:
        raise HTTPException(status_code=400, detail="format inválido")
    composition = "Main16x9" if format == "main16x9" else "Vertical9x16"
    jobs_root, _, output_root = _roots()
    props_path = _P(jobs_root) / slug / "edit-recipe.json"
    if not props_path.exists():
        raise HTTPException(status_code=409, detail="recipe ausente")

    remotion_dir = _P("remotion")
    # publica trimmed + brand
    pub = remotion_dir / "public"; pub.mkdir(parents=True, exist_ok=True)
    if not (pub / "trimmed.mp4").exists():
        shutil.copy(_P(jobs_root) / slug / "trimmed.mp4", pub / "trimmed.mp4")
    shutil.copy("brand/brand.json", remotion_dir / "src" / "brand.json")

    env = _os.environ.copy()
    extras = [str(_P("bin").resolve())]
    node_bin = next(_P(".tools").glob("node-*/bin"), None)
    if node_bin:
        extras.append(str(node_bin.resolve()))
    env["PATH"] = ":".join(extras + [env.get("PATH", "")])

    out = output_root / f".still-{slug}-{format}-{frame}.png"
    proc = await run_remotion_still(composition, out, frame, props_path, remotion_dir, env)
    if proc.returncode != 0 or not out.exists():
        raise HTTPException(status_code=500, detail="still falhou")
    return FileResponse(out, media_type="image/png")
```

- [ ] **Step 4: Passa.**

- [ ] **Step 5: Commit**

```bash
git add api/routes.py api/render.py api/tests/test_routes.py
git commit -m "feat(api): GET /still (prévia do hook on-demand)"
```

---

## Task 14: Servir SPA buildada + montagem de estáticos

**Files:** Modify `api/app.py`.

- [ ] **Step 1: Teste**

`api/tests/test_static.py`:
```python
from pathlib import Path


def test_static_index_served_when_present(client, tmp_path, monkeypatch):
    # cria api/static/index.html fake
    sd = Path("api/static")
    sd.mkdir(parents=True, exist_ok=True)
    (sd / "index.html").write_text("<html>OK</html>")
    try:
        r = client.get("/")
        assert r.status_code == 200
        assert "OK" in r.text
    finally:
        (sd / "index.html").unlink(missing_ok=True)
```

- [ ] **Step 2: Falha (404).**

- [ ] **Step 3: Implementar**

Modificar `api/app.py`:
```python
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from api.routes import router

app = FastAPI(title="Video Edit Local UI")
app.include_router(router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


_STATIC = Path("api/static")
if _STATIC.exists():
    app.mount("/assets", StaticFiles(directory=_STATIC / "assets"), name="assets")


@app.get("/")
def root():
    idx = _STATIC / "index.html"
    if idx.exists():
        return FileResponse(idx)
    return HTMLResponse("<h1>UI ainda não buildada. Veja scripts/ui.sh.</h1>", status_code=200)


@app.get("/{path:path}")
def spa_fallback(path: str):
    # qualquer rota não-API cai no index.html (SPA routing)
    if path.startswith("api/"):
        return HTMLResponse("not found", status_code=404)
    idx = _STATIC / "index.html"
    if idx.exists():
        return FileResponse(idx)
    return HTMLResponse("UI não buildada", status_code=404)
```

- [ ] **Step 4: Passa.**

- [ ] **Step 5: Commit**

```bash
git add api/app.py api/tests/test_static.py
git commit -m "feat(api): serve SPA buildada de api/static com fallback"
```

---

## Task 15: scripts/ui.sh (boot completo)

**Files:** Create `scripts/ui.sh`.

- [ ] **Step 1: Implementar**

`scripts/ui.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Ferramentas locais
NODE_BIN="$(find "$ROOT/.tools" -maxdepth 2 -type d -name bin -path '*node*' 2>/dev/null | head -1)"
export PATH="$ROOT/bin:${NODE_BIN:-}:$PATH"

# Build do front (se existir)
if [ -d "$ROOT/web" ] && [ -f "$ROOT/web/package.json" ]; then
  (cd "$ROOT/web" && npm install --silent && npm run build)
  rm -rf "$ROOT/api/static"
  mkdir -p "$ROOT/api/static"
  cp -r "$ROOT/web/dist/." "$ROOT/api/static/"
fi

# Start
PORT="${PORT:-8000}"
echo ""
echo "▶ UI rodando em http://localhost:$PORT"
echo "  Cmd+Shift+P → Simple Browser: Show → http://localhost:$PORT"
echo ""
exec "$ROOT/.venv/bin/uvicorn" api.app:app --host 0.0.0.0 --port "$PORT"
```

- [ ] **Step 2: Executável**

```bash
chmod +x scripts/ui.sh
```

- [ ] **Step 3: Smoke manual (apenas backend, sem web/)**

```bash
.venv/bin/uvicorn api.app:app --port 8000 &
sleep 2
curl -sf http://localhost:8000/api/health | grep -q '"status":"ok"'
kill %1
```
Expected: imprime `{"status":"ok"}` e sai sem erro.

- [ ] **Step 4: Commit**

```bash
git add scripts/ui.sh
git commit -m "feat(api): scripts/ui.sh — build front + uvicorn"
```

---

## Task 16: Suíte completa final + smoke end-to-end (com mocks dos pesados)

**Files:** nenhum novo (verificação).

- [ ] **Step 1: Rodar a suíte completa**

Run: `.venv/bin/pytest -q`
Expected: tudo PASS (motor original do Plano 1 + nova suíte API).

- [ ] **Step 2: Smoke real (opcional, sem mocks — usa o job 'video1' já existente)**

```bash
.venv/bin/uvicorn api.app:app --port 8000 &
sleep 2
curl -s http://localhost:8000/api/jobs/video1 | python -m json.tool | head -20
kill %1
```
Expected: retorna o JobState do video1 com `has_render_16x9: true`.

- [ ] **Step 3: Commit (apenas se alterou algo durante verificação)**

```bash
git status  # se houver mudanças, commit; caso contrário pular
```

---

## Self-Review (resultado)

- **Cobertura do spec:** Todas as rotas listadas no spec implementadas:
  - `POST /jobs` (Task 4), `GET /jobs/{slug}` (Task 5), `POST /cut` (Task 6), `POST /transcribe` SSE (Task 7), `GET/PUT /transcript` (Task 8), `GET/PUT /hook` (Task 9), `POST /recipe` (Task 10), `GET /files/{name}` (Task 11), `POST /render` SSE (Task 12), `GET /still` (Task 13).
  - PATCH /config consolidado: cada estágio que precisa de parâmetros os recebe inline (cut, transcribe, hook) e persiste no `job.config.json` via funções `update_*`. Não há PATCH separado — simplifica e segue o spec ("update JobConfig" via os endpoints relevantes).
- **Tooling/PATH:** o `render.py` injeta `bin/` e `.tools/node-*/bin` no PATH a cada chamada. Não depende de `scripts/ui.sh` (a UI também funciona se o usuário rodar `uvicorn` direto). Garantia de portabilidade entre dev e Coolify (no container, esses caminhos não vão existir — o `PATH` do container já terá node/ffmpeg, e os `glob`/`find` simplesmente não acharão nada extra para adicionar; OK).
- **Placeholders:** nenhum.
- **Consistência:** `JobState`/`CutParams`/`Hook`/`CaptionLine` definidos em models.py e usados consistentes em todas as rotas e testes. Nomes de chaves (`silence_threshold_db`, `padding`, `min_silence`, `duration_frames`, `has_*`) idênticos entre models, jobs.py e routes.py.
- **Notas conhecidas:** (1) testes que dependem do ffmpeg real (`sample_mp4` fixture chama ffmpeg pra gerar a amostra) precisam de `PATH` com `bin/`; rodar pytest a partir de um shell com `export PATH="$PWD/bin:$PATH"` resolve. (2) O still é renderizado on-demand e fica em `output/.still-*` (não-versionado); pode ser limpado periodicamente — fora do escopo da v1.
