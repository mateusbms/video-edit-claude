# Corte por silêncio local — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No passo Cortes, deixar o usuário apontar aproximadamente um trecho ruim (clique único) e o sistema achar as fronteiras exatas de corte re-analisando só uma janelinha em volta, com preview da emenda e nudge frame-a-frame, aplicando pelo caminho de refino já existente.

**Architecture:** Detecção-only no backend: uma nova rota síncrona `POST /jobs/{slug}/detect-local` roda `silencedetect` numa fatia de ±1s do `trimmed.mp4` e devolve uma fronteira `{start, end}` proposta — sem cortar. A escolha da fronteira é uma função pura (`fronteira_local`) sobre os silêncios da janela. O front mostra os dois quadros da emenda com nudge, e ao confirmar adiciona `{start, end}` à `removeList` existente, que aplica via `/refine` (`stage_refine`) com o diálogo `ConfirmarDescarte` — nenhum caminho de aplicação/invalidação novo.

**Tech Stack:** Python 3 / FastAPI / ffmpeg `silencedetect` (backend, pytest); React + TypeScript / Vite (front, vitest + Testing Library).

---

## Decisões travadas (do brainstorm)

- Indicação = **clique único** cujo `currentTime` é o **centro** da janela; o "Marcar início/fim" manual continua ao lado.
- Janela **fixa ±1s** (clampada às bordas).
- Fronteira = **meio da micro-pausa imediatamente antes** e **imediatamente depois** do centro; sem pausa de um lado → **default pequeno + nudge**.
- Backend **analyze-only** (`/detect-local`), síncrono (2s de áudio é sub-segundo).
- **Preview de 2 frames + nudge** (◀/▶, `,`/`.`) antes de aplicar.
- Aplicação reusa `removeList` → `/refine`.
- Threshold local: `noise_db` = o `silence_threshold_db` do job; `min_silence` local pequeno e fixo (`0.08s`) para pegar micro-pausas que o corte global ignora.

## Estrutura de arquivos

**Backend**
- `pipeline/silence.py` — `fronteira_local` (pura) + `detect_silences_janela`. (modificar)
- `api/models.py` — `DetectLocalParams`, `DetectLocalResult`. (modificar)
- `api/routes.py` — rota `POST /jobs/{slug}/detect-local`. (modificar)
- `tests/test_silence.py` — testes de `fronteira_local`/`detect_silences_janela`. (modificar/criar)
- `api/tests/test_detect_local_route.py` — testes da rota. (criar)

**Front**
- `web/src/api.ts` — cliente `detectLocal`. (modificar)
- `web/src/components/EmendaPreview.tsx` — preview de 2 frames + nudge. (criar)
- `web/src/steps/CutsStep.tsx` — botão "Remover trecho aqui" + fluxo do preview. (modificar)
- `web/src/__tests__/EmendaPreview.test.tsx` — cobertura do preview. (criar)
- `web/src/__tests__/CutsStep.test.tsx` — cobertura do fluxo local (e `detectLocal` no mock de `../api`). (modificar)

---

## Task 1: `fronteira_local` — escolha da fronteira (função pura)

**Files:**
- Modify: `pipeline/silence.py`
- Test: `tests/test_silence.py` (criar se não existir)

- [ ] **Step 1: Escrever os testes da fronteira**

Criar/append em `tests/test_silence.py`:

```python
from pipeline.silence import fronteira_local


def test_fronteira_pega_o_meio_das_pausas_que_bracketam_o_clique():
    # pausas (start,end) absolutas dentro da janela [21,23]; clique em 22 (no ruído)
    silencios = [(21.1, 21.5), (22.4, 22.8)]
    r = fronteira_local(silencios, center=22.0, w0=21.0, w1=23.0)
    assert r["start"] == 21.3            # meio de (21.1,21.5)
    assert r["end"] == 22.6              # meio de (22.4,22.8)
    assert r["limpo_inicio"] is True and r["limpo_fim"] is True


def test_fronteira_clique_dentro_de_pausa_expande_para_vizinhas():
    # clique em 22.0 cai DENTRO de (21.8,22.2); expande para as pausas vizinhas
    silencios = [(21.0, 21.2), (21.8, 22.2), (22.7, 22.9)]
    r = fronteira_local(silencios, center=22.0, w0=21.0, w1=23.0)
    assert r["start"] == 21.1            # meio da pausa à esquerda da que contém
    assert r["end"] == 22.8             # meio da pausa à direita da que contém


def test_fronteira_sem_pausa_de_um_lado_usa_default_e_marca_nao_limpo():
    silencios = [(21.1, 21.5)]          # só à esquerda
    r = fronteira_local(silencios, center=22.0, w0=21.0, w1=23.0, default_raio=0.15)
    assert r["start"] == 21.3
    assert r["end"] == 22.15            # center + default_raio
    assert r["limpo_inicio"] is True and r["limpo_fim"] is False


def test_fronteira_sem_pausa_nenhuma_cai_no_default_dos_dois_lados():
    r = fronteira_local([], center=22.0, w0=21.0, w1=23.0, default_raio=0.15)
    assert r["start"] == 21.85 and r["end"] == 22.15
    assert r["limpo_inicio"] is False and r["limpo_fim"] is False


def test_fronteira_default_clampa_nas_bordas_da_janela():
    r = fronteira_local([], center=21.05, w0=21.0, w1=23.0, default_raio=0.15)
    assert r["start"] == 21.0           # max(w0, center-default_raio)
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pytest tests/test_silence.py -q`
Expected: FAIL com `ImportError: cannot import name 'fronteira_local'`.

- [ ] **Step 3: Implementar `fronteira_local`**

Em `pipeline/silence.py`, adicionar (após `compute_kept_segments`):

```python
def fronteira_local(silences, center, w0, w1, default_raio: float = 0.15) -> dict:
    """Fronteira de corte em torno de `center`, dado os silêncios (absolutos,
    ordenados) detectados na janela [w0, w1].

    Corta no MEIO da micro-pausa imediatamente à esquerda e imediatamente à
    direita do instante apontado — o ponto mais silencioso de cada lado. Se o
    clique cai dentro de uma pausa, os "à esquerda/à direita" já são as pausas
    vizinhas (a que contém o clique não é totalmente de um lado só), então o
    mesmo cálculo expande para elas. Sem pausa de um lado (fala contínua), a
    borda vira `center ± default_raio` (clampada à janela) e `limpo_*` fica
    False para o front oferecer o nudge frame-a-frame.
    """
    esquerda = [s for s in silences if s[1] < center]
    direita = [s for s in silences if s[0] > center]
    s_esq = esquerda[-1] if esquerda else None
    s_dir = direita[0] if direita else None
    start = (s_esq[0] + s_esq[1]) / 2 if s_esq else max(w0, center - default_raio)
    end = (s_dir[0] + s_dir[1]) / 2 if s_dir else min(w1, center + default_raio)
    return {
        "start": round(start, 3),
        "end": round(end, 3),
        "limpo_inicio": s_esq is not None,
        "limpo_fim": s_dir is not None,
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pytest tests/test_silence.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/silence.py tests/test_silence.py
git commit -m "feat(silence): fronteira_local escolhe o corte pelas micro-pausas que bracketam o clique"
```

---

## Task 2: `detect_silences_janela` — silencedetect só na janela

**Files:**
- Modify: `pipeline/silence.py`
- Test: `tests/test_silence.py`

- [ ] **Step 1: Escrever o teste (offset absoluto + parâmetros do ffmpeg)**

Append em `tests/test_silence.py`:

```python
def test_detect_janela_desloca_timestamps_para_o_absoluto(monkeypatch):
    from pipeline import silence

    class _R:
        # silencedetect reporta relativo ao slice (-ss antes de -i zera o PTS)
        stderr = ("[silencedetect] silence_start: 0.100\n"
                  "[silencedetect] silence_end: 0.500 | silence_duration: 0.4\n")

    capturado = {}
    def fake_run(cmd, capture_output, text):
        capturado["cmd"] = cmd
        return _R()
    monkeypatch.setattr(silence.subprocess, "run", fake_run)

    out = silence.detect_silences_janela("trimmed.mp4", center=22.0, raio=1.0,
                                         noise_db=-30.0, min_silence=0.08)
    # janela começa em 21.0 → 0.1/0.5 viram 21.1/21.5
    assert out == [(21.1, 21.5)]
    # a fatia foi pedida com -ss/-t e o filtro certo
    cmd = capturado["cmd"]
    assert "-ss" in cmd and "21.000" in cmd
    assert "-t" in cmd and "2.000" in cmd
    assert any("silencedetect=noise=-30.0dB:d=0.08" in a for a in cmd)


def test_detect_janela_clampa_o_inicio_em_zero(monkeypatch):
    from pipeline import silence
    class _R: stderr = ""
    cap = {}
    monkeypatch.setattr(silence.subprocess, "run",
                        lambda cmd, capture_output, text: (cap.setdefault("cmd", cmd), _R())[1])
    silence.detect_silences_janela("t.mp4", center=0.3, raio=1.0)
    assert "0.000" in cap["cmd"]        # -ss não fica negativo
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pytest tests/test_silence.py -q -k detect_janela`
Expected: FAIL com `AttributeError: module 'pipeline.silence' has no attribute 'detect_silences_janela'`.

- [ ] **Step 3: Implementar `detect_silences_janela`**

Em `pipeline/silence.py`, adicionar (após `detect_silences`):

```python
def detect_silences_janela(path: str, center: float, raio: float = 1.0,
                           noise_db: float = -30.0, min_silence: float = 0.08):
    """silencedetect só na janela [center-raio, center+raio] de `path`.

    Usa -ss/-t ANTES de -i: o ffmpeg reseta o PTS da fatia, então os
    silence_start/end vêm relativos ao início da janela — somamos `inicio` para
    voltar ao tempo absoluto do trimmed. min_silence pequeno de propósito: pega
    micro-pausas que o corte global (min_silence dos sliders) ignora."""
    inicio = max(0.0, center - raio)
    dur = 2 * raio
    result = subprocess.run(
        ["ffmpeg", "-ss", f"{inicio:.3f}", "-t", f"{dur:.3f}", "-i", path,
         "-vn", "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return [(s + inicio, e + inicio) for s, e in parse_silences(result.stderr)]
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pytest tests/test_silence.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/silence.py tests/test_silence.py
git commit -m "feat(silence): detect_silences_janela roda silencedetect numa fatia e volta ao absoluto"
```

---

## Task 3: Rota `POST /jobs/{slug}/detect-local`

**Files:**
- Modify: `api/models.py`
- Modify: `api/routes.py`
- Test: `api/tests/test_detect_local_route.py` (criar)

- [ ] **Step 1: Escrever os testes da rota**

Criar `api/tests/test_detect_local_route.py`:

```python
"""Rota analyze-only: propõe a fronteira, não corta. Reusa fixtures client/tmp_root."""
from pipeline.job import write_json


def _projeto_cortado(tmp_root, slug="v1"):
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True)
    write_json(d / "job.config.json", {"silence_threshold_db": -28.0})
    (d / "trimmed.mp4").write_bytes(b"trimmed")
    write_json(d / "trimmed.probe.json",
               {"width": 1920, "height": 1080, "fps": 30.0, "duration": 40.0, "nb_frames": 1200})
    return d


def test_detect_local_devolve_fronteira(client, tmp_root, monkeypatch):
    _projeto_cortado(tmp_root)
    from api import routes
    # a janela devolve duas micro-pausas que bracketam o clique
    monkeypatch.setattr(routes, "detect_silences_janela",
                        lambda path, center, raio, noise_db, min_silence: [(21.1, 21.5), (22.4, 22.8)])
    r = client.post("/api/jobs/v1/detect-local", json={"center": 22.0})
    assert r.status_code == 200
    body = r.json()
    assert body == {"start": 21.3, "end": 22.6, "limpo_inicio": True, "limpo_fim": True}


def test_detect_local_usa_o_noise_do_job_e_clampa_o_centro(client, tmp_root, monkeypatch):
    _projeto_cortado(tmp_root)
    from api import routes
    capturado = {}
    def fake(path, center, raio, noise_db, min_silence):
        capturado.update(center=center, noise_db=noise_db)
        return []
    monkeypatch.setattr(routes, "detect_silences_janela", fake)
    # center além do fim (40s) é clampado; noise vem do config (-28.0)
    r = client.post("/api/jobs/v1/detect-local", json={"center": 999.0})
    assert r.status_code == 200
    assert capturado["center"] == 40.0
    assert capturado["noise_db"] == -28.0


def test_detect_local_sem_trimmed_e_409(client, tmp_root):
    d = tmp_root / "jobs" / "v2"
    d.mkdir(parents=True)
    write_json(d / "job.config.json", {})
    r = client.post("/api/jobs/v2/detect-local", json={"center": 1.0})
    assert r.status_code == 409


def test_detect_local_slug_inexistente_e_404(client, tmp_root):
    assert client.post("/api/jobs/nunca/detect-local", json={"center": 1.0}).status_code == 404
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pytest api/tests/test_detect_local_route.py -q`
Expected: FAIL (rota inexistente → 404/405 em todos).

- [ ] **Step 3: Adicionar os models**

Em `api/models.py`, adicionar (perto de `RefineParams`):

```python
class DetectLocalParams(BaseModel):
    center: float


class DetectLocalResult(BaseModel):
    start: float
    end: float
    limpo_inicio: bool
    limpo_fim: bool
```

- [ ] **Step 4: Adicionar imports e a rota**

Em `api/routes.py`, ampliar o import de `pipeline.silence`:

```python
from pipeline.silence import Segment, detect_silences_janela, fronteira_local
```

E o import de models:

```python
from api.models import (
    CaptionStyleParams, CutParams, CutResult,
    DetectLocalParams, DetectLocalResult,
    Hook, JobSummary, OrientationParams, OverlayParams, RefineParams,
    SuggestDefaults, Suggestion, TitleParams, TranscribeParams,
)
```

Adicionar a rota (perto de `run_refine`):

```python
@router.post("/jobs/{slug}/detect-local")
def run_detect_local(slug: str, params: DetectLocalParams) -> DetectLocalResult:
    """Analyze-only: re-detecta silêncios numa janela de ±1s em torno do ponto
    apontado e propõe a fronteira de corte, SEM cortar. O front pré-visualiza e
    aplica pelo /refine. Síncrono — 2s de áudio é sub-segundo."""
    jobs_root, *_ = _roots()
    job_dir = _dir_do_job(slug, jobs_root)
    trimmed = job_dir / "trimmed.mp4"
    tp = job_dir / "trimmed.probe.json"
    if not trimmed.exists() or not tp.exists():
        raise HTTPException(status_code=409, detail="sem vídeo cortado para analisar")
    dur = load_json(tp)["duration"]
    cfg_path = job_dir / "job.config.json"
    cfg = load_json(cfg_path) if cfg_path.exists() else {}
    noise = cfg.get("silence_threshold_db", -30.0)
    center = max(0.0, min(params.center, dur))
    silencios = detect_silences_janela(str(trimmed), center, raio=1.0,
                                       noise_db=noise, min_silence=0.08)
    w0, w1 = max(0.0, center - 1.0), min(dur, center + 1.0)
    return DetectLocalResult(**fronteira_local(silencios, center, w0, w1))
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pytest api/tests/test_detect_local_route.py -q`
Expected: PASS.

- [ ] **Step 6: Rodar toda a suíte backend**

Run: `pytest -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/models.py api/routes.py api/tests/test_detect_local_route.py
git commit -m "feat(api): rota POST /detect-local propõe a fronteira do corte por silêncio local"
```

---

## Task 4: Cliente `detectLocal` no front

**Files:**
- Modify: `web/src/api.ts`
- Test: `web/src/__tests__/api.test.ts`

