# Fase C — Editor manual de overlays — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um passo novo "Textos" no wizard gravado onde o usuário adiciona/edita/remove blocos de texto sobre a timeline do vídeo (intervalo in/out, posição arrastável, tamanho, cor, fonte, animação de entrada/saída), persistidos em `overlays.json` e concatenados aos overlays de hook na recipe.

**Architecture:** Overlays manuais vivem num artefato `overlays.json` por job, **separado** do hook (que continua derivado de `hook.json`). Endpoints `GET/PUT /jobs/{slug}/overlays` espelham o padrão de `transcript`. `build_recipe` ganha `overlays=` e concatena `hook_overlays + manual_overlays`. Um refine (recorte) **apaga** `overlays.json` (§7.5 do spec, YAGNI, sem reancoragem). No frontend, `OverlaysStep` reusa o padrão de preview de `TranscriptStep`/`CaptionOverlay` (vídeo + `previewScale = clientWidth/1920`) e o padrão de marcação in/out de `CutsStep`; o bloco anima no preview via uma cópia pura de `overlayProgress`.

**Tech Stack:** Python (FastAPI/pytest), React/Vite/Vitest (jsdom + Testing Library), Remotion (já preparado na Fase B), Zod (pinado 4.3.6 — **não atualizar**).

**Pré-requisito:** Fase B entregue (motor de overlays: `zOverlay` rico, `OverlayLayer` renderiza todos os ativos, `remotion/src/overlay-utils.ts` com `overlayProgress`, `build_recipe` gera `hook_overlays`). Confirmar `git log` contém "Fase B" antes de começar.

**Decisões já tomadas no spec §7 (não reabrir):**
- Overlays manuais em `overlays.json` separado; hook derivado (§7.4).
- Refine apaga overlays manuais + aviso na UI (§7.5).
- Editor = passo próprio no wizard, não aba da transcrição (§7.6).
- `overlayProgress` é a fonte única da animação; se o web não puder importar do pacote remotion, **duplicar com teste-espelho** (§3.4/§7.8). **Este plano usa a duplicação** (`web/src/overlayAnim.ts`) por confiabilidade de build (web e remotion são projetos Vite/tsconfig separados); o teste-espelho pinou os mesmos valores numéricos do teste de `remotion/src/overlay-utils.test.ts`, e a fidelidade real do render é sempre validada por `/still` (§8).
- Posição em frações [0,1]; `fontSize` em px de canvas 1920 (§7.2). Preview escala por `clientWidth/1920` (padrão de `TranscriptStep`).

**Riscos herdados (§8, não confundir com regressão):**
- Zod pinado 4.3.6.
- `remotion/src/animated/__tests__/AnimatedRoot.test.tsx` já quebrado (pré-Fase B).
- Fonte fora das 4 suportadas cai para Inter no render (intencional).

---

## File Structure

**Backend**
- `api/models.py` — MODIFICAR: `OverlayParams` + `OverlayAnim` + `HexOrEmpty`.
- `api/routes.py` — MODIFICAR: `GET/PUT /jobs/{slug}/overlays`.
- `pipeline/recipe.py` — MODIFICAR: `build_recipe(overlays=...)` concatena hook + manuais.
- `pipeline/stages.py` — MODIFICAR: `stage_recipe` lê `overlays.json`; `stage_refine` apaga `overlays.json`.
- `api/tests/test_routes.py`, `api/tests/test_models.py`, `tests/test_recipe.py`, `tests/test_stages.py` — testes.

**Frontend**
- `web/src/overlayAnim.ts` — CRIAR: cópia pura de `overlayProgress` + tipos.
- `web/src/overlayGeom.ts` — CRIAR: `clientToFraction` (px→fração, pura, testável).
- `web/src/types.ts` — MODIFICAR: `Overlay`, `OverlayAnim`.
- `web/src/api.ts` — MODIFICAR: `getOverlays`, `putOverlays`.
- `web/src/components/OverlayPreview.tsx` — CRIAR: desenho dos overlays sobre o vídeo + seleção + drag.
- `web/src/steps/OverlaysStep.tsx` — CRIAR: editor.
- `web/src/RecordedWizard.tsx` — MODIFICAR: inserir passo "Textos".
- `web/src/components/Stepper.tsx` — MODIFICAR: label "Textos".
- `web/src/__tests__/overlayAnim.test.ts`, `overlayGeom.test.ts`, `OverlayPreview.test.tsx`, `OverlaysStep.test.tsx`, `api.test.ts` — testes.

---

## Task 1: `OverlayParams` no backend

**Files:**
- Modify: `api/models.py` (após `CaptionStyleParams`, ~linha 73)
- Test: `api/tests/test_models.py`

- [ ] **Step 1: Write the failing test** — adicionar em `api/tests/test_models.py`:

```python
def test_overlay_params_defaults_and_validation():
    from api.models import OverlayParams
    import pytest
    from pydantic import ValidationError
    # defaults preenchidos a partir do mínimo
    o = OverlayParams(text="oi", fromFrame=0, durationInFrames=60)
    assert o.x == 0.5 and o.y == 0.18 and o.anchor == "center"
    assert o.fontSize == 64 and o.enter == "slide-up" and o.exit == "fade"
    assert o.color == "" and o.id == "" and o.type == "text"
    # hex válido aceito; "" aceito; hex inválido rejeitado
    assert OverlayParams(text="x", fromFrame=0, durationInFrames=1, color="#ff0000").color == "#ff0000"
    with pytest.raises(ValidationError):
        OverlayParams(text="x", fromFrame=0, durationInFrames=1, color="vermelho")
    # enum de animação inválido rejeitado
    with pytest.raises(ValidationError):
        OverlayParams(text="x", fromFrame=0, durationInFrames=1, enter="zoom")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest api/tests/test_models.py::test_overlay_params_defaults_and_validation -v`
Expected: FAIL — `OverlayParams` não existe (ImportError).

- [ ] **Step 3: Implement** — em `api/models.py`, adicionar após `CaptionStyleParams` (linha ~73):

