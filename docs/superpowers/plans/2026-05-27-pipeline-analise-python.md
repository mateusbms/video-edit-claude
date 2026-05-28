# Pipeline de Análise (Python) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A partir de uma filmagem crua, produzir um `edit-recipe.json` validado + `trimmed.mp4` (vídeo sem pausas) — pronto para o render Remotion (Plano 2).

**Architecture:** Pipeline Python em estágios idempotentes que escrevem artefatos num diretório de job. `ffprobe` extrai metadados; `ffmpeg silencedetect` detecta silêncios e nossa lógica calcula os segmentos de fala mantidos; `faster-whisper` transcreve com timestamp por palavra; `build_recipe` agrupa palavras em linhas de legenda, converte segundos→frames e monta a timeline polimórfica (`card` + `clip`). O miolo (matemática de segmentos, agrupamento de legendas, montagem da recipe) é lógica pura e coberta por TDD; as chamadas a ffmpeg/whisper são integrações finas e testadas com fixtures/mocks.

**Tech Stack:** Python 3.14, pytest, ffmpeg/ffprobe, faster-whisper. (auto-editor opcional, não usado por padrão.)

**Contrato de saída (`edit-recipe.json`)** — definido aqui e consumido pelo Plano 2:
```json
{
  "fps": 30,
  "source": { "width": 1920, "height": 1080, "trimmedFrames": 4200 },
  "segments": [
    { "type": "card", "durationInFrames": 90, "title": "...", "subtitle": "..." },
    { "type": "clip", "source": "trimmed.mp4", "inFrame": 0, "outFrame": 4200,
      "reframe": { "focusX": 0.5 } }
  ],
  "captions": [
    { "fromFrame": 92, "durationInFrames": 14, "text": "...",
      "words": [ { "word": "...", "fromFrame": 92, "durationInFrames": 7 } ] }
  ],
  "overlays": [
    { "type": "lowerThird", "fromFrame": 0, "durationInFrames": 90, "text": "..." }
  ],
  "formats": {
    "main16x9": { "width": 1920, "height": 1080 },
    "vertical9x16": { "width": 1080, "height": 1920 }
  }
}
```

---

## File Structure

- `pyproject.toml` — config do pytest + metadados do pacote `pipeline`.
- `pipeline/__init__.py` — pacote.
- `pipeline/probe.py` — `VideoMeta`, `parse_ffprobe`, `probe_video`.
- `pipeline/silence.py` — `Segment`, `parse_silences`, `compute_kept_segments`, `detect_silences`, `cut_segments`.
- `pipeline/transcribe.py` — `words_from_segments`, `transcribe_audio`.
- `pipeline/recipe.py` — `seconds_to_frames`, `group_words_into_lines`, `offset_captions`, `build_recipe`.
- `pipeline/job.py` — `JobConfig`, `init_job`, `load_json`, `write_json`.
- `tests/conftest.py` — fixtures (amostras de saída ffprobe/silencedetect/whisper).
- `tests/test_probe.py`, `tests/test_silence.py`, `tests/test_transcribe.py`, `tests/test_recipe.py`, `tests/test_job.py`.
- `.gitignore`, `requirements.txt`.

---

## Task 1: Ambiente e scaffold

**Files:**
- Create: `.gitignore`, `requirements.txt`, `pyproject.toml`, `pipeline/__init__.py`, `tests/__init__.py`

- [ ] **Step 1: Instalar ferramentas de sistema**

Run:
```bash
brew install ffmpeg
```
Expected: `ffmpeg -version` e `ffprobe -version` passam a funcionar.

- [ ] **Step 2: Criar venv e instalar deps Python**

```bash
cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install pytest faster-whisper
```
Expected: instalação sem erro. `faster-whisper` baixa o modelo na primeira transcrição (Task 4).

- [ ] **Step 3: Criar `.gitignore`**

```gitignore
.venv/
__pycache__/
*.pyc
.pytest_cache/
node_modules/
jobs/*/trimmed.mp4
jobs/*/source.mp4
jobs/*/renders/
output/
remotion/out/
public/
.DS_Store
```

- [ ] **Step 4: Criar `requirements.txt`**

```
pytest
faster-whisper
```