- [ ] **Step 1: Escrever o teste do cliente**

Adicionar em `web/src/__tests__/api.test.ts`:

```typescript
import { detectLocal } from "../api";

it("detectLocal posta o center e devolve a fronteira", async () => {
  const chamadas: any[] = [];
  vi.stubGlobal("fetch", (url: string, opts: any) => {
    chamadas.push({ url, opts });
    return Promise.resolve(new Response(
      JSON.stringify({ start: 21.3, end: 22.6, limpo_inicio: true, limpo_fim: false }),
      { status: 200, headers: { "Content-Type": "application/json" } }));
  });

  const r = await detectLocal("v1", 22.0);
  expect(chamadas[0].url).toBe("/api/jobs/v1/detect-local");
  expect(JSON.parse(chamadas[0].opts.body)).toEqual({ center: 22.0 });
  expect(r).toEqual({ start: 21.3, end: 22.6, limpo_inicio: true, limpo_fim: false });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/api.test.ts -t detectLocal`
Expected: FAIL com `detectLocal is not exported`.

- [ ] **Step 3: Adicionar o tipo e o cliente**

Em `web/src/api.ts`, adicionar o tipo e a função (perto de `getCuts`):

```typescript
export type Emenda = {
  start: number;
  end: number;
  limpo_inicio: boolean;
  limpo_fim: boolean;
};

// Analyze-only: manda o instante apontado e recebe a fronteira proposta do
// corte por silêncio local. Não corta — a aplicação vai pelo /refine.
export async function detectLocal(slug: string, center: number): Promise<Emenda> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/detect-local`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ center }),
  }));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/api.test.ts -t detectLocal`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/api.ts web/src/__tests__/api.test.ts
git commit -m "feat(web): cliente detectLocal para o corte por silêncio local"
```

---

## Task 5: Componente `EmendaPreview` (2 frames + nudge)

**Files:**
- Create: `web/src/components/EmendaPreview.tsx`
- Test: `web/src/__tests__/EmendaPreview.test.tsx`

- [ ] **Step 1: Escrever os testes do preview**

Criar `web/src/__tests__/EmendaPreview.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { EmendaPreview } from "../components/EmendaPreview";

const base = {
  slug: "v1", version: 1, fps: 30,
  start: 21.9, end: 22.1, limpoInicio: true, limpoFim: true,
  onChange: () => {}, onAplicar: () => {}, onCancelar: () => {},
};

describe("EmendaPreview", () => {
  it("mostra os tempos dos dois quadros da emenda", () => {
    render(<EmendaPreview {...base} />);
    // último frame que fica = start - 1/fps ≈ 21.867; primeiro que fica = end = 22.100
    expect(screen.getByText(/antes: 21\.87/)).toBeInTheDocument();
    expect(screen.getByText(/depois: 22\.10/)).toBeInTheDocument();
  });

  it("o nudge ◀/▶ do início soma/subtrai 1 frame e chama onChange", () => {
    const onChange = vi.fn();
    render(<EmendaPreview {...base} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /recuar início/ }));
    // -1 frame = -1/30 ≈ 0.0333
    expect(onChange).toHaveBeenCalledWith(21.867, 22.1);
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /avançar início/ }));
    expect(onChange).toHaveBeenCalledWith(21.933, 22.1);
  });

  it("avisa quando a fronteira não é limpa de um lado", () => {
    render(<EmendaPreview {...base} limpoFim={false} />);
    expect(screen.getByText(/ajuste no frame/i)).toBeInTheDocument();
  });

  it("Aplicar e Cancelar disparam os callbacks", () => {
    const onAplicar = vi.fn(); const onCancelar = vi.fn();
    render(<EmendaPreview {...base} onAplicar={onAplicar} onCancelar={onCancelar} />);
    fireEvent.click(screen.getByRole("button", { name: /aplicar corte/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onAplicar).toHaveBeenCalled();
    expect(onCancelar).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/EmendaPreview.test.tsx`
Expected: FAIL (componente inexistente).

- [ ] **Step 3: Implementar `EmendaPreview`**

