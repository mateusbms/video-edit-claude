# Speed-ups + Video Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Acelerar detecção de silêncio e transcrição, e adicionar previews de vídeo no passo de corte de silêncio e no de legendas.

**Architecture:** Velocidade = mudanças pontuais em `silence.py`/`transcribe.py` (sem UI). Previews = reaproveitar o endpoint existente `GET /jobs/{slug}/files/trimmed.mp4` (já com Range + path-safety) e adicionar `<video>` + overlay de legenda no frontend. Pipeline inalterado.

**Tech Stack:** Python/FastAPI/faster-whisper/ffmpeg (backend); React 19/Vite/Vitest/Testing Library (frontend).

---

## File Structure

- **Modify** `pipeline/silence.py` — `-vn` no `detect_silences`.
- **Modify** `pipeline/transcribe.py` — cache de modelo, `vad_filter`, `beam_size`, default `base`.
- **Modify** `api/models.py` — `TranscribeParams.model_size` default `base`.
- **Modify** `pipeline/job.py` — `JobConfig.whisper_model` default `base`.
- **Modify** `web/src/api.ts` — helper `mediaUrl`.
- **Modify** `web/src/util.ts` — `activeLineIndex`.
- **Create** `web/src/components/CaptionOverlay.tsx` — overlay de legenda por tempo.
- **Modify** `web/src/steps/CutsStep.tsx` — `<video>` do trimmed + timeline clicável.
- **Modify** `web/src/steps/TranscriptStep.tsx` — `<video>` + `CaptionOverlay`.
- **Tests:** `tests/test_silence.py`, `tests/test_transcribe.py`, `tests/test_files_range.py`, `web/src/__tests__/util.test.ts` (add), `web/src/__tests__/CaptionOverlay.test.tsx`, `web/src/__tests__/CutsStep.test.tsx`, `web/src/__tests__/TranscriptStep.test.tsx`.

---

## Task 1: silêncio mais rápido (`-vn`)

**Files:**
- Modify: `pipeline/silence.py` (`detect_silences`)
- Test: `tests/test_silence.py`

- [ ] **Step 1: Write the failing test** — adicione a `tests/test_silence.py`:

```python
import os
import shutil
import subprocess
from pathlib import Path
import pytest
from pipeline.silence import detect_silences

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg indisponível")


@_needs_ffmpeg
def test_detect_silences_finds_gap(tmp_path):
    clip = tmp_path / "c.mp4"
    # 3s: som 0-1s, silêncio 1-2s, som 2-3s
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", "color=c=black:s=320x240:d=3",
         "-f", "lavfi", "-i", "sine=frequency=440:d=3",
         "-af", "volume='if(lt(t,1)+gt(t,2),1,0)':eval=frame",
         "-shortest", "-pix_fmt", "yuv420p", str(clip)],
        capture_output=True, check=True,
    )
    silences = detect_silences(str(clip), noise_db=-30.0, min_silence=0.3)
    assert len(silences) >= 1
    s_start, s_end = silences[0]
    assert 0.8 < s_start < 1.6
```

- [ ] **Step 2: Run to verify it fails or passes on current code**

Run: `.venv/bin/pytest tests/test_silence.py -v`
Expected: PASS on current code (test is a guard). Proceed to add `-vn`; the test must still pass afterward, proving `-vn` didn't break detection.

- [ ] **Step 3: Implementation** — em `pipeline/silence.py`, no `detect_silences`, adicione `-vn` após `-i path`:

```python
def detect_silences(path: str, noise_db: float = -30.0, min_silence: float = 0.5) -> list[tuple[float, float]]:
    result = subprocess.run(
        ["ffmpeg", "-i", path, "-vn", "-af",
         f"silencedetect=noise={noise_db}dB:d={min_silence}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    # silencedetect escreve no stderr
    return parse_silences(result.stderr)
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_silence.py -v`
Expected: PASS (detecção continua correta, agora sem decodificar vídeo).