- [ ] **Step 5: Criar `pyproject.toml`**

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-v"
```

- [ ] **Step 6: Criar pacotes vazios**

Create `pipeline/__init__.py` e `tests/__init__.py` (ambos arquivos vazios).

- [ ] **Step 7: Verificar pytest roda**

Run: `.venv/bin/pytest`
Expected: "no tests ran" (sem erro de coleta).

- [ ] **Step 8: Commit**

```bash
git add .gitignore requirements.txt pyproject.toml pipeline/ tests/
git commit -m "chore: scaffold do pipeline Python + ambiente"
```

---

## Task 2: Probe de metadados (`probe.py`)

**Files:**
- Create: `pipeline/probe.py`, `tests/test_probe.py`, `tests/conftest.py`

- [ ] **Step 1: Escrever o teste que falha**

`tests/conftest.py`:
```python
import pytest

@pytest.fixture
def ffprobe_json():
    return """
    {
      "streams": [
        {"codec_type": "audio", "channels": 2},
        {"codec_type": "video", "width": 1920, "height": 1080, "r_frame_rate": "30000/1001"}
      ],
      "format": {"duration": "140.5"}
    }
    """
```

`tests/test_probe.py`:
```python
from pipeline.probe import parse_ffprobe, VideoMeta


def test_parse_ffprobe_extracts_video_stream(ffprobe_json):
    meta = parse_ffprobe(ffprobe_json)
    assert isinstance(meta, VideoMeta)
    assert meta.width == 1920
    assert meta.height == 1080
    assert meta.duration == 140.5
    assert abs(meta.fps - 29.97) < 0.01
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `.venv/bin/pytest tests/test_probe.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'pipeline.probe'`.

- [ ] **Step 3: Implementação mínima**

`pipeline/probe.py`:
```python
import json
import subprocess
from dataclasses import dataclass


@dataclass
class VideoMeta:
    width: int
    height: int
    fps: float
    duration: float


def parse_ffprobe(output: str) -> VideoMeta:
    data = json.loads(output)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    num, den = video["r_frame_rate"].split("/")
    fps = float(num) / float(den)
    return VideoMeta(
        width=int(video["width"]),
        height=int(video["height"]),
        fps=fps,
        duration=float(data["format"]["duration"]),
    )


def probe_video(path: str) -> VideoMeta:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", "-show_streams", path],
        capture_output=True, text=True, check=True,
    )
    return parse_ffprobe(result.stdout)
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `.venv/bin/pytest tests/test_probe.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/probe.py tests/test_probe.py tests/conftest.py
git commit -m "feat: probe.py extrai metadados de vídeo via ffprobe"
```

---

## Task 3: Cálculo de segmentos de fala (`silence.py` — lógica pura)

**Files:**
- Create: `pipeline/silence.py`, `tests/test_silence.py`

- [ ] **Step 1: Teste de parsing do silencedetect**

`tests/test_silence.py`:
```python
from pipeline.silence import parse_silences, compute_kept_segments, Segment


def test_parse_silences_pairs_starts_and_ends():
    stderr = (
        "[silencedetect @ 0x1] silence_start: 2.0\n"
        "[silencedetect @ 0x1] silence_end: 3.5 | silence_duration: 1.5\n"
        "[silencedetect @ 0x1] silence_start: 10.0\n"
        "[silencedetect @ 0x1] silence_end: 11.2 | silence_duration: 1.2\n"
    )
    silences = parse_silences(stderr)
    assert silences == [(2.0, 3.5), (10.0, 11.2)]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/pytest tests/test_silence.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar parse_silences + Segment**

`pipeline/silence.py`:
```python
import re
import subprocess
from dataclasses import dataclass


@dataclass
class Segment:
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


def parse_silences(stderr: str) -> list[tuple[float, float]]:
    starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", stderr)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", stderr)]
    return list(zip(starts, ends))
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/pytest tests/test_silence.py -v`
Expected: PASS.

- [ ] **Step 5: Teste de compute_kept_segments (inversão + padding + merge + drop)**