Criar `web/src/components/EmendaPreview.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { mediaUrl } from "../api";

type Props = {
  slug: string;
  version: number;      // ?v= do trimmed, para não reusar cache antigo
  fps: number;
  start: number;        // início do trecho a remover
  end: number;          // fim do trecho a remover
  limpoInicio: boolean; // false = não achou pausa limpa deste lado
  limpoFim: boolean;
  onChange: (start: number, end: number) => void;
  onAplicar: () => void;
  onCancelar: () => void;
};

// Busca um <video> no tempo exato (frame estático). requestVideoFrameCallback,
// quando existe, garante que o frame foi pintado antes de considerar pronto;
// em navegadores sem rVFC o seek simples já basta para 1080p/H.264.
function useFrameAt(time: number): React.RefObject<HTMLVideoElement> {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const seek = () => { try { v.currentTime = Math.max(0, time); } catch { /* metadata ainda não */ } };
    if (v.readyState >= 1) seek();
    else v.addEventListener("loadedmetadata", seek, { once: true });
  }, [time]);
  return ref;
}

export const EmendaPreview: React.FC<Props> = ({
  slug, version, fps, start, end, limpoInicio, limpoFim, onChange, onAplicar, onCancelar,
}) => {
  const passo = 1 / fps;
  // último frame que FICA antes do corte, e primeiro que FICA depois
  const tAntes = Math.max(0, start - passo);
  const tDepois = end;
  const refAntes = useFrameAt(tAntes);
  const refDepois = useFrameAt(tDepois);
  const src = `${mediaUrl(slug, "trimmed.mp4")}?v=${version}`;

  const nudge = (qualBorda: "start" | "end", frames: number) => {
    const d = frames * passo;
    if (qualBorda === "start") onChange(Number((start + d).toFixed(3)), end);
    else onChange(start, Number((end + d).toFixed(3)));
  };

  // teclas , / . ajustam o FIM do trecho (a borda mais comum de acertar)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ",") nudge("end", -1);
      else if (e.key === ".") nudge("end", +1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div role="group" aria-label="preview da emenda"
         className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm space-y-3">
      <p className="text-amber-200">
        Confira a emenda: o corte remove de <strong>{start.toFixed(2)}s</strong> a{" "}
        <strong>{end.toFixed(2)}s</strong>. Use ◀/▶ (ou as teclas <kbd>,</kbd>/<kbd>.</kbd>)
        para ajustar frame a frame.
      </p>
      {(!limpoInicio || !limpoFim) && (
        <p className="text-amber-300">
          Não achei uma pausa limpa de um dos lados — <strong>ajuste no frame</strong> se a emenda ficou torta.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <video ref={refAntes} src={src} muted preload="auto"
                 className="w-full rounded border border-zinc-800 bg-black" />
          <div className="flex items-center gap-1">
            <button aria-label="recuar início" onClick={() => nudge("start", -1)} className="px-2 bg-zinc-800 rounded">◀</button>
            <span className="text-xs text-zinc-400 flex-1 text-center">antes: {tAntes.toFixed(2)}s</span>
            <button aria-label="avançar início" onClick={() => nudge("start", +1)} className="px-2 bg-zinc-800 rounded">▶</button>
          </div>
        </div>
        <div className="space-y-1">
          <video ref={refDepois} src={src} muted preload="auto"
                 className="w-full rounded border border-zinc-800 bg-black" />
          <div className="flex items-center gap-1">
            <button aria-label="recuar fim" onClick={() => nudge("end", -1)} className="px-2 bg-zinc-800 rounded">◀</button>
            <span className="text-xs text-zinc-400 flex-1 text-center">depois: {tDepois.toFixed(2)}s</span>
            <button aria-label="avançar fim" onClick={() => nudge("end", +1)} className="px-2 bg-zinc-800 rounded">▶</button>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onAplicar} className="px-3 py-1 bg-emerald-600 rounded font-medium">Aplicar corte</button>
        <button onClick={onCancelar} className="px-3 py-1 bg-zinc-800 rounded">Cancelar</button>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/EmendaPreview.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/EmendaPreview.tsx web/src/__tests__/EmendaPreview.test.tsx
git commit -m "feat(web): EmendaPreview mostra os 2 quadros do corte com nudge frame-a-frame"
```

