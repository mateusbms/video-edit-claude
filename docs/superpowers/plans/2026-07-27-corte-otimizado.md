# Corte otimizado (hardware + 1080p) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Deixar o passo de cortes ~8× mais rápido: decode/encode em hardware (VideoToolbox no
macOS) e downscale do `trimmed.mp4` pra 1080p (lado maior ≤1920), sem perda no vídeo final.

**Architecture:** Tudo em `pipeline/silence.py` (`cut_segments` + helpers) e `pipeline/stages.py`
(passar a escala calculada do probe). `python3`, pytest.

**Constraints:** Não quebrar `test_stage_cut_reports_progress` nem `test_cut_after_ingest`
(sample 320×240 → sem escala; VT emite `-progress`). Fallback libx264 fora do macOS.

---

### Task 1: `build_scale_filter` (puro)

**Files:** Modify `pipeline/silence.py`; Test `tests/test_silence.py`

- [ ] **Step 1: testes que falham** — em `tests/test_silence.py` (importar `build_scale_filter`
  junto dos outros imports de `pipeline.silence`):

```python
def test_build_scale_filter_downscales_4k_vertical():
    assert build_scale_filter(2160, 3840) == "scale=1080:1920"

def test_build_scale_filter_downscales_4k_landscape():
    assert build_scale_filter(3840, 2160) == "scale=1920:1080"

def test_build_scale_filter_none_when_within_limit():
    assert build_scale_filter(1920, 1080) is None
    assert build_scale_filter(1080, 1920) is None

def test_build_scale_filter_never_upscales():
    assert build_scale_filter(1280, 720) is None

def test_build_scale_filter_dims_are_even():
    s = build_scale_filter(1234, 4000)
    w, h = (int(x) for x in s.removeprefix("scale=").split(":"))
    assert w % 2 == 0 and h % 2 == 0 and h == 1920
```

- [ ] **Step 2:** `python3 -m pytest tests/test_silence.py -k scale_filter -q` → FAIL.

- [ ] **Step 3: implementar** em `pipeline/silence.py` (após `build_select_expr`):

```python
def build_scale_filter(width: int, height: int, max_long_edge: int = 1920) -> str | None:
    """Filtro ffmpeg 'scale=W:H' pra caber o lado maior em max_long_edge (só reduz).

    Preserva aspecto/orientação e garante dimensões pares (exigência do H.264).
    Retorna None quando não precisa reduzir (não amplia vídeos menores).
    """
    long_edge = max(width, height)
    if long_edge <= max_long_edge:
        return None
    factor = max_long_edge / long_edge
    w = int(round(width * factor))
    h = int(round(height * factor))
    w -= w % 2
    h -= h % 2
    return f"scale={w}:{h}"
```

- [ ] **Step 4:** `python3 -m pytest tests/test_silence.py -k scale_filter -q` → PASS.

- [ ] **Step 5: commit**
```bash
git add pipeline/silence.py tests/test_silence.py
git commit -m "feat(cut): build_scale_filter — downscale pro lado maior <=1920 (sem upscale)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `cut_segments` em hardware + escala + wiring

**Files:** Modify `pipeline/silence.py`, `pipeline/stages.py`; Test `tests/test_silence.py`

- [ ] **Step 1: testes que falham** — em `tests/test_silence.py`:

```python
def test_cut_segments_uses_videotoolbox_and_scale(monkeypatch):
    import pipeline.silence as sil
    monkeypatch.setattr(sil, "_vt_available", lambda: True)
    captured = {}

    class FakeProc:
        returncode = 0
        stdout = iter(["out_time_us=1000000\n"])
        def wait(self): return 0

    def fake_popen(cmd, **kw):
        captured["cmd"] = cmd
        return FakeProc()

    monkeypatch.setattr(sil.subprocess, "Popen", fake_popen)
    sil.cut_segments("in.mp4", [Segment(0.0, 2.0)], "out.mp4", scale="scale=1080:1920")
    cmd = captured["cmd"]
    assert "-hwaccel" in cmd and "videotoolbox" in cmd
    assert "h264_videotoolbox" in cmd
    vf = cmd[cmd.index("-vf") + 1]
    assert "scale=1080:1920" in vf