Adicionar a `tests/test_silence.py`:
```python
def test_compute_kept_segments_inverts_silences():
    silences = [(2.0, 3.5), (10.0, 11.2)]
    kept = compute_kept_segments(silences, duration=15.0, padding=0.0, min_segment=0.0)
    assert kept == [Segment(0.0, 2.0), Segment(3.5, 10.0), Segment(11.2, 15.0)]


def test_compute_kept_segments_drops_short_after_padding_merge():
    # silêncio curto entre duas falas some após padding e merge
    silences = [(2.0, 2.2)]
    kept = compute_kept_segments(silences, duration=10.0, padding=0.3, min_segment=0.3)
    assert len(kept) == 1
    assert kept[0].start == 0.0
    assert kept[0].end == 10.0


def test_compute_kept_segments_drops_tiny_segments():
    silences = [(0.0, 0.0), (0.1, 9.9)]  # sobra só [9.9, 10.0]
    kept = compute_kept_segments(silences, duration=10.0, padding=0.0, min_segment=0.3)
    assert kept == []
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `.venv/bin/pytest tests/test_silence.py -v`
Expected: FAIL com `ImportError` de `compute_kept_segments`.

- [ ] **Step 7: Implementar compute_kept_segments**

Adicionar a `pipeline/silence.py`:
```python
def compute_kept_segments(
    silences: list[tuple[float, float]],
    duration: float,
    padding: float = 0.1,
    min_segment: float = 0.3,
) -> list[Segment]:
    # inverter silêncios -> segmentos de fala
    speech: list[Segment] = []
    cursor = 0.0
    for s_start, s_end in silences:
        if s_start > cursor:
            speech.append(Segment(cursor, s_start))
        cursor = max(cursor, s_end)
    if cursor < duration:
        speech.append(Segment(cursor, duration))

    # aplicar padding com clamp
    padded = [
        Segment(max(0.0, s.start - padding), min(duration, s.end + padding))
        for s in speech
    ]

    # merge de sobreposições
    merged: list[Segment] = []
    for s in padded:
        if merged and s.start <= merged[-1].end:
            merged[-1] = Segment(merged[-1].start, max(merged[-1].end, s.end))
        else:
            merged.append(s)

    # descartar segmentos curtos
    return [s for s in merged if s.duration >= min_segment]