---

## Task 6: Integrar no `CutsStep` ("Remover trecho aqui")

**Files:**
- Modify: `web/src/steps/CutsStep.tsx`
- Modify: `web/src/__tests__/CutsStep.test.tsx`

- [ ] **Step 1: Escrever o teste do fluxo local**

Em `web/src/__tests__/CutsStep.test.tsx`, primeiro **adicionar `detectLocal` ao mock de `../api`** (o `vi.mock` é exaustivo). No bloco `vi.hoisted`, acrescentar um mock e incluí-lo no objeto do `vi.mock`:

```typescript
const { streamSSE, getCuts, getJob, detectLocal } = vi.hoisted(() => ({
  // ...streamSSE, getCuts, getJob como já estão...
  detectLocal: vi.fn(async () => ({ start: 21.9, end: 22.1, limpo_inicio: true, limpo_fim: true })),
}));
vi.mock("../api", () => ({
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  streamSSE, getCuts, getJob, detectLocal,
}));
```

Depois, adicionar o teste (o botão "Remover trecho aqui" vive na seção de cortes manuais, que só aparece com um corte carregado — reusar o padrão de `getCuts` com resultado):

```typescript
it("'Remover trecho aqui' propõe a emenda e ao aplicar entra na lista de remoção", async () => {
  getCuts.mockResolvedValue({
    original_duration: 40, trimmed_duration: 40,
    segments: [{ start: 0, end: 40 }], trimmed_mtime: 5,
  });
  getJob.mockResolvedValue({
    config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
    has_source: true, has_transcript: true, probe: { fps: 30, duration: 40 },
  });
  render(<CutsStep {...props} />);

  const btn = await screen.findByRole("button", { name: /Remover trecho aqui/ });
  // o player está em currentTime 0 no jsdom; detectLocal é chamado com esse center
  fireEvent.click(btn);
  await waitFor(() => expect(detectLocal).toHaveBeenCalledWith("v1", expect.any(Number)));

  // preview aparece; aplicar adiciona {21.9,22.1} à lista de remoção
  fireEvent.click(await screen.findByRole("button", { name: /aplicar corte/i }));
  expect(await screen.findByText(/21\.9\s*[–-]\s*22\.1|21:.*22:/)).toBeInTheDocument();
  // o botão de aplicar os cortes manuais agora conta 1
  expect(screen.getByRole("button", { name: /Aplicar cortes \(1\)/ })).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/CutsStep.test.tsx -t "Remover trecho aqui"`
Expected: FAIL (botão inexistente).

- [ ] **Step 3: Estado, fps e handler de detecção**

Em `web/src/steps/CutsStep.tsx`, importar o cliente, o tipo e o componente:

```typescript
import { streamSSE, mediaUrl, getCuts, getJob, detectLocal } from "../api";
import type { Emenda } from "../api";
import { EmendaPreview } from "../components/EmendaPreview";
```

Adicionar estado (perto dos outros `useState`, após `trimmedVersion`):

```typescript
  const [fps, setFps] = useState(30);
  // emenda proposta pela detecção local, em pré-visualização; null = sem proposta
  const [emenda, setEmenda] = useState<Emenda | null>(null);
  const [detectando, setDetectando] = useState(false);
```

No `getJob(slug).then((j) => {...})`, capturar o fps:

```typescript
      if (j?.probe?.fps) setFps(j.probe.fps);
```

Adicionar os handlers (perto de `onMarkStart`/`onMarkEnd`):

```typescript
  const detectarLocal = async () => {
    setErr(null); setDetectando(true);
    try {
      setEmenda(await detectLocal(slug, curTime()));
    } catch (e: any) { setErr(e.message); }
    finally { setDetectando(false); }
  };

  const aplicarEmenda = () => {
    if (!emenda) return;
    const { start, end } = emenda;
    if (end > start) {
      setRemoveList((l) => [...l, { start, end }].sort((a, b) => a.start - b.start));
    }
    setEmenda(null);
  };
```