def test_cut_segments_falls_back_to_libx264(monkeypatch):
    import pipeline.silence as sil
    monkeypatch.setattr(sil, "_vt_available", lambda: False)
    captured = {}

    class FakeProc:
        returncode = 0
        stdout = iter([])
        def wait(self): return 0

    monkeypatch.setattr(sil.subprocess, "Popen", lambda cmd, **kw: (captured.__setitem__("cmd", cmd) or FakeProc()))
    sil.cut_segments("in.mp4", [Segment(0.0, 2.0)], "out.mp4")
    cmd = captured["cmd"]
    assert "libx264" in cmd
    assert "-hwaccel" not in cmd
```

- [ ] **Step 2:** `python3 -m pytest tests/test_silence.py -k cut_segments -q` → FAIL.

- [ ] **Step 3: implementar** em `pipeline/silence.py`. Adicionar imports no topo:
```python
import functools
import sys
```
Adicionar helpers (antes de `cut_segments`):
```python
@functools.lru_cache(maxsize=1)
def _vt_available() -> bool:
    """True em macOS com o encoder h264_videotoolbox disponível no ffmpeg."""
    if sys.platform != "darwin":
        return False
    try:
        out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"],
                             capture_output=True, text=True)
        return "h264_videotoolbox" in out.stdout
    except Exception:
        return False


def _decode_args() -> list[str]:
    return ["-hwaccel", "videotoolbox"] if _vt_available() else []


def _video_encoder_args(bitrate: str = "10M") -> list[str]:
    if _vt_available():
        return ["-c:v", "h264_videotoolbox", "-b:v", bitrate]
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]
```
Substituir `cut_segments` por:
```python
def cut_segments(src, segments, out_path, total_duration=None, progress_cb=None, scale=None) -> None:
    if not segments:
        raise ValueError("nenhum segmento para cortar")
    between = build_select_expr(segments)
    vf = f"select='{between}',setpts=N/FRAME_RATE/TB"
    if scale:
        vf += f",{scale}"
    af = f"aselect='{between}',asetpts=N/SR/TB"
    cmd = ["ffmpeg", "-y", *_decode_args(), "-i", src,
           "-vf", vf, "-af", af, *_video_encoder_args(), "-c:a", "aac",
           "-progress", "pipe:1", "-nostats", out_path]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    for line in proc.stdout:
        t = parse_ffmpeg_progress(line)
        if t is not None and progress_cb and total_duration:
            progress_cb(min(t, total_duration), total_duration)
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg cut falhou (rc={proc.returncode})")
```

- [ ] **Step 4: wiring** em `pipeline/stages.py`. No import de `pipeline.silence`, acrescentar
  `build_scale_filter`. Em `stage_cut`, calcular a escala do probe e passar:
```python
    scale = build_scale_filter(meta["width"], meta["height"])
    cut_segments(str(src), kept, str(job.dir / "trimmed.mp4"),
                 total_duration=total, progress_cb=progress_cb, scale=scale)
```
  Em `stage_refine`, idem a partir do `tp` (trimmed.probe.json):
```python
    scale = build_scale_filter(tp["width"], tp["height"])
    cut_segments(str(trimmed), keep, str(tmp),
                 total_duration=total, progress_cb=progress_cb, scale=scale)
```

- [ ] **Step 5:** rodar os testes de silence + os de stage/rotas que tocam corte:
`python3 -m pytest tests/test_silence.py tests/test_stages.py api/tests/test_routes.py -q`
Expected: PASS (inclui `test_stage_cut_reports_progress` e `test_cut_after_ingest` reais).

- [ ] **Step 6: commit**
```bash
git add pipeline/silence.py pipeline/stages.py tests/test_silence.py
git commit -m "perf(cut): decode/encode em hardware (VideoToolbox) + downscale 1080p (~8x)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3 (controller): benchmark real + deploy

- [ ] Reprocessar o corte do A1 Exame (via API `/cut` ou re-ingest) e cronometrar wall-clock
  real vs. os ~7,5 min anteriores; conferir `trimmed.mp4` virou 1080p (ffprobe) e o vídeo abre.
- [ ] Build web→api/static + restart uvicorn (sem mudança de front, mas mantém o servidor no ar).
- [ ] Memória: registrar a otimização do corte.

## Self-Review

- Cobre a spec: helper de escala (T1), hardware + escala + fallback + wiring nos dois estágios
  (T2), validação real (T3). Tipos/args batem entre spec, plano e testes. Sem placeholders.
  Fora de escopo (render 4K, stream-copy, UI de config) respeitado.