- [ ] **Step 5: Commit**

```bash
git add pipeline/silence.py tests/test_silence.py
git commit -m "perf(silence): skip video decoding with -vn in silencedetect"
```

---

## Task 2: transcrição mais rápida (cache + vad + beam + default base)

**Files:**
- Modify: `pipeline/transcribe.py`
- Modify: `api/models.py` (`TranscribeParams.model_size`)
- Modify: `pipeline/job.py` (`JobConfig.whisper_model`)
- Test: `tests/test_transcribe.py`

- [ ] **Step 1: Write the failing test** — adicione a `tests/test_transcribe.py`:

```python
import sys
import types


def test_model_is_cached_and_uses_fast_params(monkeypatch):
    from pipeline import transcribe as T
    T._MODEL_CACHE.clear()
    ctor_calls = []
    transcribe_kwargs = []

    class FakeModel:
        def __init__(self, *a, **k):
            ctor_calls.append((a, k))

        def transcribe(self, path, **kwargs):
            transcribe_kwargs.append(kwargs)
            return ([], None)

    fake_mod = types.SimpleNamespace(WhisperModel=FakeModel)
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_mod)

    T.transcribe_audio("a.wav", model_size="base")
    T.transcribe_audio("b.wav", model_size="base")

    assert len(ctor_calls) == 1                      # modelo construído uma vez
    assert transcribe_kwargs[0]["vad_filter"] is True
    assert transcribe_kwargs[0]["beam_size"] == 1


def test_transcribe_default_model_is_base(monkeypatch):
    from pipeline import transcribe as T
    T._MODEL_CACHE.clear()
    sizes = []

    class FakeModel:
        def __init__(self, size, **k):
            sizes.append(size)

        def transcribe(self, path, **kwargs):
            return ([], None)

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=FakeModel))
    T.transcribe_audio("a.wav")
    assert sizes == ["base"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_transcribe.py -v`
Expected: FAIL — `_MODEL_CACHE` não existe / default é "small".

- [ ] **Step 3: Implementation** — substitua `transcribe_audio` em `pipeline/transcribe.py` (mantenha `words_from_segments` como está) e adicione o cache:

```python
_MODEL_CACHE: dict[str, object] = {}


def _get_model(model_size: str):
    if model_size not in _MODEL_CACHE:
        from faster_whisper import WhisperModel  # import tardio: dep pesada
        _MODEL_CACHE[model_size] = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _MODEL_CACHE[model_size]


def transcribe_audio(path: str, model_size: str = "base", language: str = "pt") -> list[dict]:
    model = _get_model(model_size)
    segments, _info = model.transcribe(
        path, language=language, word_timestamps=True,
        vad_filter=True, beam_size=1,
    )
    return words_from_segments(segments)
```

Em `api/models.py`, mude o default:

```python
class TranscribeParams(BaseModel):
    model_size: str = "base"  # tiny|base|small|medium
```

Em `pipeline/job.py`, na dataclass `JobConfig`:

```python
    whisper_model: str = "base"
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_transcribe.py -v`
Expected: PASS (3 testes: o existente + os 2 novos).

- [ ] **Step 5: Commit**

```bash
git add pipeline/transcribe.py api/models.py pipeline/job.py tests/test_transcribe.py
git commit -m "perf(transcribe): cache model, vad+greedy decode, default to base"
```

---

## Task 3: helper `mediaUrl` + `activeLineIndex`

**Files:**
- Modify: `web/src/api.ts`
- Modify: `web/src/util.ts`
- Test: `web/src/__tests__/util.test.ts`

- [ ] **Step 1: Write the failing test** — adicione a `web/src/__tests__/util.test.ts` (crie se não existir; se existir, acrescente ao describe):