```python
OverlayAnim = Literal["fade", "slide-up", "slide-down", "pop", "none"]
# aceita hex (#rgb..#rrggbbaa) OU string vazia (=> usa cor da marca)
HexOrEmpty = Annotated[str, StringConstraints(pattern=r"^(#[0-9a-fA-F]{3,8})?$")]


class OverlayParams(BaseModel):
    id: str = ""
    type: str = "text"
    text: str
    fromFrame: int
    durationInFrames: int
    x: float = 0.5
    y: float = 0.18
    anchor: Literal["center", "left", "right"] = "center"
    fontSize: int = 64
    color: HexOrEmpty = ""
    highlightColor: HexOrEmpty = ""
    fontFamily: str = ""
    enter: OverlayAnim = "slide-up"
    exit: OverlayAnim = "fade"
    enterDurationInFrames: int = 12
    exitDurationInFrames: int = 12
```

(`Annotated`, `Literal`, `StringConstraints`, `BaseModel`, `Field` já estão importados no topo do arquivo.)

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest api/tests/test_models.py -q`
Expected: PASS (todos, incluindo o novo).

- [ ] **Step 5: Commit**

```bash
git add api/models.py api/tests/test_models.py
git commit -m "feat(overlay): OverlayParams pydantic model (Fase C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Endpoints `GET/PUT /jobs/{slug}/overlays`

**Files:**
- Modify: `api/routes.py` (import de models linha 15-18; novo endpoint após `put_transcript`, ~linha 118)
- Test: `api/tests/test_routes.py`

- [ ] **Step 1: Write the failing test** — adicionar em `api/tests/test_routes.py` (reusa o helper `_upload` e a fixture `sample_mp4`):

```python
def test_put_and_get_overlays_roundtrip(client, sample_mp4):
    _upload(client, sample_mp4, "ov1")
    payload = [{
        "id": "ov_a", "type": "text", "text": "Oferta",
        "fromFrame": 30, "durationInFrames": 60,
        "x": 0.5, "y": 0.3, "anchor": "center", "fontSize": 72,
        "color": "#ffcc00", "highlightColor": "", "fontFamily": "Poppins",
        "enter": "pop", "exit": "fade",
        "enterDurationInFrames": 10, "exitDurationInFrames": 10,
    }]
    r = client.put("/api/jobs/ov1/overlays", json=payload)
    assert r.status_code == 200, r.text
    r2 = client.get("/api/jobs/ov1/overlays")
    assert r2.status_code == 200
    got = r2.json()
    assert got[0]["text"] == "Oferta"
    assert got[0]["color"] == "#ffcc00"
    assert got[0]["enter"] == "pop"


def test_get_overlays_empty_when_absent(client, sample_mp4):
    _upload(client, sample_mp4, "ov2")
    r = client.get("/api/jobs/ov2/overlays")
    assert r.status_code == 200
    assert r.json() == []


def test_put_overlays_rejects_invalid_hex(client, sample_mp4):
    _upload(client, sample_mp4, "ov3")
    bad = [{"text": "x", "fromFrame": 0, "durationInFrames": 10, "color": "nope"}]
    r = client.put("/api/jobs/ov3/overlays", json=bad)
    assert r.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest api/tests/test_routes.py -k overlays -v`
Expected: FAIL — rotas inexistentes (404/405).

- [ ] **Step 3: Implement**

(a) Em `api/routes.py`, incluir `OverlayParams` no import de `api.models` (linhas 15-18):

```python
from api.models import (
    CaptionStyleParams, CutParams, CutResult, CutSegmentOut,
    Hook, OverlayParams, RefineParams, RenderParams, TranscribeParams,
)
```

(b) Adicionar os endpoints logo após `put_transcript` (após a linha 118):

```python
@router.get("/jobs/{slug}/overlays")
def get_overlays(slug: str):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "overlays.json"
    if not p.exists():
        return []
    return load_json(p)


@router.put("/jobs/{slug}/overlays")
def put_overlays(slug: str, overlays: list[OverlayParams]):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "overlays.json"
    write_json(p, [o.model_dump() for o in overlays])
    return {"ok": True}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python3 -m pytest api/tests/test_routes.py -k overlays -v`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add api/routes.py api/tests/test_routes.py
git commit -m "feat(overlay): GET/PUT /jobs/{slug}/overlays endpoints (Fase C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `build_recipe` concatena overlays manuais

**Files:**
- Modify: `pipeline/recipe.py` (assinatura de `build_recipe`; geração de `hook_overlays`)
- Test: `tests/test_recipe.py`

- [ ] **Step 1: Write the failing test** — adicionar em `tests/test_recipe.py`:

```python
def test_build_recipe_concatenates_manual_overlays_after_hook():
    manual = [{
        "id": "ov_a", "type": "text", "text": "Oferta",
        "fromFrame": 30, "durationInFrames": 60,
        "x": 0.5, "y": 0.3, "anchor": "center", "fontSize": 72,
        "color": "", "highlightColor": "", "fontFamily": "",
        "enter": "pop", "exit": "fade",
        "enterDurationInFrames": 10, "exitDurationInFrames": 10,
    }]
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=2.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "H", "subtitle": "", "duration_frames": 90},
        max_chars=99, max_gap=5.0,
        overlays=manual,
    )
    # hook primeiro, manuais depois
    assert recipe["overlays"][0]["type"] == "hook"
    assert recipe["overlays"][-1]["id"] == "ov_a"
    assert recipe["overlays"][-1]["text"] == "Oferta"


def test_build_recipe_no_manual_overlays_defaults_to_hook_only():
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "H", "subtitle": "", "duration_frames": 60},
        max_chars=99, max_gap=5.0,
    )
    assert len(recipe["overlays"]) == 1
    assert recipe["overlays"][0]["type"] == "hook"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_recipe.py -k "concatenates or defaults_to_hook_only" -v`
Expected: FAIL — `build_recipe` ainda não aceita `overlays=` (TypeError: unexpected keyword argument).

- [ ] **Step 3: Implement** — em `pipeline/recipe.py`:

(a) Adicionar o parâmetro na assinatura de `build_recipe` (junto aos demais keyword-only, ex. após `brand: dict | None = None,`):

```python
    overlays: list[dict] | None = None,
```

(b) Onde hoje monta `hook_overlays` e retorna `"overlays": hook_overlays`, concatenar os manuais. Logo após o bloco que fecha `hook_overlays` (o `if subtitle:` append), adicionar:

```python
    manual_overlays = overlays or []
```

e no `return`, trocar `"overlays": hook_overlays,` por:

```python
        "overlays": hook_overlays + manual_overlays,
```

- [ ] **Step 4: Run the full recipe suite**

Run: `python3 -m pytest tests/test_recipe.py -q`
Expected: PASS (todos, incluindo os 2 novos e os da Fase B).

- [ ] **Step 5: Commit**

```bash
git add pipeline/recipe.py tests/test_recipe.py
git commit -m "feat(recipe): build_recipe concatenates manual overlays after hook (Fase C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `stage_recipe` lê `overlays.json`; `stage_refine` o apaga

**Files:**
- Modify: `pipeline/stages.py` (`stage_recipe`: leitura; `stage_refine`: invalidação linha 52)
- Test: `tests/test_stages.py`

- [ ] **Step 1: Write the failing tests** — adicionar em `tests/test_stages.py`:

```python
def test_stage_recipe_includes_manual_overlays(tmp_path):
    from pipeline.job import init_job, write_json, load_json
    from pipeline.stages import stage_recipe
    job = init_job(tmp_path / "jobs", "c1")
    write_json(job.dir / "probe.json", {"width": 1920, "height": 1080, "fps": 30, "duration": 2.0})
    write_json(job.dir / "transcript.json",
               [{"text": "ola", "start": 0.0, "end": 0.5,
                 "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}])
    write_json(job.dir / "hook.json", {"title": "H", "subtitle": ""})
    write_json(job.dir / "overlays.json", [{
        "id": "ov_a", "type": "text", "text": "Manual",
        "fromFrame": 10, "durationInFrames": 20,
        "x": 0.5, "y": 0.3, "anchor": "center", "fontSize": 64,
        "color": "", "highlightColor": "", "fontFamily": "",
        "enter": "fade", "exit": "fade",
        "enterDurationInFrames": 12, "exitDurationInFrames": 12,
    }])
    stage_recipe(job)
    recipe = load_json(job.dir / "edit-recipe.json")
    assert any(o["text"] == "Manual" for o in recipe["overlays"])
    assert recipe["overlays"][0]["type"] == "hook"  # hook ainda primeiro


def test_stage_refine_deletes_overlays_json(tmp_path, monkeypatch):
    import pipeline.stages as stages
    from pipeline.job import init_job, write_json
    job = init_job(tmp_path / "jobs", "c2")
    write_json(job.dir / "trimmed.probe.json",
               {"width": 1920, "height": 1080, "fps": 30, "duration": 10.0, "nb_frames": 300})
    (job.dir / "trimmed.mp4").write_bytes(b"x")
    write_json(job.dir / "transcript.json", [{"text": "a", "start": 0.0, "end": 0.5, "words": []}])
    write_json(job.dir / "overlays.json", [{"id": "ov_a", "type": "text", "text": "m",
                                             "fromFrame": 0, "durationInFrames": 10}])
    # neutralizar corte real: cut_segments não faz nada, probe devolve algo válido
    monkeypatch.setattr(stages, "cut_segments", lambda *a, **k: None)
    class _M:  # probe stub
        width = 1920; height = 1080; fps = 30; duration = 5.0; nb_frames = 150
    monkeypatch.setattr(stages, "probe_video", lambda *a, **k: _M())
    monkeypatch.setattr(stages, "invert_ranges", lambda ranges, dur: [stages.Segment(0.0, 5.0)] if False else __import__("pipeline.silence", fromlist=["Segment"]).Segment(0.0, 5.0) and [__import__("pipeline.silence", fromlist=["Segment"]).Segment(0.0, 5.0)])
    from pipeline.silence import Segment
    stages.stage_refine(job, [Segment(1.0, 2.0)])
    assert not (job.dir / "overlays.json").exists()
```

> Se o stub de `stage_refine` acima ficar frágil no ambiente, simplificar: em vez de mockar, chamar `stage_refine` com um `trimmed.mp4` real gerado por ffmpeg (padrão de `test_stages.py::_clip` já existente) e um `remove` pequeno; então só assertar `not (job.dir / "overlays.json").exists()`. **Preferir a versão com `_clip` real se o mock der trabalho** — o objetivo do teste é apenas: refine apaga `overlays.json`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `python3 -m pytest tests/test_stages.py -k "manual_overlays or deletes_overlays" -v`
Expected: FAIL — `stage_recipe` ainda não lê `overlays.json`; `stage_refine` ainda não apaga.

- [ ] **Step 3: Implement** — em `pipeline/stages.py`:

(a) Em `stage_recipe`, antes da chamada `recipe = build_recipe(...)`, ler os overlays manuais:

```python
    manual_overlays = None
    overlays_path = job.dir / "overlays.json"
    if overlays_path.exists():
        manual_overlays = load_json(overlays_path)
```

e passar na chamada `build_recipe(...)` o kwarg (junto de `brand=brand,`):

```python
        overlays=manual_overlays,
```

(b) Em `stage_refine`, na tupla de invalidação (linha 52), acrescentar `"overlays.json"`:

```python
    for stale in ("transcript.json", "edit-recipe.json", "overlays.json"):
        (job.dir / stale).unlink(missing_ok=True)
```

- [ ] **Step 4: Run the stages suite + full backend**

Run:
```bash
python3 -m pytest tests/test_stages.py -v
python3 -m pytest tests/ api/tests/ -q
```
Expected: PASS. Se `test_stage_refine_deletes_overlays_json` (versão mock) estiver frágil, trocar pela versão `_clip` real descrita no Step 1 e reexecutar.

- [ ] **Step 5: Commit**

```bash
git add pipeline/stages.py tests/test_stages.py
git commit -m "feat(recipe): stage_recipe reads overlays.json; stage_refine clears it (Fase C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `overlayAnim.ts` no web (cópia pura + teste-espelho)

**Files:**
- Create: `web/src/overlayAnim.ts`
- Test: `web/src/__tests__/overlayAnim.test.ts`

Nota: cópia deliberada de `remotion/src/overlay-utils.ts` (§3.4). O teste-espelho pinou os MESMOS valores do teste do remotion para travar paridade.

- [ ] **Step 1: Write the failing test** — criar `web/src/__tests__/overlayAnim.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { overlayProgress, type OverlayTiming } from "../overlayAnim";

const base: OverlayTiming = {
  fromFrame: 0, durationInFrames: 90,
  enter: "slide-up", exit: "fade",
  enterDurationInFrames: 12, exitDurationInFrames: 12,
};

describe("overlayProgress (web, paridade com remotion/overlay-utils)", () => {
  it("entrada local=0 invisível, translateY +40", () => {
    const p = overlayProgress(0, base);
    expect(p.opacity).toBe(0);
    expect(p.translateY).toBeCloseTo(40, 5);
  });
  it("meio totalmente visível", () => {
    const p = overlayProgress(45, base);
    expect(p.opacity).toBe(1);
    expect(p.translateY).toBeCloseTo(0, 5);
    expect(p.scale).toBeCloseTo(1, 5);
  });
  it("fim faz fade-out", () => {
    expect(overlayProgress(89, base).opacity).toBeLessThan(0.2);
    expect(overlayProgress(90, base).opacity).toBe(0);
  });
  it("none = hard cut", () => {
    const p = overlayProgress(0, { ...base, enter: "none", exit: "none" });
    expect(p.opacity).toBe(1);
    expect(p.translateY).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/overlayAnim.test.ts`
Expected: FAIL — módulo `../overlayAnim` inexistente.

- [ ] **Step 3: Implement** — criar `web/src/overlayAnim.ts` (idêntico em comportamento a `remotion/src/overlay-utils.ts`):

```ts
export type OverlayAnim = "fade" | "slide-up" | "slide-down" | "pop" | "none";

export interface OverlayTiming {
  fromFrame: number;
  durationInFrames: number;
  enter: OverlayAnim;
  exit: OverlayAnim;
  enterDurationInFrames: number;
  exitDurationInFrames: number;
}

export interface OverlayTransform {
  opacity: number;
  translateY: number;
  scale: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// Cópia pura de remotion/src/overlay-utils.ts (§3.4): fonte única da animação;
// paridade travada pelo teste-espelho. Fidelidade de render validada por /still.
export function overlayProgress(frame: number, o: OverlayTiming): OverlayTransform {
  const local = frame - o.fromFrame;
  const dur = o.durationInFrames;

  const enterP = o.enterDurationInFrames > 0 ? clamp01(local / o.enterDurationInFrames) : 1;
  const exitP = o.exitDurationInFrames > 0 ? clamp01((dur - local) / o.exitDurationInFrames) : 1;

  let opacity = 1;
  let translateY = 0;
  let scale = 1;

  switch (o.enter) {
    case "fade": opacity = Math.min(opacity, enterP); break;
    case "slide-up": opacity = Math.min(opacity, enterP); translateY += (1 - enterP) * 40; break;
    case "slide-down": opacity = Math.min(opacity, enterP); translateY += (1 - enterP) * -40; break;
    case "pop": {
      opacity = Math.min(opacity, enterP);
      const eased = 1 - Math.pow(1 - enterP, 3);
      scale = 0.7 + eased * 0.3;
      break;
    }
    case "none":
    default: break;
  }

  switch (o.exit) {
    case "fade": opacity = Math.min(opacity, exitP); break;
    case "slide-up": opacity = Math.min(opacity, exitP); translateY += (1 - exitP) * -40; break;
    case "slide-down": opacity = Math.min(opacity, exitP); translateY += (1 - exitP) * 40; break;
    case "pop": opacity = Math.min(opacity, exitP); scale = Math.min(scale, 0.7 + exitP * 0.3); break;
    case "none":
    default: break;
  }

  return { opacity, translateY, scale };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/__tests__/overlayAnim.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/overlayAnim.ts web/src/__tests__/overlayAnim.test.ts
git commit -m "feat(web): overlayProgress copy for preview parity (Fase C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: tipos `Overlay` + `api.ts` getOverlays/putOverlays

**Files:**
- Modify: `web/src/types.ts` (após o tipo `Hook`, ~linha 12)
- Modify: `web/src/api.ts` (após `putHook`, ~linha 61)
- Test: `web/src/__tests__/api.test.ts`

- [ ] **Step 1: Write the failing test** — adicionar em `web/src/__tests__/api.test.ts`:

```ts
import { getOverlays, putOverlays } from "../api";
import { vi } from "vitest";

describe("overlays api", () => {
  it("putOverlays faz PUT com o payload e getOverlays faz GET", async () => {
    const calls: any[] = [];
    const fetchMock = vi.fn(async (url: string, init?: any) => {
      calls.push({ url, init });
      if (init?.method === "PUT") return { ok: true, json: async () => ({ ok: true }) } as any;
      return { ok: true, json: async () => ([{ id: "ov_a", text: "x" }]) } as any;
    });
    vi.stubGlobal("fetch", fetchMock);
    await putOverlays("s1", [{ id: "ov_a", text: "x", fromFrame: 0, durationInFrames: 10 } as any]);
    const got = await getOverlays("s1");
    vi.unstubAllGlobals();
    const put = calls.find((c) => c.init?.method === "PUT");
    expect(put.url).toBe("/api/jobs/s1/overlays");
    expect(JSON.parse(put.init.body)[0].id).toBe("ov_a");
    expect(got[0].id).toBe("ov_a");
  });
});
```

(Se `describe/it/expect` não estiverem no escopo do arquivo, importar de `vitest` no topo — seguir o que já existe em `api.test.ts`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/api.test.ts`
Expected: FAIL — `getOverlays`/`putOverlays` não exportados.

- [ ] **Step 3: Implement**

(a) Em `web/src/types.ts`, adicionar após o tipo `Hook` (linha 12):

```ts
export type OverlayAnim = "fade" | "slide-up" | "slide-down" | "pop" | "none";

export type Overlay = {
  id: string;
  type: string;
  text: string;
  fromFrame: number;
  durationInFrames: number;
  x: number;
  y: number;
  anchor: "center" | "left" | "right";
  fontSize: number;
  color: string;
  highlightColor: string;
  fontFamily: string;
  enter: OverlayAnim;
  exit: OverlayAnim;
  enterDurationInFrames: number;
  exitDurationInFrames: number;
};
```

(b) Em `web/src/api.ts`, importar `Overlay` no import de `./types` (linha 1-3) e adicionar após `putHook` (linha 61):

```ts
export async function getOverlays(slug: string): Promise<Overlay[]> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/overlays`));
}