```

- [ ] **Step 8: Rodar e ver passar**

Run: `.venv/bin/pytest tests/test_silence.py -v`
Expected: PASS (todos).

- [ ] **Step 9: Implementar as integrações ffmpeg (detect + cut)**

Adicionar a `pipeline/silence.py`:
```python
def detect_silences(path: str, noise_db: float = -30.0, min_silence: float = 0.5) -> list[tuple[float, float]]:
    result = subprocess.run(
        ["ffmpeg", "-i", path, "-af",
         f"silencedetect=noise={noise_db}dB:d={min_silence}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    # silencedetect escreve no stderr
    return parse_silences(result.stderr)


def cut_segments(src: str, segments: list[Segment], out_path: str) -> None:
    if not segments:
        raise ValueError("nenhum segmento para cortar")
    # filtro select por timestamps -> concatena re-encodando (robusto a cortes não-keyframe)
    between = "+".join(f"between(t,{s.start:.3f},{s.end:.3f})" for s in segments)
    vf = f"select='{between}',setpts=N/FRAME_RATE/TB"
    af = f"aselect='{between}',asetpts=N/SR/STB"
    subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-vf", vf, "-af", af, out_path],
        check=True,
    )
```

- [ ] **Step 10: Teste do construtor de filtro (lógica pura, sem rodar ffmpeg)**

Adicionar a `tests/test_silence.py`:
```python
from pipeline.silence import build_select_expr


def test_build_select_expr_joins_segments():
    expr = build_select_expr([Segment(0.0, 2.0), Segment(3.5, 10.0)])
    assert expr == "between(t,0.000,2.000)+between(t,3.500,10.000)"
```

Refatorar `cut_segments` para usar `build_select_expr`:
```python
def build_select_expr(segments: list[Segment]) -> str:
    return "+".join(f"between(t,{s.start:.3f},{s.end:.3f})" for s in segments)
```
e em `cut_segments` trocar a linha `between = ...` por `between = build_select_expr(segments)`.

- [ ] **Step 11: Rodar e ver passar**

Run: `.venv/bin/pytest tests/test_silence.py -v`
Expected: PASS (todos).

- [ ] **Step 12: Commit**

```bash
git add pipeline/silence.py tests/test_silence.py
git commit -m "feat: detecção de silêncio e cálculo de segmentos de fala"
```

---

## Task 4: Transcrição (`transcribe.py`)

**Files:**
- Create: `pipeline/transcribe.py`, `tests/test_transcribe.py`

- [ ] **Step 1: Teste de conversão (mock dos objetos do whisper)**

`tests/test_transcribe.py`:
```python
from types import SimpleNamespace
from pipeline.transcribe import words_from_segments


def test_words_from_segments_flattens_words():
    seg = SimpleNamespace(
        text=" Olá mundo ",
        start=0.0,
        end=1.0,
        words=[
            SimpleNamespace(word=" Olá", start=0.0, end=0.4),
            SimpleNamespace(word=" mundo", start=0.4, end=1.0),
        ],
    )
    out = words_from_segments([seg])
    assert out[0]["text"] == "Olá mundo"
    assert out[0]["words"] == [
        {"word": "Olá", "start": 0.0, "end": 0.4},
        {"word": "mundo", "start": 0.4, "end": 1.0},
    ]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/pytest tests/test_transcribe.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar**

`pipeline/transcribe.py`:
```python
def words_from_segments(segments) -> list[dict]:
    lines = []
    for seg in segments:
        words = [
            {"word": w.word.strip(), "start": w.start, "end": w.end}
            for w in seg.words
        ]
        lines.append(
            {"text": seg.text.strip(), "start": seg.start, "end": seg.end, "words": words}
        )
    return lines


def transcribe_audio(path: str, model_size: str = "small", language: str = "pt") -> list[dict]:
    from faster_whisper import WhisperModel  # import tardio: dep pesada

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(path, language=language, word_timestamps=True)
    return words_from_segments(segments)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/pytest tests/test_transcribe.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/transcribe.py tests/test_transcribe.py
git commit -m "feat: transcrição via faster-whisper com timestamps por palavra"
```

---

## Task 5: Montagem da recipe (`recipe.py` — o miolo)

**Files:**
- Create: `pipeline/recipe.py`, `tests/test_recipe.py`

- [ ] **Step 1: Teste de conversão segundos→frames**

`tests/test_recipe.py`:
```python
from pipeline.recipe import seconds_to_frames


def test_seconds_to_frames_rounds():
    assert seconds_to_frames(1.0, 30) == 30
    assert seconds_to_frames(0.49, 30) == 15   # 14.7 -> 15
    assert seconds_to_frames(0.0, 30) == 0
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/pytest tests/test_recipe.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar seconds_to_frames**

`pipeline/recipe.py`:
```python
def seconds_to_frames(seconds: float, fps: float) -> int:
    return round(seconds * fps)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/pytest tests/test_recipe.py -v`
Expected: PASS.

- [ ] **Step 5: Teste de agrupamento de palavras em linhas**

Adicionar a `tests/test_recipe.py`:
```python
from pipeline.recipe import group_words_into_lines


def _w(word, start, end):
    return {"word": word, "start": start, "end": end}


def test_group_words_breaks_on_max_chars():
    words = [_w("um", 0.0, 0.2), _w("dois", 0.2, 0.4), _w("tres", 0.4, 0.6),
             _w("quatro", 0.6, 0.8), _w("cinco", 0.8, 1.0)]
    lines = group_words_into_lines(words, max_chars=12, max_gap=5.0)
    # "um dois tres" = 12 chars -> quebra antes de "quatro"
    assert lines[0]["text"] == "um dois tres"
    assert lines[1]["text"] == "quatro cinco"


def test_group_words_breaks_on_gap():
    words = [_w("ola", 0.0, 0.3), _w("mundo", 2.0, 2.4)]
    lines = group_words_into_lines(words, max_chars=99, max_gap=0.6)
    assert len(lines) == 2
    assert lines[0]["start"] == 0.0
    assert lines[1]["start"] == 2.0
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `.venv/bin/pytest tests/test_recipe.py -v`
Expected: FAIL com `ImportError` de `group_words_into_lines`.

- [ ] **Step 7: Implementar group_words_into_lines**

Adicionar a `pipeline/recipe.py`:
```python
def group_words_into_lines(words: list[dict], max_chars: int = 24, max_gap: float = 0.6) -> list[dict]:
    lines: list[list[dict]] = []
    cur: list[dict] = []
    cur_chars = 0
    for w in words:
        wlen = len(w["word"])
        gap_break = cur and (w["start"] - cur[-1]["end"] > max_gap)
        char_break = cur and (cur_chars + wlen + 1 > max_chars)
        if gap_break or char_break:
            lines.append(cur)
            cur, cur_chars = [], 0
        cur.append(w)
        cur_chars += wlen + (1 if cur_chars else 0)
    if cur:
        lines.append(cur)
    return [
        {
            "start": ln[0]["start"],
            "end": ln[-1]["end"],
            "text": " ".join(x["word"] for x in ln),
            "words": ln,
        }
        for ln in lines
    ]
```

- [ ] **Step 8: Rodar e ver passar**

Run: `.venv/bin/pytest tests/test_recipe.py -v`
Expected: PASS (todos).

- [ ] **Step 9: Teste do build_recipe (montagem + offset do card)**

Adicionar a `tests/test_recipe.py`:
```python
from pipeline.recipe import build_recipe


def test_build_recipe_offsets_captions_by_hook_card():
    words = [_w("ola", 0.0, 0.5), _w("pessoal", 0.5, 1.0)]
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=2.0,
        words=words,
        hook={"title": "O segredo", "subtitle": "em 60s"},
        hook_card_frames=90,
        max_chars=99, max_gap=5.0,
    )
    assert recipe["fps"] == 30
    assert recipe["source"]["trimmedFrames"] == 60
    # primeiro segmento: card; segundo: clip
    assert recipe["segments"][0]["type"] == "card"
    assert recipe["segments"][0]["durationInFrames"] == 90
    assert recipe["segments"][0]["title"] == "O segredo"
    assert recipe["segments"][1]["type"] == "clip"
    assert recipe["segments"][1]["inFrame"] == 0
    assert recipe["segments"][1]["outFrame"] == 60
    # legenda deslocada pelo card (0s -> frame 90)
    assert recipe["captions"][0]["fromFrame"] == 90
    assert recipe["captions"][0]["text"] == "ola pessoal"
    # overlay lowerThird durante o card
    assert recipe["overlays"][0]["type"] == "lowerThird"
    assert recipe["formats"]["vertical9x16"]["width"] == 1080
```

- [ ] **Step 10: Rodar e ver falhar**

Run: `.venv/bin/pytest tests/test_recipe.py -v`
Expected: FAIL com `ImportError` de `build_recipe`.

- [ ] **Step 11: Implementar build_recipe**

Adicionar a `pipeline/recipe.py`:
```python
def build_recipe(
    *,
    width: int,
    height: int,
    fps: float,
    trimmed_duration: float,
    words: list[dict],
    hook: dict,
    hook_card_frames: int,
    max_chars: int = 24,
    max_gap: float = 0.6,
) -> dict:
    trimmed_frames = seconds_to_frames(trimmed_duration, fps)
    lines = group_words_into_lines(words, max_chars=max_chars, max_gap=max_gap)

    captions = []
    for ln in lines:
        from_frame = seconds_to_frames(ln["start"], fps) + hook_card_frames
        end_frame = seconds_to_frames(ln["end"], fps) + hook_card_frames
        word_objs = []
        for w in ln["words"]:
            wf = seconds_to_frames(w["start"], fps) + hook_card_frames
            we = seconds_to_frames(w["end"], fps) + hook_card_frames
            word_objs.append(
                {"word": w["word"], "fromFrame": wf, "durationInFrames": max(1, we - wf)}
            )
        captions.append(
            {
                "fromFrame": from_frame,
                "durationInFrames": max(1, end_frame - from_frame),
                "text": ln["text"],
                "words": word_objs,
            }
        )

    return {
        "fps": fps,
        "source": {"width": width, "height": height, "trimmedFrames": trimmed_frames},
        "segments": [
            {
                "type": "card",
                "durationInFrames": hook_card_frames,
                "title": hook["title"],
                "subtitle": hook.get("subtitle", ""),
            },
            {
                "type": "clip",
                "source": "trimmed.mp4",
                "inFrame": 0,
                "outFrame": trimmed_frames,
                "reframe": {"focusX": 0.5},
            },
        ],
        "captions": captions,
        "overlays": [
            {
                "type": "lowerThird",
                "fromFrame": 0,
                "durationInFrames": hook_card_frames,
                "text": hook["title"],
            }
        ],
        "formats": {
            "main16x9": {"width": 1920, "height": 1080},
            "vertical9x16": {"width": 1080, "height": 1920},
        },
    }
```

- [ ] **Step 12: Rodar e ver passar**

Run: `.venv/bin/pytest tests/test_recipe.py -v`
Expected: PASS (todos).

- [ ] **Step 13: Commit**

```bash
git add pipeline/recipe.py tests/test_recipe.py
git commit -m "feat: montagem do edit-recipe (legendas, frames, timeline card+clip)"
```

---

## Task 6: Job e I/O (`job.py`)

**Files:**
- Create: `pipeline/job.py`, `tests/test_job.py`

- [ ] **Step 1: Teste de init_job + write/load JSON**

`tests/test_job.py`:
```python
from pipeline.job import init_job, write_json, load_json, JobConfig


def test_init_job_creates_dir_and_default_config(tmp_path):
    job = init_job(tmp_path / "jobs", "meu-video")
    assert (job.dir).exists()
    assert job.config.silence_threshold_db == -30.0
    assert job.config.min_silence == 0.5


def test_write_and_load_json_roundtrip(tmp_path):
    p = tmp_path / "x.json"
    write_json(p, {"a": 1})
    assert load_json(p) == {"a": 1}
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/pytest tests/test_job.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar job.py**

`pipeline/job.py`:
```python
import json
from dataclasses import dataclass, field, asdict
from pathlib import Path


@dataclass
class JobConfig:
    silence_threshold_db: float = -30.0
    min_silence: float = 0.5
    padding: float = 0.1
    min_segment: float = 0.3
    whisper_model: str = "small"
    language: str = "pt"
    hook_card_frames: int = 90
    max_caption_chars: int = 24
    max_caption_gap: float = 0.6


@dataclass
class Job:
    dir: Path
    config: JobConfig = field(default_factory=JobConfig)


def write_json(path, data) -> None:
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def init_job(jobs_root, slug: str) -> Job:
    job_dir = Path(jobs_root) / slug
    job_dir.mkdir(parents=True, exist_ok=True)
    config = JobConfig()
    cfg_path = job_dir / "job.config.json"
    if cfg_path.exists():
        data = load_json(cfg_path)
        config = JobConfig(**data)
    else:
        write_json(cfg_path, asdict(config))
    return Job(dir=job_dir, config=config)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/pytest tests/test_job.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/job.py tests/test_job.py
git commit -m "feat: gestão de job (config, init, I/O de JSON)"
```

---

## Task 7: CLIs de estágio (orquestração por estágio + checkpoints)

**Files:**
- Create: `pipeline/stages.py`, `tests/test_stages.py`

Cada estágio é uma função que lê/escreve artefatos no job. São finos (chamam os módulos já testados); o que testamos aqui é o *fluxo* (que artefato é escrito).

- [ ] **Step 1: Teste do stage_recipe (usa artefatos já prontos no job, sem ffmpeg/whisper)**

`tests/test_stages.py`:
```python
import json
from pipeline.job import init_job, write_json, load_json
from pipeline.stages import stage_recipe


def test_stage_recipe_writes_edit_recipe(tmp_path):
    job = init_job(tmp_path / "jobs", "v1")
    write_json(job.dir / "probe.json", {"width": 1920, "height": 1080, "fps": 30, "duration": 2.0})
    write_json(job.dir / "transcript.json",
               [{"text": "ola", "start": 0.0, "end": 0.5,
                 "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}])
    hook = {"title": "Hook", "subtitle": "x"}
    write_json(job.dir / "hook.json", hook)

    stage_recipe(job)

    recipe = load_json(job.dir / "edit-recipe.json")
    assert recipe["segments"][0]["title"] == "Hook"
    assert recipe["captions"][0]["fromFrame"] == job.config.hook_card_frames
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/bin/pytest tests/test_stages.py -v`
Expected: FAIL com `ModuleNotFoundError`.

- [ ] **Step 3: Implementar stages.py**

`pipeline/stages.py`:
```python
import shutil
from pathlib import Path

from pipeline.job import Job, write_json, load_json
from pipeline.probe import probe_video
from pipeline.silence import detect_silences, compute_kept_segments, cut_segments
from pipeline.transcribe import transcribe_audio
from pipeline.recipe import build_recipe


def stage_ingest(job: Job, src_path: str) -> None:
    dest = job.dir / "source.mp4"
    shutil.copy(src_path, dest)
    meta = probe_video(str(dest))
    write_json(job.dir / "probe.json",
               {"width": meta.width, "height": meta.height, "fps": meta.fps, "duration": meta.duration})


def stage_cut(job: Job) -> None:
    src = job.dir / "source.mp4"
    meta = load_json(job.dir / "probe.json")
    silences = detect_silences(str(src), job.config.silence_threshold_db, job.config.min_silence)
    kept = compute_kept_segments(silences, meta["duration"], job.config.padding, job.config.min_segment)
    write_json(job.dir / "cuts.json", [{"start": s.start, "end": s.end} for s in kept])
    cut_segments(str(src), kept, str(job.dir / "trimmed.mp4"))


def stage_transcribe(job: Job) -> None:
    trimmed = job.dir / "trimmed.mp4"
    words = transcribe_audio(str(trimmed), job.config.whisper_model, job.config.language)
    write_json(job.dir / "transcript.json", words)


def stage_recipe(job: Job) -> None:
    meta = load_json(job.dir / "probe.json")
    transcript = load_json(job.dir / "transcript.json")
    hook = load_json(job.dir / "hook.json")
    # transcript pode estar segmentado em linhas; achatar palavras
    words = []
    for line in transcript:
        words.extend(line["words"])
    # duração do trimmed = último timestamp (aprox.) ou probe do trimmed se existir
    trimmed_probe = job.dir / "trimmed.probe.json"
    if trimmed_probe.exists():
        trimmed_duration = load_json(trimmed_probe)["duration"]
    else:
        trimmed_duration = words[-1]["end"] if words else 0.0
    recipe = build_recipe(
        width=meta["width"], height=meta["height"], fps=meta["fps"],
        trimmed_duration=trimmed_duration, words=words,
        hook=hook, hook_card_frames=job.config.hook_card_frames,
        max_chars=job.config.max_caption_chars, max_gap=job.config.max_caption_gap,
    )
    write_json(job.dir / "edit-recipe.json", recipe)
```

- [ ] **Step 4: Rodar e ver passar**

Run: `.venv/bin/pytest tests/test_stages.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/stages.py tests/test_stages.py
git commit -m "feat: estágios do pipeline (ingest, cut, transcribe, recipe)"
```

---

## Task 8: CLI orquestradora (`pipeline/cli.py`)

**Files:**
- Create: `pipeline/cli.py`

- [ ] **Step 1: Implementar a CLI por estágio**

`pipeline/cli.py`:
```python
import argparse
from pathlib import Path

from pipeline.job import init_job
from pipeline.stages import stage_ingest, stage_cut, stage_transcribe, stage_recipe


def main() -> None:
    parser = argparse.ArgumentParser(description="Pipeline de análise de vídeo")
    parser.add_argument("stage", choices=["ingest", "cut", "transcribe", "recipe"])
    parser.add_argument("--slug", required=True)
    parser.add_argument("--jobs-root", default="jobs")
    parser.add_argument("--src", help="caminho do vídeo (estágio ingest)")
    args = parser.parse_args()

    job = init_job(args.jobs_root, args.slug)
    if args.stage == "ingest":
        if not args.src:
            parser.error("--src é obrigatório no estágio ingest")
        stage_ingest(job, args.src)
        print(f"[ingest] ok -> {job.dir/'probe.json'}")
    elif args.stage == "cut":
        stage_cut(job)
        print(f"[cut] ok -> {job.dir/'cuts.json'} + trimmed.mp4")
    elif args.stage == "transcribe":
        stage_transcribe(job)
        print(f"[transcribe] ok -> {job.dir/'transcript.json'}")
    elif args.stage == "recipe":
        stage_recipe(job)
        print(f"[recipe] ok -> {job.dir/'edit-recipe.json'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verificação manual da CLI (help)**

Run: `.venv/bin/python -m pipeline.cli --help`
Expected: imprime o uso com os 4 estágios.

- [ ] **Step 3: Commit**

```bash
git add pipeline/cli.py
git commit -m "feat: CLI por estágio (ingest|cut|transcribe|recipe)"
```

---

## Task 9: Validação end-to-end com fixture curta

**Files:**
- Create: `tests/fixtures/make_sample.sh`

- [ ] **Step 1: Script que gera uma amostra de 12s (fala sintética + silêncio)**

`tests/fixtures/make_sample.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
OUT="${1:-jobs/sample/source.mp4}"
mkdir -p "$(dirname "$OUT")"
# 12s: tom 0-3s, silêncio 3-6s, tom 6-9s, silêncio 9-12s, sobre fundo de cor
ffmpeg -y \
  -f lavfi -i "color=c=gray:s=1280x720:d=12" \
  -f lavfi -i "sine=frequency=300:d=12" \
  -af "volume='if(lt(t,3)+gt(t,6)*lt(t,9),1,0)':eval=frame" \
  -shortest -pix_fmt yuv420p "$OUT"
echo "sample em $OUT"
```

- [ ] **Step 2: Gerar a amostra**

Run:
```bash
chmod +x tests/fixtures/make_sample.sh && ./tests/fixtures/make_sample.sh
```
Expected: cria `jobs/sample/source.mp4`.

- [ ] **Step 3: Rodar ingest + cut e conferir corte**

Run:
```bash
.venv/bin/python -m pipeline.cli ingest --slug sample --src jobs/sample/source.mp4
.venv/bin/python -m pipeline.cli cut --slug sample
ffprobe -v quiet -show_format jobs/sample/trimmed.mp4 | grep duration
```
Expected: `cuts.json` com ~2 segmentos (0–3 e 6–9, com padding); `trimmed.mp4` com duração ~6–7s (menor que 12s).

- [ ] **Step 4: Rodar transcribe (baixa o modelo na 1ª vez)**

Run: `.venv/bin/python -m pipeline.cli transcribe --slug sample`
Expected: cria `transcript.json` (provavelmente vazio/curto, pois é tom puro — ok; serve para validar o caminho).

- [ ] **Step 5: Criar hook.json manualmente e rodar recipe**

```bash
printf '{"title":"Teste de hook","subtitle":"amostra"}' > jobs/sample/hook.json
.venv/bin/python -m pipeline.cli recipe --slug sample
ls -la jobs/sample/edit-recipe.json
```
Expected: `edit-recipe.json` criado com `segments[0].type == "card"`.

- [ ] **Step 6: Rodar a suíte completa**

Run: `.venv/bin/pytest`
Expected: todos os testes PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/fixtures/make_sample.sh
git commit -m "test: fixture de amostra + validação end-to-end do pipeline Python"
```

---

## Self-Review (resultado)

- **Cobertura do spec:** Estágios 0–3 do spec (ingest, cut, transcribe, hook/recipe) cobertos pelas Tasks 2–8. O `edit-recipe.json` polimórfico (card+clip; scene reservado) é produzido pela Task 5/7. Checkpoints são naturais: cada estágio é um comando separado da CLI (Task 8), permitindo revisão entre eles. Estágio 4 (render Remotion) é o **Plano 2**.
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** `Segment`, `VideoMeta`, `JobConfig`, chaves do `edit-recipe.json` (`segments/captions/overlays/formats`, `fromFrame/durationInFrames`) são usadas de forma consistente entre `recipe.py`, `stages.py` e o contrato no header — e casam com o que o Plano 2 vai consumir.
- **Lacuna conhecida (registrada):** a duração do `trimmed.mp4` no `stage_recipe` usa o último timestamp do transcript como aproximação quando não há `trimmed.probe.json`. Melhoria opcional: rodar `probe_video` no `trimmed.mp4` dentro do `stage_cut` e salvar `trimmed.probe.json` (1 linha). Fica como nota; não bloqueia o fluxo.