- [ ] **Step 4: Renderizar o botão e o preview na seção de cortes manuais**

Em `web/src/steps/CutsStep.tsx`, dentro do bloco de "Cortes manuais" (após o parágrafo de instrução dos cortes manuais, antes/junto dos botões "Marcar início/fim"), adicionar:

```tsx
            <div className="flex gap-2 items-center flex-wrap">
              <button onClick={detectarLocal} disabled={detectando || refining || busy}
                className="px-3 py-1 bg-sky-700 rounded disabled:opacity-40">
                {detectando ? "Analisando..." : "Remover trecho aqui"}
              </button>
              <span className="text-xs text-zinc-500">
                Pause perto do trecho ruim e clique — acho as bordas exatas em volta.
              </span>
            </div>
            {emenda && (
              <EmendaPreview
                slug={slug} version={trimmedVersion} fps={fps}
                start={emenda.start} end={emenda.end}
                limpoInicio={emenda.limpo_inicio} limpoFim={emenda.limpo_fim}
                onChange={(start, end) => setEmenda((e) => (e ? { ...e, start, end } : e))}
                onAplicar={aplicarEmenda}
                onCancelar={() => setEmenda(null)}
              />
            )}
```

Nota: colocar esse bloco logo após `<p className="text-zinc-400 text-xs">Dê play no vídeo, marque o início e o fim dos trechos a remover.</p>` (dentro de `<div className="border-t border-zinc-800 pt-3 mt-3 space-y-2">`), para conviver com o "Marcar início/fim" existente sem substituí-lo.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/CutsStep.test.tsx`
Expected: PASS (o teste novo e os existentes).

- [ ] **Step 6: Commit**

```bash
git add web/src/steps/CutsStep.tsx web/src/__tests__/CutsStep.test.tsx
git commit -m "feat(web): passo Cortes ganha 'Remover trecho aqui' com preview da emenda"
```

---

## Task 7: Verificação de ponta a ponta

**Files:** nenhum (só execução)

- [ ] **Step 1: Suíte backend completa**

Run: `pytest -q`
Expected: PASS.

- [ ] **Step 2: Suíte front completa**

Run: `cd web && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Lint + type-check**

Run: `ruff check api pipeline tests` e `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Smoke manual (recomendado)**

Subir a API + front, abrir um projeto já cortado, ir ao passo Cortes, dar play e pausar perto de um respiro/"é-ãã", clicar "Remover trecho aqui": conferir que o preview mostra os dois quadros, que o nudge ◀/▶ e as teclas `,`/`.` mexem a borda, que "Aplicar corte" adiciona o trecho à lista, e que "Aplicar cortes (N)" encurta o vídeo com o diálogo de descarte. Testar também um ponto de fala contínua (fallback: aviso "ajuste no frame").

---

## Self-review (cobertura do spec)

- **Indicação = clique único (centro):** Task 6 (`detectarLocal(curTime())`). ✓
- **Janela fixa ±1s:** Task 3 (rota `raio=1.0`, `w0/w1`). ✓
- **Fronteira pelas micro-pausas que bracketam:** Task 1 (`fronteira_local`) + Task 2 (`min_silence=0.08`). ✓
- **Fallback default + nudge + aviso:** Task 1 (`limpo_*` + default_raio) + Task 5 (nudge + aviso). ✓
- **Backend analyze-only:** Task 3 (rota síncrona, sem cortar). ✓
- **Preview de 2 frames + nudge (◀/▶, `,`/`.`):** Task 5 (`EmendaPreview`). ✓
- **Aplicação reusa removeList → /refine + ConfirmarDescarte:** Task 6 (`aplicarEmenda` empurra na `removeList`). ✓
- **Vale para qualquer projeto (sobre o trimmed):** rota e UI operam no `trimmed.mp4`, sem depender de papel. ✓
- **Fora de escopo (detecção autônoma):** não abordado. ✓
```