export async function putOverlays(slug: string, overlays: Overlay[]): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/overlays`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(overlays),
  }));
}
```

Atualizar a linha de import: `import type { Hook, JobState, CaptionLine, SSEEvent, Overlay } from "./types";`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/__tests__/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/types.ts web/src/api.ts web/src/__tests__/api.test.ts
git commit -m "feat(web): Overlay type + getOverlays/putOverlays api (Fase C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `OverlayPreview` (desenho + seleção + drag) e `overlayGeom`

**Files:**
- Create: `web/src/overlayGeom.ts`
- Create: `web/src/components/OverlayPreview.tsx`
- Test: `web/src/__tests__/overlayGeom.test.ts`, `web/src/__tests__/OverlayPreview.test.tsx`

- [ ] **Step 1: Write the failing tests**

Criar `web/src/__tests__/overlayGeom.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clientToFraction } from "../overlayGeom";

describe("clientToFraction", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 } as DOMRect;
  it("converte ponto para fração [0,1] relativa ao rect", () => {
    expect(clientToFraction(300, 150, rect)).toEqual({ x: 0.5, y: 0.5 });
  });
  it("clampa fora dos limites", () => {
    expect(clientToFraction(0, 0, rect)).toEqual({ x: 0, y: 0 });
    expect(clientToFraction(9999, 9999, rect)).toEqual({ x: 1, y: 1 });
  });
});
```