```typescript
import { describe, it, expect } from "vitest";
import { activeLineIndex } from "../util";

const lines = [
  { text: "um", start: 0.0, end: 1.0, words: [] },
  { text: "dois", start: 1.0, end: 2.0, words: [] },
];

describe("activeLineIndex", () => {
  it("acha a linha pelo tempo", () => {
    expect(activeLineIndex(lines as any, 0.5)).toBe(0);
    expect(activeLineIndex(lines as any, 1.5)).toBe(1);
  });
  it("retorna -1 fora de qualquer linha", () => {
    expect(activeLineIndex(lines as any, 5.0)).toBe(-1);
  });
  it("usa limite inferior inclusivo", () => {
    expect(activeLineIndex(lines as any, 1.0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/__tests__/util.test.ts`
Expected: FAIL — `activeLineIndex` não existe.

- [ ] **Step 3: Implementation**

Em `web/src/util.ts`, adicione (import do tipo no topo se necessário):

```typescript
import type { CaptionLine } from "./types";

export function activeLineIndex(lines: CaptionLine[], t: number): number {
  return lines.findIndex((l) => t >= l.start && t < l.end);
}
```

Em `web/src/api.ts`, adicione:

```typescript
export function mediaUrl(slug: string, name: string): string {
  return `${BASE}/jobs/${slug}/files/${name}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/__tests__/util.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/util.ts web/src/api.ts web/src/__tests__/util.test.ts
git commit -m "feat(web): mediaUrl helper and activeLineIndex util"
```

---

## Task 4: componente `CaptionOverlay`

**Files:**
- Create: `web/src/components/CaptionOverlay.tsx`
- Test: `web/src/__tests__/CaptionOverlay.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CaptionOverlay } from "../components/CaptionOverlay";

const lines = [
  { text: "olá mundo", start: 0.0, end: 1.0,
    words: [{ word: "olá", start: 0.0, end: 0.5 }, { word: "mundo", start: 0.5, end: 1.0 }] },
  { text: "tchau", start: 1.0, end: 2.0,
    words: [{ word: "tchau", start: 1.0, end: 2.0 }] },
];