Criar `web/src/__tests__/OverlayPreview.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OverlayPreview } from "../components/OverlayPreview";
import type { Overlay } from "../types";

afterEach(cleanup);

const ov: Overlay = {
  id: "ov_a", type: "text", text: "Oferta",
  fromFrame: 0, durationInFrames: 90,
  x: 0.5, y: 0.2, anchor: "center", fontSize: 64,
  color: "", highlightColor: "", fontFamily: "",
  enter: "slide-up", exit: "fade", enterDurationInFrames: 12, exitDurationInFrames: 12,
};

describe("OverlayPreview", () => {
  it("desenha o texto do overlay ativo no frame atual", () => {
    render(<OverlayPreview overlays={[ov]} frame={20} scale={1} selectedId={null} onSelect={() => {}} onMove={() => {}} />);
    expect(screen.getByText("Oferta")).toBeInTheDocument();
  });
  it("não desenha overlay fora do intervalo", () => {
    const { container } = render(<OverlayPreview overlays={[ov]} frame={200} scale={1} selectedId={null} onSelect={() => {}} onMove={() => {}} />);
    expect(container.textContent).toBe("");
  });
  it("chama onSelect ao clicar no bloco", () => {
    const onSelect = vi.fn();
    render(<OverlayPreview overlays={[ov]} frame={20} scale={1} selectedId={null} onSelect={onSelect} onMove={() => {}} />);
    fireEvent.pointerDown(screen.getByText("Oferta"));
    expect(onSelect).toHaveBeenCalledWith("ov_a");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/__tests__/overlayGeom.test.ts src/__tests__/OverlayPreview.test.tsx`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implement**

Criar `web/src/overlayGeom.ts`:

```ts
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Converte um ponto de tela (clientX/Y) em fração [0,1] relativa ao rect do container.
export function clientToFraction(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}
```

Criar `web/src/components/OverlayPreview.tsx`:

```tsx
import { useRef } from "react";
import type { Overlay } from "../types";
import { overlayProgress } from "../overlayAnim";
import { clientToFraction } from "../overlayGeom";

export const OverlayPreview: React.FC<{
  overlays: Overlay[];
  frame: number;
  scale: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}> = ({ overlays, frame, scale, selectedId, onSelect, onMove }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);

  const active = overlays.filter(
    (o) => frame >= o.fromFrame && frame < o.fromFrame + o.durationInFrames,
  );

  const onPointerDownBlock = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    onSelect(id);
    dragId.current = id;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragId.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const { x, y } = clientToFraction(e.clientX, e.clientY, rect);
    onMove(dragId.current, x, y);
  };
  const endDrag = () => { dragId.current = null; };

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 pointer-events-none"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    >
      {active.map((ov) => {
        const { opacity, translateY, scale: sc } = overlayProgress(frame, ov);
        const anchorTx =
          ov.anchor === "left" ? "translate(0, -50%)"
          : ov.anchor === "right" ? "translate(-100%, -50%)"
          : "translate(-50%, -50%)";
        const selected = ov.id === selectedId;
        return (
          <div
            key={ov.id}
            onPointerDown={(e) => onPointerDownBlock(e, ov.id)}
            className="absolute pointer-events-auto cursor-move select-none"
            style={{
              left: `${ov.x * 100}%`,
              top: `${ov.y * 100}%`,
              transform: `${anchorTx} translateY(${translateY * scale}px) scale(${sc})`,
              opacity,
              color: ov.color || "#ffffff",
              fontFamily: ov.fontFamily || undefined,
              fontWeight: 800,
              fontSize: ov.fontSize * scale,
              lineHeight: 1.15,
              textAlign: ov.anchor === "left" ? "left" : ov.anchor === "right" ? "right" : "center",
              maxWidth: "80%",
              whiteSpace: "pre-wrap",
              textShadow: "0 4px 24px rgba(0,0,0,0.7)",
              outline: selected ? "2px solid #22c55e" : undefined,
              outlineOffset: 4,
            }}
          >
            {ov.text}
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/__tests__/overlayGeom.test.ts src/__tests__/OverlayPreview.test.tsx`
Expected: PASS (2 + 3 testes).

- [ ] **Step 5: Commit**

```bash
git add web/src/overlayGeom.ts web/src/components/OverlayPreview.tsx web/src/__tests__/overlayGeom.test.ts web/src/__tests__/OverlayPreview.test.tsx
git commit -m "feat(web): OverlayPreview (draw+select+drag) + clientToFraction (Fase C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `OverlaysStep` (editor)

**Files:**
- Create: `web/src/steps/OverlaysStep.tsx`
- Test: `web/src/__tests__/OverlaysStep.test.tsx`

- [ ] **Step 1: Write the failing test** — criar `web/src/__tests__/OverlaysStep.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { OverlaysStep } from "../steps/OverlaysStep";