describe("CaptionOverlay", () => {
  it("mostra a linha ativa no tempo dado", () => {
    render(<CaptionOverlay lines={lines as any} currentTime={0.2} />);
    expect(screen.getByText("olá")).toBeInTheDocument();
    expect(screen.getByText("mundo")).toBeInTheDocument();
    expect(screen.queryByText("tchau")).not.toBeInTheDocument();
  });

  it("destaca a palavra atual", () => {
    render(<CaptionOverlay lines={lines as any} currentTime={0.7} />);
    const active = screen.getByText("mundo");
    expect(active.getAttribute("data-active")).toBe("true");
  });

  it("não renderiza nada fora de qualquer linha", () => {
    const { container } = render(<CaptionOverlay lines={lines as any} currentTime={9} />);
    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/__tests__/CaptionOverlay.test.tsx`
Expected: FAIL — componente não existe.

- [ ] **Step 3: Implementation** — crie `web/src/components/CaptionOverlay.tsx`:

```tsx
import type { CaptionLine } from "../types";
import { activeLineIndex } from "../util";

export const CaptionOverlay: React.FC<{ lines: CaptionLine[]; currentTime: number }> = ({
  lines, currentTime,
}) => {
  const li = activeLineIndex(lines, currentTime);
  if (li < 0) return null;
  const line = lines[li];
  return (
    <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
      <p className="bg-black/70 text-white px-3 py-1 rounded text-lg font-semibold max-w-[90%] text-center">
        {line.words.map((w, wi) => {
          const active = currentTime >= w.start && currentTime < w.end;
          return (
            <span key={wi} data-active={active}
              className={active ? "text-emerald-400" : undefined}>
              {w.word}{wi < line.words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </p>
    </div>
  );
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/__tests__/CaptionOverlay.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/CaptionOverlay.tsx web/src/__tests__/CaptionOverlay.test.tsx
git commit -m "feat(web): CaptionOverlay renders active caption line by time"
```

---

## Task 5: preview no passo de silêncio (`CutsStep`)

**Files:**
- Modify: `web/src/steps/CutsStep.tsx`
- Test: `web/src/__tests__/CutsStep.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  runCut: vi.fn(async () => ({
    original_duration: 10, trimmed_duration: 6,
    segments: [{ start: 0, end: 3 }, { start: 5, end: 8 }],
  })),
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
}));

import { CutsStep } from "../steps/CutsStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };

beforeEach(() => vi.clearAllMocks());

describe("CutsStep preview", () => {
  it("mostra um <video> do trimmed após detectar pausas", async () => {
    const { container } = render(<CutsStep {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
    await waitFor(() => {
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      expect(v!.getAttribute("src")).toContain("/files/trimmed.mp4");
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/__tests__/CutsStep.test.tsx`
Expected: FAIL — não há `<video>`.

- [ ] **Step 3: Implementation** — em `web/src/steps/CutsStep.tsx`:

Adicione os imports no topo:
```tsx
import { useRef, useState } from "react";
import { runCut, mediaUrl } from "../api";
```
(troque a linha `import { useState } from "react";` e a `import { runCut } from "../api";`)

Adicione um ref logo após os `useState`:
```tsx
  const videoRef = useRef<HTMLVideoElement>(null);

  const seek = (t: number) => {
    const v = videoRef.current;
    if (v) { v.currentTime = t; v.play().catch(() => {}); }
  };
```

Dentro do bloco `{result && (...)}`, torne cada trecho verde clicável — no `parts.push` do segmento mantido, adicione `onClick` e cursor:
```tsx
                parts.push(
                  <div
                    key={`s${i}`}
                    onClick={() => seek(s.start)}
                    title={`Ir para ${formatSeconds(s.start)}`}
                    style={{ width: `${((s.end - s.start) / total) * 100}%`, cursor: "pointer" }}
                    className="bg-emerald-500"
                  />
                );
```
(substitui apenas o `parts.push(<div key={\`s${i}\`} ... className="bg-emerald-500" />)` existente.)

E logo abaixo da barra (`</div>` que fecha a barra de timeline, ainda dentro do `{result && ...}`), adicione o vídeo:
```tsx
          <video
            ref={videoRef}
            src={mediaUrl(slug, "trimmed.mp4")}
            controls
            className="w-full rounded border border-zinc-800 mt-2"
          />
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/__tests__/CutsStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/steps/CutsStep.tsx web/src/__tests__/CutsStep.test.tsx
git commit -m "feat(web): preview trimmed video and seek from timeline in CutsStep"
```

---

## Task 6: preview no passo de legendas (`TranscriptStep`)

**Files:**
- Modify: `web/src/steps/TranscriptStep.tsx`
- Test: `web/src/__tests__/TranscriptStep.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  getTranscript: vi.fn(async () => ([
    { text: "olá", start: 0, end: 1, words: [{ word: "olá", start: 0, end: 1 }] },
  ])),
  putTranscript: vi.fn(async () => {}),
  streamSSE: vi.fn(async () => {}),
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
}));

import { TranscriptStep } from "../steps/TranscriptStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("TranscriptStep preview", () => {
  it("mostra um <video> do trimmed quando há transcript", async () => {
    const { container } = render(<TranscriptStep {...props} />);
    await waitFor(() => {
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      expect(v!.getAttribute("src")).toContain("/files/trimmed.mp4");
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/__tests__/TranscriptStep.test.tsx`
Expected: FAIL — não há `<video>`.

- [ ] **Step 3: Implementation** — em `web/src/steps/TranscriptStep.tsx`:

Ajuste os imports:
```tsx
import { useEffect, useRef, useState } from "react";
import { getTranscript, putTranscript, streamSSE, mediaUrl } from "../api";
import { CaptionOverlay } from "../components/CaptionOverlay";
```

Adicione estado de tempo e ref logo após os `useState`:
```tsx
  const videoRef = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
```

Ajuste o default do seletor de modelo para `base` (coerente com o backend): troque
`const [model, setModel] = useState("small");` por `const [model, setModel] = useState("base");`
e no `<select>` mova o rótulo "(padrão)" de `small` para `base`:
```tsx
            <option value="tiny">tiny (rápido)</option>
            <option value="base">base (padrão)</option>
            <option value="small">small</option>
            <option value="medium">medium (melhor)</option>
```

Dentro do bloco `{lines && (...)}`, ACIMA da lista de edição, adicione o vídeo com overlay:
```tsx
      {lines && (
        <div className="relative">
          <video
            ref={videoRef}
            src={mediaUrl(slug, "trimmed.mp4")}
            controls
            onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)}
            className="w-full rounded border border-zinc-800"
          />
          <CaptionOverlay lines={lines} currentTime={now} />
        </div>
      )}
```
(Isto é um bloco novo, ADICIONAL ao `{lines && (<div ...edição...>)}` que já existe — mantenha a lista de edição de palavras logo abaixo.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/__tests__/TranscriptStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/steps/TranscriptStep.tsx web/src/__tests__/TranscriptStep.test.tsx
git commit -m "feat(web): synced caption preview over video in TranscriptStep"
```

---

## Task 7: teste de regressão do endpoint de mídia (Range)

**Files:**
- Test: `tests/test_files_range.py`

- [ ] **Step 1: Write the failing test** — crie `tests/test_files_range.py`:

```python
def test_files_endpoint_supports_range(tmp_path, monkeypatch):
    monkeypatch.setenv("JOBS_ROOT", str(tmp_path / "jobs"))
    monkeypatch.setenv("TTS_MODE", "mock")
    from starlette.testclient import TestClient
    from api.app import app

    jobdir = tmp_path / "jobs" / "v1"
    jobdir.mkdir(parents=True)
    (jobdir / "trimmed.mp4").write_bytes(b"0123456789")

    client = TestClient(app)
    r = client.get("/api/jobs/v1/files/trimmed.mp4", headers={"Range": "bytes=0-3"})
    assert r.status_code == 206
    assert r.content == b"0123"

    r404 = client.get("/api/jobs/v1/files/source.mp4")
    assert r404.status_code == 404  # source.mp4 não está em ALLOWED_FILES
```

- [ ] **Step 2: Run to verify it passes**

Run: `.venv/bin/pytest tests/test_files_range.py -v`
Expected: PASS — confirma que o `<video>` conseguirá fazer seek (206) e que a lista de arquivos permitidos barra o resto.

- [ ] **Step 3: Commit**

```bash
git add tests/test_files_range.py
git commit -m "test(api): assert files endpoint honors Range for video seek"
```

---

## Task 8: verificação final

**Files:** nenhum

- [ ] **Step 1: Suíte Python completa**

Run: `.venv/bin/pytest -q`
Expected: tudo passa (integração de ffmpeg pula se ausente).

- [ ] **Step 2: Testes de frontend novos**

Run: `cd web && npx vitest run src/__tests__/util.test.ts src/__tests__/CaptionOverlay.test.tsx src/__tests__/CutsStep.test.tsx src/__tests__/TranscriptStep.test.tsx`
Expected: todos passam. (Lembrar: `state.test.ts` tem falhas PRÉ-EXISTENTES de localStorage, não relacionadas.)

- [ ] **Step 3: Build do frontend**

Run: `cd web && npm run build`
Expected: sucesso (tsc + vite).

- [ ] **Step 4: Smoke manual**

Rebuild + copiar para `api/static`, reiniciar uvicorn com `.env`, abrir `http://localhost:8000`, rodar um job: no passo 2 assistir ao trimmed e clicar num trecho da timeline (o vídeo pula); no passo 3 dar play e ver as legendas sincronizadas no rodapé.