afterEach(cleanup);

function mockFetch() {
  const calls: any[] = [];
  const f = vi.fn(async (url: string, init?: any) => {
    calls.push({ url, init });
    if (url.endsWith("/overlays") && (!init || init.method === "GET" || !init.method))
      return { ok: true, json: async () => [] } as any;
    if (url.match(/\/jobs\/.+$/) && (!init || !init.method))
      return { ok: true, json: async () => ({ slug: "s1", probe: { width: 1920, height: 1080, fps: 30, duration: 10 } }) } as any;
    return { ok: true, json: async () => ({ ok: true }) } as any;
  });
  vi.stubGlobal("fetch", f);
  return calls;
}

describe("OverlaysStep", () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => vi.unstubAllGlobals());

  const props = { slug: "s1", setSlug: () => {}, next: () => {}, back: () => {} };

  it("adiciona um texto e ele aparece na lista", async () => {
    render(<OverlaysStep {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /texto/i }));
    // aparece um item editável com o texto placeholder
    expect(await screen.findByDisplayValue(/novo texto/i)).toBeInTheDocument();
  });

  it("salvar chama PUT /overlays com o item", async () => {
    const calls = mockFetch();
    render(<OverlaysStep {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /texto/i }));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === "PUT" && c.url.endsWith("/overlays"));
      expect(put).toBeTruthy();
      expect(JSON.parse(put.init.body).length).toBe(1);
    });
  });

  it("remover tira o item da lista", async () => {
    render(<OverlaysStep {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /texto/i }));
    expect(await screen.findByDisplayValue(/novo texto/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remover/i }));
    expect(screen.queryByDisplayValue(/novo texto/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx`
Expected: FAIL — `OverlaysStep` inexistente.

- [ ] **Step 3: Implement** — criar `web/src/steps/OverlaysStep.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { getOverlays, putOverlays, runRecipe, mediaUrl, getJob } from "../api";
import { OverlayPreview } from "../components/OverlayPreview";
import type { Overlay, OverlayAnim } from "../types";
import type { StepProps } from "../App";

const ANIMS: OverlayAnim[] = ["fade", "slide-up", "slide-down", "pop", "none"];
const FONTS = ["Inter", "Poppins", "Montserrat", "Roboto"];

function newOverlay(fromFrame: number): Overlay {
  return {
    id: `ov_${Date.now().toString(36)}`,
    type: "text", text: "Novo texto",
    fromFrame, durationInFrames: 60,
    x: 0.5, y: 0.25, anchor: "center", fontSize: 64,
    color: "", highlightColor: "", fontFamily: "",
    enter: "slide-up", exit: "fade",
    enterDurationInFrames: 12, exitDurationInFrames: 12,
  };
}

export const OverlaysStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fps, setFps] = useState(30);
  const [now, setNow] = useState(0);
  const [previewScale, setPreviewScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    getOverlays(slug).then(setOverlays).catch(() => {});
    getJob(slug).then((j: any) => { if (j?.probe?.fps) setFps(j.probe.fps); }).catch(() => {});
  }, [slug]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => setPreviewScale(v.clientWidth > 0 ? v.clientWidth / 1920 : 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(v);
    return () => ro.disconnect();
  }, []);

  const frame = Math.round(now * fps);
  const selected = overlays.find((o) => o.id === selectedId) || null;

  const patch = (id: string, p: Partial<Overlay>) =>
    setOverlays((list) => list.map((o) => (o.id === id ? { ...o, ...p } : o)));

  const addOverlay = () => {
    const o = newOverlay(frame);
    setOverlays((l) => [...l, o]);
    setSelectedId(o.id);
  };
  const removeOverlay = (id: string) =>
    setOverlays((l) => l.filter((o) => o.id !== id));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await putOverlays(slug, overlays);
      await runRecipe(slug);
    } catch (e: any) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const startSec = selected ? selected.fromFrame / fps : 0;
  const endSec = selected ? (selected.fromFrame + selected.durationInFrames) / fps : 0;
  const setStartSec = (s: number) => selected && patch(selected.id, {
    fromFrame: Math.max(0, Math.round(s * fps)),
    durationInFrames: Math.max(1, Math.round(endSec * fps) - Math.round(s * fps)),
  });
  const setEndSec = (s: number) => selected && patch(selected.id, {
    durationInFrames: Math.max(1, Math.round(s * fps) - selected.fromFrame),
  });

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">5. Textos</h2>
      <p className="text-sm text-zinc-400">
        Adicione blocos de texto sobre o vídeo. Recortar o vídeo depois (passo Cortes) remove os textos manuais.
      </p>

      <div className="relative">
        <video
          ref={videoRef}
          src={mediaUrl(slug, "trimmed.mp4")}
          controls
          onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)}
          className="w-full rounded border border-zinc-800"
        />
        <OverlayPreview
          overlays={overlays}
          frame={frame}
          scale={previewScale}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={(id, x, y) => patch(id, { x, y })}
        />
      </div>

      <div className="flex gap-2">
        <button onClick={addOverlay} className="px-3 py-2 bg-emerald-600 rounded font-medium">+ Texto</button>
        <button onClick={save} disabled={saving} className="px-3 py-2 bg-zinc-800 rounded disabled:opacity-40">
          {saving ? "Salvando..." : "Salvar textos"}
        </button>
      </div>
      {err && <p className="text-red-400 text-sm">{err}</p>}

      <ol className="space-y-1 text-sm">
        {overlays.map((o) => (
          <li key={o.id}
            className={`flex items-center gap-2 px-2 py-1 rounded ${o.id === selectedId ? "bg-zinc-800" : ""}`}>
            <button className="flex-1 text-left" onClick={() => setSelectedId(o.id)}>
              <input
                aria-label={`texto do overlay ${o.id}`}
                value={o.text}
                onChange={(e) => patch(o.id, { text: e.target.value })}
                className="bg-transparent w-full outline-none border-b border-transparent focus:border-emerald-500"
              />
            </button>
            <span className="text-xs text-zinc-500">{(o.fromFrame / fps).toFixed(1)}s</span>
            <button aria-label={`remover ${o.id}`} onClick={() => removeOverlay(o.id)} className="text-red-400 px-2">remover</button>
          </li>
        ))}
      </ol>

      {selected && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">Início (s)
            <input type="number" step={0.1} min={0} value={startSec.toFixed(1)}
              onChange={(e) => setStartSec(Number(e.target.value))}
              className="bg-zinc-800 rounded px-2 py-1" />
          </label>
          <label className="flex flex-col gap-1">Fim (s)
            <input type="number" step={0.1} min={0} value={endSec.toFixed(1)}
              onChange={(e) => setEndSec(Number(e.target.value))}
              className="bg-zinc-800 rounded px-2 py-1" />
          </label>
          <button className="col-span-2 px-2 py-1 bg-zinc-800 rounded"
            onClick={() => setStartSec(now)}>Marcar início no tempo atual</button>
          <label className="flex flex-col gap-1">Tamanho
            <input aria-label="tamanho" type="range" min={24} max={160} value={selected.fontSize}
              onChange={(e) => patch(selected.id, { fontSize: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1">Cor
            <input aria-label="cor" type="color" value={selected.color || "#ffffff"}
              onChange={(e) => patch(selected.id, { color: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1">Fonte
            <select aria-label="fonte" value={selected.fontFamily || "Inter"}
              onChange={(e) => patch(selected.id, { fontFamily: e.target.value })}
              className="bg-zinc-800 rounded px-2 py-1">
              {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Âncora
            <select aria-label="ancora" value={selected.anchor}
              onChange={(e) => patch(selected.id, { anchor: e.target.value as Overlay["anchor"] })}
              className="bg-zinc-800 rounded px-2 py-1">
              {["center", "left", "right"].map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Entrada
            <select aria-label="entrada" value={selected.enter}
              onChange={(e) => patch(selected.id, { enter: e.target.value as OverlayAnim })}
              className="bg-zinc-800 rounded px-2 py-1">
              {ANIMS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Saída
            <select aria-label="saida" value={selected.exit}
              onChange={(e) => patch(selected.id, { exit: e.target.value as OverlayAnim })}
              className="bg-zinc-800 rounded px-2 py-1">
              {ANIMS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="pt-4 flex justify-between">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
        <button onClick={async () => { await save(); next(); }} className="px-4 py-2 bg-emerald-600 rounded font-medium">
          Próximo →
        </button>
      </div>
    </section>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx`
Expected: PASS (3 testes). Se o mock de `getJob` colidir com o de `getOverlays` (ambos batem `/jobs/s1...`), ajustar a ordem dos `if` no mock: casar `/overlays` primeiro (já está assim no teste). Ambos retornam OK, então o componente monta.

- [ ] **Step 5: Commit**

```bash
git add web/src/steps/OverlaysStep.tsx web/src/__tests__/OverlaysStep.test.tsx
git commit -m "feat(web): OverlaysStep manual overlay editor (Fase C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Ligar o passo "Textos" no wizard

**Files:**
- Modify: `web/src/RecordedWizard.tsx`
- Modify: `web/src/components/Stepper.tsx` (linha 1, array `STEPS`)

- [ ] **Step 1: Update Stepper labels** — em `web/src/components/Stepper.tsx`, trocar a linha 1:

```ts
const STEPS = ["Upload", "Cortes", "Transcrição", "Hook", "Render"];
```

por:

```ts
const STEPS = ["Upload", "Cortes", "Transcrição", "Hook", "Textos", "Render"];
```

(AnimatedWizard passa `labels` próprios, então não é afetado.)

- [ ] **Step 2: Insert the step in RecordedWizard** — em `web/src/RecordedWizard.tsx`:

(a) Importar `OverlaysStep` (após o import de `HookStep`):

```ts
import { OverlaysStep } from "./steps/OverlaysStep";
```

(b) Trocar o cap de `next` (linha 18) de `Math.min(4, s + 1)` para `Math.min(5, s + 1)`:

```ts
  const next = () => setStep((s) => Math.min(5, s + 1));
```

(c) Inserir `OverlaysStep` entre `HookStep` e `RenderStep` na lista `Steps` (linha 21):

```ts
  const Steps: React.ComponentType<StepProps>[] = [UploadStep, CutsStep, TranscriptStep, HookStep, OverlaysStep, RenderStep];
```

- [ ] **Step 3: Build (typecheck) + full web suite**

Run:
```bash
cd web && npm run build 2>&1 | tail -5
cd web && npx vitest run 2>&1 | tail -6
```
Expected: build OK; todos os testes web verdes (incluindo os novos das Tasks 5-8). Os testes pré-quebrados do §8 são do Remotion, não do web — a suíte web deve ficar 100% verde.

- [ ] **Step 4: Commit**

```bash
git add web/src/RecordedWizard.tsx web/src/components/Stepper.tsx
git commit -m "feat(web): wire 'Textos' step into recorded wizard (Fase C)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Verificação e entregável C (build + render real + prova por `/still`)

**Files:** nenhum (verificação). Executar inline (não subagent). Ver memória [[render-still-proof-workflow]] para operar o servidor.

- [ ] **Step 1: Suítes completas verdes**

Run:
```bash
python3 -m pytest tests/ api/tests/ -q
cd web && npx vitest run 2>&1 | tail -6
(cd remotion && npx vitest run 2>&1 | grep -E "Test Files|Tests |FAIL")
```
Expected: Python 100% verde; web 100% verde; Remotion só falha em `animated/__tests__/AnimatedRoot.test.tsx` (baseline §8).

- [ ] **Step 2: Subir servidor + injetar 2 overlays manuais num job real**

Servidor: `api.app:app`, rotas com prefixo `/api`, `python3`, `.env` carregado (ver [[render-still-proof-workflow]]). Usar um job com `trimmed.mp4`+`hook.json`+`transcript.json`+`probe.json` (ex. `A1 Exame`, slug URL-encoded `A1%20Exame`).

```bash
cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude"
lsof -ti :8000 | xargs kill 2>/dev/null; sleep 1
set -a; . ./.env 2>/dev/null; set +a
nohup python3 -m uvicorn api.app:app --host 0.0.0.0 --port 8000 > /tmp/uvicorn-fasec.log 2>&1 &
sleep 4
SLUG="A1%20Exame"
# 2 overlays: um no topo (frame 30-120, slide-up/fade), um embaixo (frame 150-240, pop/fade), posições/animações diferentes
curl -s -X PUT "localhost:8000/api/jobs/$SLUG/overlays" -H "Content-Type: application/json" -d '[
 {"id":"ov_t1","type":"text","text":"PRIMEIRA IDEIA","fromFrame":30,"durationInFrames":90,"x":0.5,"y":0.18,"anchor":"center","fontSize":80,"color":"#ffdd00","highlightColor":"","fontFamily":"Poppins","enter":"slide-up","exit":"fade","enterDurationInFrames":12,"exitDurationInFrames":12},
 {"id":"ov_t2","type":"text","text":"segunda ideia","fromFrame":150,"durationInFrames":90,"x":0.3,"y":0.75,"anchor":"left","fontSize":56,"color":"","highlightColor":"","fontFamily":"Inter","enter":"pop","exit":"fade","enterDurationInFrames":12,"exitDurationInFrames":12}
]' -w "\n[put:%{http_code}]\n"
curl -s -X POST "localhost:8000/api/jobs/$SLUG/recipe" -w "[recipe:%{http_code}]\n"
python3 -c "import json;r=json.load(open('jobs/A1 Exame/edit-recipe.json'));print('overlays:',[(o['type'],o.get('id'),o['fromFrame'],o['durationInFrames'],o['enter']) for o in r['overlays']])"
```
Expected: `put:200`, `recipe:200`; a recipe deve conter o overlay `hook` PRIMEIRO, depois `ov_t1` e `ov_t2`.

- [ ] **Step 3: Render stills nos frames-chave e inspecionar**

Escolher frames onde cada overlay aparece/anima: 60 (ov_t1 no topo, cheio), 180 (ov_t2 embaixo à esquerda, cheio), 300 (nenhum dos dois manuais — depois do fim de ambos). Salvar no scratchpad da sessão.

```bash
OUT="<scratchpad-da-sessão>"
for F in 60 180 300; do
  curl -s "localhost:8000/api/jobs/A1%20Exame/still?frame=$F&format=main16x9" --output "$OUT/c-f$F.png" -w "f$F http:%{http_code}\n"
done
```
Ler `c-f60.png`, `c-f180.png`, `c-f300.png` (Read tool) e confirmar:
1. `c-f60.png`: "PRIMEIRA IDEIA" amarelo no topo, sobre o vídeo.
2. `c-f180.png`: "segunda ideia" embaixo à esquerda, sobre o vídeo (posição/animação diferentes do primeiro).
3. `c-f300.png`: nenhum dos dois textos manuais (ambos terminaram) — só o vídeo (+ legenda de rodapé, se houver).

Se algum falhar, depurar com `superpowers:systematic-debugging` antes de concluir.

- [ ] **Step 4: Confirmar sobrevivência a re-transcrição e remoção por refine (opcional, rápido)**

- Sobrevivência: `overlays.json` continua após re-rodar `/recipe` (não é apagado por recipe). Verificar `ls jobs/"A1 Exame"/overlays.json`.
- (Não executar refine no job de demonstração — apagaria os overlays. O comportamento já é coberto por `test_stage_refine_deletes_overlays_json` na Task 4.)

- [ ] **Step 5: Deploy** — build web→api/static, push main, restart uvicorn (comando `build` da project memory), depois reiniciar uvicorn com `.env`:

```bash
cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude" && lsof -ti :8000 | xargs kill 2>/dev/null; sleep 1 && (cd web && npm run build 2>&1 | tail -1) && rm -rf api/static && mkdir -p api/static && cp -r web/dist/. api/static/ && echo "static: $(ls api/static/assets/*.js | xargs -n1 basename)" && git push origin main 2>&1 | tail -2
lsof -ti :8000 | xargs kill 2>/dev/null; sleep 1; set -a; . ./.env 2>/dev/null; set +a; nohup python3 -m uvicorn api.app:app --host 0.0.0.0 --port 8000 > /tmp/uvicorn.log 2>&1 & sleep 4; curl -s -o /dev/null -w "root:%{http_code}\n" localhost:8000/
```

- [ ] **Step 6: Reportar** a prova (3 frames) e o estado das suítes via `superpowers:verification-before-completion`. Atualizar memória (marcar Fase C entregue, próxima = D).

---

## Self-Review (checklist do autor do plano)

**Cobertura do spec §3:**
- §3.1 passo próprio "Textos" no wizard → Tasks 8, 9. ✓
- §3.2 `overlays.json` + GET/PUT + `OverlayParams` + build_recipe concatena + stage lê → Tasks 1, 2, 3, 4. ✓
- §3.3 UI: adicionar/selecionar/mover(drag)/tempo(in-out)/propriedades/remover/salvar → Tasks 7, 8. ✓
- §3.4 preview anima via overlayProgress (cópia + teste-espelho) → Task 5, usado na Task 7. ✓
- §3.5 refine apaga overlays.json + aviso na UI ("recortar remove textos") → Task 4 (apaga) + Task 8 (aviso no texto do passo). ✓
- §3.6 testes: round-trip, hex inválido, concat, refine apaga, add/edit/remove/save, px↔fração → Tasks 2, 3, 4, 6, 7, 8. ✓
- §3.7 entregável: 2 textos, tempos/posições/animações diferentes, render, /still → Task 10. ✓

**Consistência de tipos/nomes:** campos de `Overlay` idênticos entre `types.ts` (Task 6), `OverlayParams` (Task 1), `overlayAnim.ts`/`OverlayTiming` (Task 5), `OverlayPreview` (Task 7), `OverlaysStep` (Task 8) e o `zOverlay`/`build_recipe` da Fase B. `getOverlays`/`putOverlays` idênticos entre api.ts (Task 6) e OverlaysStep (Task 8). `clientToFraction`, `overlayProgress` assinaturas consistentes.

**Sem placeholders:** todo passo de código traz o código real. ✓

**Nota de risco:** a duplicação de `overlayProgress` (Task 5) é intencional (§3.4) e travada por teste-espelho; se num futuro a matemática mudar, atualizar os DOIS arquivos (`remotion/src/overlay-utils.ts` e `web/src/overlayAnim.ts`) — a fidelidade final é sempre validada por `/still`.
