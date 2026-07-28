# Formato Único por Job — Fidelidade Preview↔Render

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada job passa a ter uma orientação única (`16x9` ou `9x16`), detectada do probe e trocável pelo usuário, de modo que o preview do editor use exatamente a mesma régua de pixels do render final.

**Architecture:** Hoje `previewScale = clientWidth / 1920` é fixo, mas a composição `Recorded9x16` tem canvas de 1080px de largura — como `fontSize`/`bottom` são pixels absolutos na recipe, tudo sai `1920/1080 = 1,778×` maior no render vertical. A correção é eliminar a ambiguidade na origem: o job guarda `orientation` em `job.config.json`, o preview escala por `clientWidth / frameWidth(orientation)`, e o render produz um único formato. Nenhum dado precisa migrar — `orientation: ""` significa "auto" e é resolvida a partir do probe em tempo de leitura.

**Tech Stack:** Python 3 / FastAPI / pytest no backend; React + TypeScript + Vite + Vitest + Testing Library no front; Remotion (React) no render.

## Global Constraints

- **Tamanhos de frame canônicos:** `16x9 = 1920×1080`, `9x16 = 1080×1920`. Estes números aparecem em `pipeline/orientation.py` e `web/src/frame.ts` e **em nenhum outro lugar** ao final do plano.
- **Detecção automática:** `width >= height` → `"16x9"`, senão `"9x16"`. Vídeo quadrado conta como `16x9`.
- **Compatibilidade sem migração:** `job.config.json` de jobs antigos não tem a chave `orientation`. O default `""` significa auto-detectar. Nenhum arquivo em `jobs/` pode ser editado à mão.
- **Fallback:** sem probe válido (ausente, ou `width`/`height` zerado/negativo), a orientação efetiva é `"16x9"`.
- **Idioma:** comentários de código, textos de UI e mensagens de erro em português, seguindo o padrão do repositório. Nomes de identificadores em inglês.
- **Um formato por render:** `POST /jobs/{slug}/render` produz exatamente um arquivo, nomeado `{slug}-16x9.mp4` ou `{slug}-9x16.mp4`.
- **Paridade preview↔render:** qualquer valor em px da recipe renderizado no preview deve ser multiplicado por `previewScale`. Isso inclui `fontSize`, `bottom`, `translateY` e o `marginRight: 12` entre palavras da legenda.

## Contexto: trabalho não commitado a resolver primeiro

O branch `fix/windows-subprocess-path` tem alterações não commitadas que introduzem `captionRefHeight()` em `web/src/overlayGeom.ts` (+ testes em `web/src/__tests__/overlayGeom.test.ts`, + uso em `HookStep.tsx` e `OverlaysStep.tsx`).

Essa função calcula a altura do canvas virtual como `1920 * h / w` — ela é uma **compensação para o bug que este plano elimina na raiz**. A Task 7 a remove. Antes de começar:

```bash
git add -A && git commit -m "wip: captionRefHeight (substituída pela Task 7)"
git checkout -b fix/formato-unico-por-job
```

Commitar preserva o histórico e deixa o diff da Task 7 legível como "substituição", não como "perda de trabalho".

---

### Task 1: Módulo de orientação (Python)

Fonte única de verdade para orientação e tamanho de frame no backend. Puro, sem I/O — fácil de testar e de reusar.

**Files:**
- Create: `pipeline/orientation.py`
- Test: `tests/test_orientation.py`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `FRAME_SIZES: dict[str, tuple[int, int]]` — `{"16x9": (1920, 1080), "9x16": (1080, 1920)}`
  - `FORMAT_KEYS: dict[str, str]` — `{"16x9": "main16x9", "9x16": "vertical9x16"}`
  - `orientation_from_probe(width: int, height: int) -> str`
  - `resolve_orientation(configured: str, probe: dict | None) -> str`
  - `frame_size(orientation: str) -> tuple[int, int]`

- [ ] **Step 1: Write the failing test**

Create `tests/test_orientation.py`:

```python
import pytest

from pipeline.orientation import (
    FORMAT_KEYS,
    FRAME_SIZES,
    frame_size,
    orientation_from_probe,
    resolve_orientation,
)


class TestOrientationFromProbe:
    def test_landscape_e_16x9(self):
        assert orientation_from_probe(1920, 1080) == "16x9"
        assert orientation_from_probe(1280, 720) == "16x9"

    def test_portrait_e_9x16(self):
        assert orientation_from_probe(1080, 1920) == "9x16"
        assert orientation_from_probe(2160, 3840) == "9x16"

    def test_quadrado_conta_como_16x9(self):
        assert orientation_from_probe(1000, 1000) == "16x9"


class TestResolveOrientation:
    def test_valor_configurado_vence_o_probe(self):
        probe = {"width": 2160, "height": 3840}  # vertical
        assert resolve_orientation("16x9", probe) == "16x9"

    def test_string_vazia_significa_auto(self):
        assert resolve_orientation("", {"width": 2160, "height": 3840}) == "9x16"
        assert resolve_orientation("", {"width": 1280, "height": 720}) == "16x9"

    def test_valor_invalido_cai_no_auto(self):
        assert resolve_orientation("banana", {"width": 2160, "height": 3840}) == "9x16"

    def test_sem_probe_cai_no_16x9(self):
        assert resolve_orientation("", None) == "16x9"
        assert resolve_orientation("", {}) == "16x9"

    def test_probe_com_dimensao_invalida_cai_no_16x9(self):
        assert resolve_orientation("", {"width": 0, "height": 1080}) == "16x9"
        assert resolve_orientation("", {"width": 1920, "height": -1}) == "16x9"


class TestFrameSize:
    def test_tamanhos_canonicos(self):
        assert frame_size("16x9") == (1920, 1080)
        assert frame_size("9x16") == (1080, 1920)

    def test_orientacao_desconhecida_cai_no_16x9(self):
        assert frame_size("banana") == (1920, 1080)

    def test_frame_sizes_tem_exatamente_as_duas_chaves(self):
        assert set(FRAME_SIZES) == {"16x9", "9x16"}


class TestFormatKeys:
    def test_mapeia_orientacao_para_a_chave_logica(self):
        assert FORMAT_KEYS["16x9"] == "main16x9"
        assert FORMAT_KEYS["9x16"] == "vertical9x16"

    def test_cobre_as_mesmas_orientacoes_que_frame_sizes(self):
        assert set(FORMAT_KEYS) == set(FRAME_SIZES)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_orientation.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'pipeline.orientation'`

- [ ] **Step 3: Write minimal implementation**

Create `pipeline/orientation.py`:

```python
"""Orientação do job e tamanhos de frame.

Fonte única de verdade: 1920/1080 e 1080/1920 aparecem aqui e no espelho
web (web/src/frame.ts), em nenhum outro lugar. O preview e o render usam a
mesma largura de canvas, que é o que mantém os dois fiéis entre si.
"""

# largura, altura de cada orientação de saída
FRAME_SIZES: dict[str, tuple[int, int]] = {
    "16x9": (1920, 1080),
    "9x16": (1080, 1920),
}

# nome da chave em recipe["formats"] e nos eventos SSE de progresso
FORMAT_KEYS: dict[str, str] = {
    "16x9": "main16x9",
    "9x16": "vertical9x16",
}

DEFAULT_ORIENTATION = "16x9"


def orientation_from_probe(width: int, height: int) -> str:
    """Orientação implícita nas dimensões do vídeo-fonte. Quadrado conta como 16x9."""
    return "16x9" if width >= height else "9x16"


def resolve_orientation(configured: str, probe: dict | None) -> str:
    """Orientação efetiva do job.

    Um valor válido em *configured* (escolha explícita do usuário) sempre vence.
    Vazio ou inválido significa "auto": deriva do probe. Sem probe utilizável,
    cai no padrão 16x9.
    """
    if configured in FRAME_SIZES:
        return configured
    if probe:
        w = probe.get("width") or 0
        h = probe.get("height") or 0
        if w > 0 and h > 0:
            return orientation_from_probe(w, h)
    return DEFAULT_ORIENTATION


def frame_size(orientation: str) -> tuple[int, int]:
    """(largura, altura) do canvas de render para a orientação."""
    return FRAME_SIZES.get(orientation, FRAME_SIZES[DEFAULT_ORIENTATION])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_orientation.py -v`
Expected: PASS (16 testes)

- [ ] **Step 5: Commit**

```bash
git add pipeline/orientation.py tests/test_orientation.py
git commit -m "feat(orientation): módulo de orientação e tamanhos de frame"
```

---

### Task 2: Persistir a orientação no job

`JobConfig` ganha o campo, `get_state` expõe a orientação **efetiva** (já resolvida), e uma função de update grava a escolha do usuário.

**Files:**
- Modify: `pipeline/job.py:7-22` (dataclass `JobConfig`)
- Modify: `api/jobs.py:14-45` (`get_state`), e adicionar `update_orientation`
- Modify: `api/models.py:130-141` (`JobState`)
- Test: `tests/test_orientation_job.py` (novo)

**Interfaces:**
- Consumes: `resolve_orientation`, `FRAME_SIZES` de `pipeline/orientation.py` (Task 1).
- Produces:
  - `JobConfig.orientation: str = ""` — `""` = auto
  - `JobState.orientation: str` — sempre `"16x9"` ou `"9x16"`, nunca vazio
  - `update_orientation(slug: str, jobs_root: Path, orientation: str) -> None`

- [ ] **Step 1: Write the failing test**

Create `tests/test_orientation_job.py`:

```python
import json

import pytest

from api.jobs import get_state, update_orientation
from pipeline.job import init_job


def _write_probe(job_dir, width, height):
    (job_dir / "probe.json").write_text(
        json.dumps({"width": width, "height": height, "fps": 30.0,
                    "duration": 10.0, "nb_frames": 300}),
        encoding="utf-8",
    )


class TestOrientationPadrao:
    def test_job_novo_com_fonte_vertical_resolve_9x16(self, tmp_path):
        job = init_job(tmp_path, "v1")
        _write_probe(job.dir, 2160, 3840)
        assert get_state("v1", tmp_path).orientation == "9x16"

    def test_job_novo_com_fonte_horizontal_resolve_16x9(self, tmp_path):
        job = init_job(tmp_path, "h1")
        _write_probe(job.dir, 1280, 720)
        assert get_state("h1", tmp_path).orientation == "16x9"

    def test_sem_probe_cai_no_16x9(self, tmp_path):
        init_job(tmp_path, "sem")
        assert get_state("sem", tmp_path).orientation == "16x9"

    def test_config_novo_nasce_com_orientation_vazia(self, tmp_path):
        init_job(tmp_path, "novo")
        cfg = json.loads((tmp_path / "novo" / "job.config.json").read_text(encoding="utf-8"))
        assert cfg["orientation"] == ""


class TestConfigLegado:
    def test_config_sem_a_chave_orientation_carrega_e_auto_detecta(self, tmp_path):
        """Jobs criados antes desta feature não têm a chave — não podem quebrar."""
        job_dir = tmp_path / "legado"
        job_dir.mkdir(parents=True)
        (job_dir / "job.config.json").write_text(
            json.dumps({
                "silence_threshold_db": -30.0, "min_silence": 0.5, "padding": 0.1,
                "min_segment": 0.3, "whisper_model": "base", "language": "pt",
                "hook_card_frames": 140, "max_caption_chars": 24, "max_caption_gap": 0.6,
                "brand_kit_slug": "", "caption_font_size": 92, "caption_bottom": 327,
                "caption_color": "", "caption_highlight": "#fcfcfc",
                "caption_font": "Plus Jakarta Sans",
            }),
            encoding="utf-8",
        )
        _write_probe(job_dir, 2160, 3840)
        assert get_state("legado", tmp_path).orientation == "9x16"


class TestUpdateOrientation:
    def test_grava_a_escolha_e_ela_vence_o_probe(self, tmp_path):
        job = init_job(tmp_path, "v2")
        _write_probe(job.dir, 2160, 3840)  # fonte vertical
        update_orientation("v2", tmp_path, "16x9")
        assert get_state("v2", tmp_path).orientation == "16x9"

    def test_persiste_no_arquivo(self, tmp_path):
        init_job(tmp_path, "v3")
        update_orientation("v3", tmp_path, "9x16")
        cfg = json.loads((tmp_path / "v3" / "job.config.json").read_text(encoding="utf-8"))
        assert cfg["orientation"] == "9x16"

    def test_preserva_os_outros_campos(self, tmp_path):
        job = init_job(tmp_path, "v4")
        job.config.caption_font_size = 92
        from dataclasses import asdict
        from pipeline.job import write_json
        write_json(job.dir / "job.config.json", asdict(job.config))
        update_orientation("v4", tmp_path, "9x16")
        cfg = json.loads((tmp_path / "v4" / "job.config.json").read_text(encoding="utf-8"))
        assert cfg["caption_font_size"] == 92
        assert cfg["orientation"] == "9x16"

    def test_rejeita_valor_invalido(self, tmp_path):
        init_job(tmp_path, "v5")
        with pytest.raises(ValueError):
            update_orientation("v5", tmp_path, "banana")

    def test_string_vazia_e_valida_significa_voltar_ao_auto(self, tmp_path):
        job = init_job(tmp_path, "v6")
        _write_probe(job.dir, 2160, 3840)
        update_orientation("v6", tmp_path, "16x9")
        update_orientation("v6", tmp_path, "")
        assert get_state("v6", tmp_path).orientation == "9x16"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_orientation_job.py -v`
Expected: FAIL com `ImportError: cannot import name 'update_orientation' from 'api.jobs'`

- [ ] **Step 3: Write minimal implementation**

Em `pipeline/job.py`, adicionar o campo ao final da dataclass `JobConfig` (após `caption_font: str = ""`, linha 22):

```python
    caption_font: str = ""
    orientation: str = ""  # "" = auto (deriva do probe); "16x9" | "9x16" = escolha do usuário
```

Em `api/jobs.py`, ajustar os imports do topo:

```python
from pipeline.job import init_job, load_json, write_json
from pipeline.orientation import FRAME_SIZES, resolve_orientation
from api.models import CutParams, Hook, JobState, ProbeOut
```

Em `api/jobs.py`, dentro de `get_state`, depois de `state.brandKitSlug = job.config.brand_kit_slug` (linha 44), antes do `return state`:

```python
    state.brandKitSlug = job.config.brand_kit_slug
    state.orientation = resolve_orientation(
        job.config.orientation,
        probe.model_dump() if probe else None,
    )
    return state
```

Em `api/jobs.py`, adicionar a função nova depois de `update_brand_kit` (linha 86):

```python
def update_orientation(slug: str, jobs_root: Path, orientation: str) -> None:
    """Grava a orientação escolhida. "" volta ao auto-detectar pelo probe."""
    if orientation != "" and orientation not in FRAME_SIZES:
        raise ValueError(f"orientação inválida: {orientation!r}")
    job = init_job(jobs_root, slug)
    job.config.orientation = orientation
    write_json(job.dir / "job.config.json", asdict(job.config))
```

Em `api/models.py`, adicionar o campo em `JobState` depois de `brandKitSlug: str = ""` (linha 141):

```python
    brandKitSlug: str = ""
    orientation: str = "16x9"  # efetiva (já resolvida); nunca vazia
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_orientation_job.py -v`
Expected: PASS (10 testes)

Confirmar que nada quebrou no resto do backend:

Run: `python -m pytest tests/ api/tests/ -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add pipeline/job.py api/jobs.py api/models.py tests/test_orientation_job.py
git commit -m "feat(orientation): persiste orientação no job com auto-detecção pelo probe"
```

---

### Task 3: Rota HTTP para ler e trocar a orientação

**Files:**
- Modify: `api/models.py` (adicionar `OrientationParams` perto de `CaptionStyleParams`, linha 74)
- Modify: `api/routes.py` (adicionar rota; imports)
- Test: `api/tests/test_orientation_routes.py` (novo)

**Interfaces:**
- Consumes: `update_orientation` (Task 2), `JobState.orientation` (Task 2).
- Produces: `PUT /api/jobs/{slug}/orientation` com body `{"orientation": "9x16"}`, resposta `{"ok": true, "orientation": "9x16"}`. `GET /api/jobs/{slug}` passa a incluir `orientation`.

- [ ] **Step 1: Write the failing test**

Create `api/tests/test_orientation_routes.py`:

```python
"""Rota de orientação do job. Usa as fixtures de api/tests/conftest.py."""


def test_get_job_expoe_a_orientacao_detectada(client, sample_mp4):
    client.post("/api/jobs", files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
                data={"slug": "o1"})
    body = client.get("/api/jobs/o1").json()
    assert body["orientation"] in ("16x9", "9x16")


def test_put_troca_a_orientacao(client, sample_mp4):
    client.post("/api/jobs", files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
                data={"slug": "o2"})
    r = client.put("/api/jobs/o2/orientation", json={"orientation": "9x16"})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "orientation": "9x16"}
    assert client.get("/api/jobs/o2").json()["orientation"] == "9x16"


def test_put_vazio_volta_ao_auto(client, sample_mp4):
    client.post("/api/jobs", files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
                data={"slug": "o3"})
    auto = client.get("/api/jobs/o3").json()["orientation"]
    outra = "9x16" if auto == "16x9" else "16x9"
    client.put("/api/jobs/o3/orientation", json={"orientation": outra})
    assert client.get("/api/jobs/o3").json()["orientation"] == outra
    r = client.put("/api/jobs/o3/orientation", json={"orientation": ""})
    assert r.status_code == 200
    assert client.get("/api/jobs/o3").json()["orientation"] == auto


def test_put_rejeita_valor_invalido(client, sample_mp4):
    client.post("/api/jobs", files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
                data={"slug": "o4"})
    r = client.put("/api/jobs/o4/orientation", json={"orientation": "banana"})
    assert r.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest api/tests/test_orientation_routes.py -v`
Expected: FAIL — o `PUT` retorna 405 (Method Not Allowed) porque a rota não existe

- [ ] **Step 3: Write minimal implementation**

Em `api/models.py`, adicionar depois de `CaptionStyleParams` (linha 80):

```python
class OrientationParams(BaseModel):
    # "" = auto (deriva do probe)
    orientation: Literal["16x9", "9x16", ""] = ""
```

Em `api/routes.py`, incluir `OrientationParams` na lista de imports vindos de `api.models`, e `update_orientation` na de `api.jobs`. Adicionar a rota logo depois de `read_job` (linha 67):

```python
@router.put("/jobs/{slug}/orientation")
def set_orientation(slug: str, params: OrientationParams):
    jobs_root, *_ = _roots()
    update_orientation(slug, jobs_root, params.orientation)
    return {"ok": True, "orientation": get_state(slug, jobs_root).orientation}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest api/tests/test_orientation_routes.py -v`
Expected: PASS (4 testes)

- [ ] **Step 5: Commit**

```bash
git add api/models.py api/routes.py api/tests/test_orientation_routes.py
git commit -m "feat(api): rota PUT /jobs/{slug}/orientation"
```

---

### Task 4: A recipe usa a orientação do job

Hoje `build_recipe` deriva `orientation` de `width >= height` (linha 75) — ignorando a escolha do usuário. Passa a receber a orientação pronta.

**Files:**
- Modify: `pipeline/recipe.py:31-50` (assinatura), `:75` (derivação), `:130-151` (retorno)
- Modify: `pipeline/stages.py:92-107` (chamada a `build_recipe`)
- Test: `tests/test_recipe.py` (adicionar casos)

**Interfaces:**
- Consumes: `resolve_orientation`, `frame_size` (Task 1); `JobConfig.orientation` (Task 2).
- Produces: `build_recipe(..., orientation: str = "")` — `""` mantém o comportamento antigo (deriva de width/height). A recipe passa a ter `formats` com **apenas a orientação escolhida**.

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `tests/test_recipe.py`:

```python
from pipeline.recipe import build_recipe


def _args(**over):
    base = dict(
        width=2160, height=3840, fps=30.0, trimmed_duration=10.0,
        words=[{"word": "oi", "start": 0.0, "end": 0.5}],
        hook={"title": "T", "subtitle": "", "duration_frames": 90},
    )
    base.update(over)
    return base


class TestRecipeOrientation:
    def test_orientacao_explicita_vence_as_dimensoes_da_fonte(self):
        r = build_recipe(**_args(orientation="16x9"))
        assert r["orientation"] == "16x9"

    def test_sem_orientacao_explicita_deriva_da_fonte(self):
        assert build_recipe(**_args())["orientation"] == "9x16"
        assert build_recipe(**_args(width=1280, height=720))["orientation"] == "16x9"

    def test_formats_tem_so_a_orientacao_escolhida(self):
        r = build_recipe(**_args(orientation="9x16"))
        assert set(r["formats"]) == {"vertical9x16"}
        assert r["formats"]["vertical9x16"] == {"width": 1080, "height": 1920}

    def test_formats_16x9(self):
        r = build_recipe(**_args(orientation="16x9"))
        assert set(r["formats"]) == {"main16x9"}
        assert r["formats"]["main16x9"] == {"width": 1920, "height": 1080}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_recipe.py -k Orientation -v`
Expected: FAIL com `TypeError: build_recipe() got an unexpected keyword argument 'orientation'`

- [ ] **Step 3: Write minimal implementation**

Em `pipeline/recipe.py`, adicionar o import no topo do arquivo:

```python
from pipeline.orientation import FORMAT_KEYS, frame_size, resolve_orientation
```

Adicionar o parâmetro na assinatura de `build_recipe` (bloco `def build_recipe(*, ...)`, a partir da linha 31), junto dos demais keyword-only:

```python
    orientation: str = "",
```

Substituir a linha 75:

```python
    orientation = "16x9" if width >= height else "9x16"
```

por:

```python
    orientation = resolve_orientation(orientation, {"width": width, "height": height})
```

Substituir o bloco `"formats"` do dict de retorno (linhas 147-150):

```python
        "formats": {
            "main16x9": {"width": 1920, "height": 1080},
            "vertical9x16": {"width": 1080, "height": 1920},
        },
```

por:

```python
        "formats": _formats_for(orientation),
```

E adicionar o helper acima de `build_recipe`:

```python
def _formats_for(orientation: str) -> dict:
    """Só a orientação escolhida — o job renderiza um formato único."""
    w, h = frame_size(orientation)
    return {FORMAT_KEYS[orientation]: {"width": w, "height": h}}
```

Em `pipeline/stages.py`, na chamada a `build_recipe` (linha ~92), adicionar o argumento:

```python
    recipe = build_recipe(
        width=meta["width"], height=meta["height"], fps=meta["fps"],
        trimmed_duration=trimmed_duration, words=words,
        hook=hook,
        orientation=job.config.orientation,
        max_chars=job.config.max_caption_chars, max_gap=job.config.max_caption_gap,
        trimmed_frames_actual=trimmed_frames_actual,
        caption_style={
            "fontSize": job.config.caption_font_size,
            "bottom": job.config.caption_bottom,
            "color": job.config.caption_color,
            "highlightColor": job.config.caption_highlight,
            "fontFamily": job.config.caption_font,
        },
        brand=brand,
        overlays=manual_overlays,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_recipe.py -v`
Expected: PASS

Run: `python -m pytest tests/ api/tests/ -q`
Expected: PASS. Se `tests/test_stages.py` afirmar que `formats` tem duas chaves, ajustar a asserção para a chave única correspondente à orientação do fixture.

- [ ] **Step 5: Commit**

```bash
git add pipeline/recipe.py pipeline/stages.py tests/test_recipe.py
git commit -m "feat(recipe): recipe respeita a orientação do job e emite um formato só"
```

---

### Task 5: Render de formato único

`run_render` hoje itera sobre `params.formats` com default nos dois. Passa a usar a orientação do job e ignorar o body.

**Files:**
- Modify: `api/routes.py:283-345` (`FORMAT_MAP`, `run_render`), `:348-365` (`get_still`)
- Modify: `api/models.py:70-71` (remover `RenderParams`)
- Test: `api/tests/test_sse.py` (ajustar), `api/tests/test_orientation_routes.py` (adicionar)

**Interfaces:**
- Consumes: `JobState.orientation` (Task 2), `FORMAT_KEYS` (Task 1).
- Produces:
  - `ORIENTATION_TO_FORMAT: dict[str, tuple[str, str]]` em `api/routes.py` — orientação → `(composition_id, sufixo_do_arquivo)`
  - `POST /jobs/{slug}/render` sem body; eventos SSE `progress` mantêm o campo `format` com a chave lógica (`main16x9`/`vertical9x16`)
  - `GET /jobs/{slug}/still?frame=N` sem o parâmetro `format`

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `api/tests/test_orientation_routes.py`:

```python
def _preparar_job(client, sample_mp4, slug):
    """Leva o job até ter edit-recipe.json — mesmo caminho de test_sse.py:66-79."""
    client.post("/api/jobs",
                files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
                data={"slug": slug})
    client.post(f"/api/jobs/{slug}/cut",
                json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3})
    client.put(f"/api/jobs/{slug}/transcript",
               json=[{"text": "ola", "start": 0.0, "end": 0.5,
                      "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}])
    client.put(f"/api/jobs/{slug}/hook",
               json={"title": "T", "subtitle": "S", "duration_frames": 60})
    client.post(f"/api/jobs/{slug}/recipe")


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


def test_render_usa_so_a_orientacao_do_job(client, sample_mp4, monkeypatch):
    """Um job marcado como vertical renderiza 9x16 e mais nada."""
    from api import render as render_mod

    chamadas = []

    async def fake_run(composition, out_path, props_path, remotion_dir, env):
        chamadas.append((composition, out_path.name))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"x")
        return FakeProc(["Rendered 1/1", "Encoded 1/1"])

    monkeypatch.setattr(render_mod, "run_remotion", fake_run)

    _preparar_job(client, sample_mp4, "r1")
    # o sample_mp4 do conftest é 320x240 (landscape); forçamos vertical
    client.put("/api/jobs/r1/orientation", json={"orientation": "9x16"})

    with client.stream("POST", "/api/jobs/r1/render") as r:
        eventos = [ln.split(":", 1)[1].strip()
                   for ln in r.iter_lines() if ln.startswith("event:")]

    assert len(chamadas) == 1, f"esperava 1 render, veio {chamadas}"
    assert chamadas[0] == ("Recorded9x16", "r1-9x16.mp4")
    assert eventos[-1] == "done"


def test_render_de_job_horizontal_usa_16x9(client, sample_mp4, monkeypatch):
    from api import render as render_mod

    chamadas = []

    async def fake_run(composition, out_path, props_path, remotion_dir, env):
        chamadas.append((composition, out_path.name))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"x")
        return FakeProc(["Rendered 1/1"])

    monkeypatch.setattr(render_mod, "run_remotion", fake_run)

    _preparar_job(client, sample_mp4, "r2")  # 320x240 => auto-detecta 16x9

    with client.stream("POST", "/api/jobs/r2/render") as r:
        list(r.iter_lines())

    assert len(chamadas) == 1
    assert chamadas[0] == ("Recorded16x9", "r2-16x9.mp4")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest api/tests/test_orientation_routes.py::test_render_usa_so_a_orientacao_do_job -v`
Expected: FAIL — `len(chamadas) == 2`, porque o default ainda renderiza os dois formatos

- [ ] **Step 3: Write minimal implementation**

Em `api/routes.py`, substituir o `FORMAT_MAP` (linhas ~283-286) por:

```python
# orientação -> (composição Remotion, sufixo do arquivo de saída)
ORIENTATION_TO_FORMAT = {
    "16x9": ("Recorded16x9", "16x9"),
    "9x16": ("Recorded9x16", "9x16"),
}
```

E importar a chave lógica da fonte única, junto dos demais imports do topo de `api/routes.py`:

```python
from pipeline.orientation import FORMAT_KEYS
```

Substituir o corpo de `run_render` (linhas 289-308) até o `async def gen()`:

```python
@router.post("/jobs/{slug}/render")
async def run_render(slug: str):
    jobs_root, _, output_root = _roots()
    output_root.mkdir(parents=True, exist_ok=True)
    job_dir = Path(jobs_root) / slug
    props_path = (job_dir / "edit-recipe.json").resolve()
    if not props_path.exists():
        raise HTTPException(status_code=409, detail="edit-recipe.json não existe; rode /recipe antes")

    orientation = get_state(slug, jobs_root).orientation
    composition, suffix = ORIENTATION_TO_FORMAT[orientation]
    jobs_to_run = [(FORMAT_KEYS[orientation], composition, f"{slug}-{suffix}.mp4")]

    remotion_dir = _publish_remotion_assets(slug, jobs_root)
    output_root_abs = output_root.resolve()
    env = _build_remotion_env()
```

O `async def gen()` e o resto do corpo (linhas 310-345) ficam **inalterados** — continuam iterando sobre `jobs_to_run`, que agora tem um item só.

Substituir `get_still` (linhas 348-352):

```python
@router.get("/jobs/{slug}/still")
async def get_still(slug: str, frame: int = 0):
    jobs_root, _, output_root = _roots()
    orientation = get_state(slug, jobs_root).orientation
    composition, suffix = ORIENTATION_TO_FORMAT[orientation]
    props_path = (Path(jobs_root) / slug / "edit-recipe.json").resolve()
    if not props_path.exists():
        raise HTTPException(status_code=409, detail="recipe ausente")

    remotion_dir = _publish_remotion_assets(slug, jobs_root)
    env = _build_remotion_env()

    out = (output_root / f".still-{slug}-{suffix}-{frame}.png").resolve()
```

O resto de `get_still` (linhas 362 em diante) fica inalterado.

Em `api/models.py`, remover a classe `RenderParams` (linhas 70-71) e o `RenderFormat` se ficar sem uso. Remover `RenderParams` da lista de imports em `api/routes.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest api/tests/test_orientation_routes.py -v`
Expected: PASS

Run: `python -m pytest tests/ api/tests/ -q`
Expected: PASS. Ajustar `api/tests/test_sse.py:117` — a chamada `client.get("/api/jobs/s3/still?frame=30&format=main16x9")` deve virar `client.get("/api/jobs/s3/still?frame=30")`.

- [ ] **Step 5: Commit**

```bash
git add api/routes.py api/models.py api/tests/
git commit -m "feat(render): renderiza só a orientação do job"
```

---

### Task 6: Espelho da orientação no front

Mesma fonte de verdade do Task 1, do lado TypeScript.

**Files:**
- Create: `web/src/frame.ts`
- Test: `web/src/__tests__/frame.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Orientation = "16x9" | "9x16"`
  - `FRAME_SIZES: Record<Orientation, { width: number; height: number }>`
  - `frameSize(o?: string): { width: number; height: number }`
  - `previewScaleFor(clientWidth: number, o?: string): number`

- [ ] **Step 1: Write the failing test**

Create `web/src/__tests__/frame.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FRAME_SIZES, frameSize, previewScaleFor } from "../frame";

describe("frameSize", () => {
  it("devolve os tamanhos canônicos", () => {
    expect(frameSize("16x9")).toEqual({ width: 1920, height: 1080 });
    expect(frameSize("9x16")).toEqual({ width: 1080, height: 1920 });
  });

  it("cai no 16x9 para valor ausente ou desconhecido", () => {
    expect(frameSize(undefined)).toEqual({ width: 1920, height: 1080 });
    expect(frameSize("")).toEqual({ width: 1920, height: 1080 });
    expect(frameSize("banana")).toEqual({ width: 1920, height: 1080 });
  });

  it("expõe exatamente as duas orientações", () => {
    expect(Object.keys(FRAME_SIZES).sort()).toEqual(["16x9", "9x16"]);
  });
});

describe("previewScaleFor", () => {
  it("escala pela largura do frame-alvo", () => {
    // preview de 304px de largura mostrando um frame 9x16 (1080 de largura)
    expect(previewScaleFor(304, "9x16")).toBeCloseTo(304 / 1080, 6);
    expect(previewScaleFor(960, "16x9")).toBeCloseTo(0.5, 6);
  });

  it("um texto de 158px ocupa a mesma fração da largura no preview e no render", () => {
    const clientWidth = 304;
    const scale = previewScaleFor(clientWidth, "9x16");
    const fracaoNoPreview = (158 * scale) / clientWidth;
    const fracaoNoRender = 158 / 1080;
    expect(fracaoNoPreview).toBeCloseTo(fracaoNoRender, 10);
  });

  it("devolve 1 para largura não positiva", () => {
    expect(previewScaleFor(0, "9x16")).toBe(1);
    expect(previewScaleFor(-5, "16x9")).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/frame.test.ts`
Expected: FAIL — não consegue resolver o import `../frame`

- [ ] **Step 3: Write minimal implementation**

Create `web/src/frame.ts`:

```ts
// Espelho de pipeline/orientation.py. O render e o preview têm que concordar
// sobre a largura do canvas, senão o texto sai com tamanho diferente do previsto.
export type Orientation = "16x9" | "9x16";

export const FRAME_SIZES: Record<Orientation, { width: number; height: number }> = {
  "16x9": { width: 1920, height: 1080 },
  "9x16": { width: 1080, height: 1920 },
};

const DEFAULT: Orientation = "16x9";

export function frameSize(o?: string): { width: number; height: number } {
  return FRAME_SIZES[o as Orientation] ?? FRAME_SIZES[DEFAULT];
}

// Converte px do canvas de render em px de tela. Os estilos da recipe estão
// em px do frame-alvo; o elemento <video> do preview é menor.
export function previewScaleFor(clientWidth: number, o?: string): number {
  if (clientWidth <= 0) return 1;
  return clientWidth / frameSize(o).width;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/__tests__/frame.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add web/src/frame.ts web/src/__tests__/frame.test.ts
git commit -m "feat(web): módulo frame com tamanhos canônicos e escala de preview"
```

---

### Task 7: `captionZone` passa a usar a altura do frame-alvo

Remove `captionRefHeight` (a compensação `1920 * h / w`), que deixa de fazer sentido quando o preview usa a régua certa.

**Files:**
- Modify: `web/src/overlayGeom.ts:15-38`
- Modify: `web/src/__tests__/overlayGeom.test.ts`
- Modify: `web/src/steps/OverlaysStep.tsx:11` (import), `:46` (state `refHeight`), `:66`, `:160`
- Modify: `web/src/steps/HookStep.tsx` (mesmo padrão: import, state `refHeight`, uso)

**Interfaces:**
- Consumes: `frameSize` (Task 6).
- Produces: `captionZone(style, frameHeight)` — segundo parâmetro passa a ser a **altura do frame-alvo** (1080 ou 1920), não mais um canvas virtual derivado do probe. `captionRefHeight` deixa de existir.

- [ ] **Step 1: Write the failing test**

Substituir, em `web/src/__tests__/overlayGeom.test.ts`, os blocos `describe("captionRefHeight", ...)` e `describe("captionZone com refHeight do vídeo", ...)` por:

```ts
describe("captionZone com a altura do frame-alvo", () => {
  it("no 9x16 a faixa fica onde o render desenha", () => {
    // legenda do job A1: bottom 327, fontSize 92, canvas 1080x1920
    const z = captionZone({ bottom: 327, fontSize: 92 }, frameSize("9x16").height);
    expect(z.bottom).toBeCloseTo(1 - 327 / 1920, 6);
    expect(z.top).toBeCloseTo(1 - (327 + 92 * 1.6) / 1920, 6);
  });

  it("no 16x9 usa 1080 de altura", () => {
    const z = captionZone({ bottom: 120, fontSize: 48 }, frameSize("16x9").height);
    expect(z.bottom).toBeCloseTo(1 - 120 / 1080, 6);
  });

  it("a mesma legenda ocupa faixas diferentes em cada orientação", () => {
    const style = { bottom: 327, fontSize: 92 };
    const v = captionZone(style, frameSize("9x16").height);
    const h = captionZone(style, frameSize("16x9").height);
    expect(v.bottom).not.toBeCloseTo(h.bottom, 3);
  });
});
```

E ajustar o import do topo do arquivo:

```ts
import { clientToFraction, captionZone, overlapsCaption, overlapsInTime, snapPosition } from "../overlayGeom";
import { frameSize } from "../frame";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/overlayGeom.test.ts`
Expected: PASS nos casos novos, mas FAIL na compilação/execução dos testes que ainda importam `captionRefHeight` — ou seja, o arquivo só fica verde depois do Step 3. Se passar inteiro já aqui, confira que você removeu mesmo os blocos antigos.

- [ ] **Step 3: Write minimal implementation**

Em `web/src/overlayGeom.ts`, remover a função `captionRefHeight` inteira (linhas 15-26) e ajustar o comentário de `captionZone`:

```ts
// Zona (fração da altura) onde a legenda fica, para desenhar como guia de colisão.
// Aproximação: legenda ancorada no rodapé, altura ~1.6x o fontSize.
// refHeight é a altura do frame-alvo (1080 no 16x9, 1920 no 9x16).
export function captionZone(
  style: { bottom: number; fontSize: number },
  refHeight = 1080,
): { top: number; bottom: number } {
```

Em `web/src/steps/OverlaysStep.tsx`:

Import (linha 11):
```ts
import { captionZone, overlapsInTime } from "../overlayGeom";
import { frameSize, previewScaleFor, type Orientation } from "../frame";
```

Trocar o state `refHeight` (linha 46) por `orientation`:
```ts
  const [orientation, setOrientation] = useState<Orientation>("16x9");
```

No `getJob` (linha 66), trocar `setRefHeight(captionRefHeight(j?.probe));` por:
```ts
      if (j?.orientation) setOrientation(j.orientation);
```

No cálculo da zona (linha 160):
```ts
  const zone = captionZone(capStyle, frameSize(orientation).height);
```

Em `web/src/steps/HookStep.tsx`, aplicar exatamente as mesmas quatro mudanças (import, state, leitura do `getJob`, cálculo da `zone`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run`
Expected: PASS. `OverlaysStep.test.tsx` e `HookStep.test.tsx` podem precisar do campo `orientation` nos mocks de `getJob` — adicionar `orientation: "9x16"` ao objeto mockado onde falhar.

Run: `cd web && npx tsc --noEmit`
Expected: sem erros (garante que nenhum arquivo ainda importa `captionRefHeight`)

- [ ] **Step 5: Commit**

```bash
git add web/src/overlayGeom.ts web/src/__tests__/overlayGeom.test.ts web/src/steps/OverlaysStep.tsx web/src/steps/HookStep.tsx
git commit -m "fix(overlays): zona da legenda usa a altura do frame-alvo"
```

---

### Task 8: `previewScale` pela largura do frame-alvo — **o coração da correção**

**Files:**
- Modify: `web/src/steps/OverlaysStep.tsx:75-85`
- Modify: `web/src/steps/HookStep.tsx:41-49`
- Modify: `web/src/steps/TranscriptStep.tsx:21`, `:31-40`
- Test: `web/src/__tests__/previewScale.test.ts` (novo — trava a regra aritmética)
- Test: `web/src/__tests__/OverlaysStep.test.tsx` (adicionar — prova que o step usa a regra)

**Interfaces:**
- Consumes: `previewScaleFor` (Task 6), `orientation` do `getJob` (Task 3).
- Produces: nada novo — corrige o comportamento existente.

- [ ] **Step 1a: Write the regression test (aritmética)**

Create `web/src/__tests__/previewScale.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { previewScaleFor, frameSize } from "../frame";

/**
 * Trava a regressão que motivou este plano: o preview escalava por 1920 fixo,
 * então no 9x16 (canvas de 1080) tudo saía 1920/1080 = 1,778x maior no render.
 */
describe("paridade preview x render", () => {
  const casos = [
    { nome: "hook do job A1", px: 158, orientation: "9x16" as const },
    { nome: "legenda do job A1", px: 92, orientation: "9x16" as const },
    { nome: "texto padrão", px: 64, orientation: "9x16" as const },
    { nome: "legenda padrão 16x9", px: 48, orientation: "16x9" as const },
  ];

  it.each(casos)("$nome ocupa a mesma fração da largura nos dois", ({ px, orientation }) => {
    const clientWidth = 304; // <video> vertical típico em max-h-[60vh]
    const scale = previewScaleFor(clientWidth, orientation);
    const noPreview = (px * scale) / clientWidth;
    const noRender = px / frameSize(orientation).width;
    expect(noPreview).toBeCloseTo(noRender, 10);
  });

  it("a régua antiga errava por exatamente 1920/1080 no vertical", () => {
    const clientWidth = 304;
    const antiga = clientWidth / 1920;
    const nova = previewScaleFor(clientWidth, "9x16");
    expect(nova / antiga).toBeCloseTo(1920 / 1080, 10);
  });

  it("o offset vertical da legenda também bate", () => {
    // bottom 327 num frame 9x16: 327/1920 da altura
    const clientWidth = 304;
    const clientHeight = clientWidth * (1920 / 1080);
    const scale = previewScaleFor(clientWidth, "9x16");
    const noPreview = (327 * scale) / clientHeight;
    expect(noPreview).toBeCloseTo(327 / 1920, 10);
  });
});
```

- [ ] **Step 1b: Write the failing test (comportamento do step)**

O teste acima exercita só `previewScaleFor`, que a Task 6 já entregou — ele passa de imediato e serve para travar a regressão. O teste que **falha antes e passa depois** é este, que prova que `OverlaysStep` realmente usa a função.

Adicionar a `web/src/__tests__/OverlaysStep.test.tsx`, dentro do `describe("OverlaysStep", ...)` existente:

```tsx
  it("dimensiona o hook pela largura do frame-alvo, não por 1920", async () => {
    // jsdom devolve clientWidth 0; fingimos um <video> vertical de 304px
    const spy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(304);
    try {
      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: any) => {
        if (url.endsWith("/overlays") && (!init || !init.method))
          return { ok: true, json: async () => [] } as any;
        if (url.endsWith("/transcript")) return { ok: true, json: async () => [] } as any;
        if (url.endsWith("/hook") && (!init || !init.method))
          return { ok: true, json: async () => ({ title: "HOOK", subtitle: "",
                                                  duration_frames: 90, fontSize: 158 }) } as any;
        if (url.endsWith("/suggestions")) return { ok: true, json: async () => [] } as any;
        if (url.endsWith("/suggest-defaults"))
          return { ok: true, json: async () => ({ x: 0.5, y: 0.12, anchor: "center",
            fontSize: 64, fontFamily: "", color: "", enter: "slide-up", exit: "fade",
            durationInFrames: 75, maxWidthPct: 80 }) } as any;
        if (url.match(/\/jobs\/[^/]+$/) && (!init || !init.method))
          return { ok: true, json: async () => ({
            slug: "s1", orientation: "9x16",
            probe: { width: 2160, height: 3840, fps: 30, duration: 10 },
            captionStyle: { fontSize: 92, bottom: 327, color: "", highlightColor: "", fontFamily: "" },
          }) } as any;
        return { ok: true, json: async () => ({ ok: true }) } as any;
      }));

      render(<OverlaysStep {...props} />);
      const hook = await screen.findByText("HOOK");
      // 158px num canvas de 1080 exibido em 304px => 158 * 304/1080 = 44.48px
      // (a régua antiga, 1920, daria 25.02px)
      await waitFor(() => {
        expect(parseFloat((hook as HTMLElement).style.fontSize)).toBeCloseTo(158 * 304 / 1080, 1);
      });
    } finally {
      spy.mockRestore();
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx -t "frame-alvo"`
Expected: FAIL — `expected 25.02 to be close to 44.48`. Esse `25.02` **é o bug**: a diferença entre os dois é exatamente 1920/1080.

Run: `cd web && npx vitest run src/__tests__/previewScale.test.ts`
Expected: PASS (já cobertos pela Task 6)

- [ ] **Step 3: Write minimal implementation**

Em `web/src/steps/OverlaysStep.tsx`, substituir o `useEffect` das linhas 75-85 por:

```ts
  // Os estilos da recipe estão em px do frame de saída; o <video> do preview
  // é menor. A régua é a LARGURA DO FRAME-ALVO (1080 no vertical, 1920 no
  // horizontal) — usar 1920 fixo fazia o vertical sair 1,778x maior no render.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => setPreviewScale(previewScaleFor(v.clientWidth, orientation));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(v);
    return () => ro.disconnect();
  }, [orientation]);
```

> **Atenção:** o array de dependências passa de `[]` para `[orientation]`. Sem isso, trocar o formato não recalcula a escala.

Em `web/src/steps/HookStep.tsx`, substituir o `useEffect` das linhas 41-49 pelo mesmo bloco acima (o `orientation` já foi adicionado na Task 7).

Em `web/src/steps/TranscriptStep.tsx`:

Adicionar o import:
```ts
import { previewScaleFor, type Orientation } from "../frame";
```

Adicionar o state depois de `previewScale` (linha 21):
```ts
  const [orientation, setOrientation] = useState<Orientation>("16x9");
```

No `getJob` existente (linha ~25-28), adicionar:
```ts
      if (j?.orientation) setOrientation(j.orientation);
```

Substituir o `useEffect` das linhas 31-40 (note que a linha 31 tem um comentário com barra invertida errada — `\ escala o preview:` — corrija para `//`):
```ts
  // Escala px do frame-alvo -> px de tela do preview.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => setPreviewScale(previewScaleFor(v.clientWidth, orientation));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(v);
    return () => ro.disconnect();
  }, [lines, orientation]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx -t "frame-alvo"`
Expected: PASS

Run: `cd web && npx vitest run`
Expected: PASS

Run: `cd web && npx tsc --noEmit`
Expected: sem erros

Confirmar que nenhuma régua fixa sobrou:

Run: `cd web && grep -rn "1920" src/ --include=*.tsx --include=*.ts | grep -v __tests__ | grep -v frame.ts`
Expected: nenhum resultado — `1920` só pode aparecer em `frame.ts` e nos testes.

- [ ] **Step 5: Commit**

```bash
git add web/src/steps/OverlaysStep.tsx web/src/steps/HookStep.tsx web/src/steps/TranscriptStep.tsx web/src/__tests__/previewScale.test.ts web/src/__tests__/OverlaysStep.test.tsx
git commit -m "fix(preview): escala pela largura do frame-alvo, não por 1920 fixo"
```

---

### Task 9: Legenda do preview espelha o `CaptionLayer` do render

`CaptionOverlay` tem caixa preta, `max-w-[90%]`, peso 600 e espaçamento normal. `CaptionLayer` não tem caixa, usa 80%, peso 800 e `marginRight: 12`. Isso muda a quebra de linha — o preview mente sobre onde o texto quebra.

**Files:**
- Modify: `web/src/components/CaptionOverlay.tsx`
- Reference (não modificar): `remotion/src/components/CaptionLayer.tsx:21-36`
- Test: `web/src/__tests__/CaptionOverlay.test.tsx` (adicionar casos)

**Interfaces:**
- Consumes: prop `scale` já existente (agora correta, via Task 8).
- Produces: `CaptionOverlay` com a mesma assinatura de props. Só o estilo muda.

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `web/src/__tests__/CaptionOverlay.test.tsx`:

```ts
const style = {
  fontSize: 92, bottom: 327, color: "#ffffff",
  highlightColor: "#fcfcfc", fontFamily: "Plus Jakarta Sans",
};

describe("paridade com o CaptionLayer do render", () => {
  it("não desenha caixa de fundo (o render não tem)", () => {
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.28} />
    );
    const p = container.querySelector("p")!;
    expect(p.className).not.toMatch(/bg-black/);
  });

  it("usa maxWidth 80% como o render", () => {
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.28} />
    );
    expect(container.querySelector("p")!.style.maxWidth).toBe("80%");
  });

  it("usa fontWeight 800 como o render", () => {
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.28} />
    );
    expect(container.querySelector("p")!.style.fontWeight).toBe("800");
  });

  it("escala fontSize e bottom pela escala do preview", () => {
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.5} />
    );
    const p = container.querySelector("p")!;
    expect(p.style.fontSize).toBe("46px");        // 92 * 0.5
    const wrap = container.querySelector("div")!;
    expect(wrap.style.marginBottom).toBe("163.5px"); // 327 * 0.5
  });

  it("escala o espaçamento entre palavras (12px no render)", () => {
    render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.5} />
    );
    expect((screen.getByText("olá") as HTMLElement).style.marginRight).toBe("6px");
  });

  it("aplica scale(1.08) na palavra ativa como o render", () => {
    render(
      <CaptionOverlay lines={lines as any} currentTime={0.7} style={style} scale={0.5} />
    );
    expect((screen.getByText("mundo") as HTMLElement).style.transform).toBe("scale(1.08)");
    expect((screen.getByText("olá") as HTMLElement).style.transform).toBe("scale(1)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/CaptionOverlay.test.tsx`
Expected: FAIL — `expect(p.className).not.toMatch(/bg-black/)` falha, `maxWidth` vem `""`, `marginRight` vem `""`

- [ ] **Step 3: Write minimal implementation**

Substituir `web/src/components/CaptionOverlay.tsx` inteiro:

```tsx
import type { CaptionLine } from "../types";
import { activeLineIndex } from "../util";

// Espelho visual de remotion/src/components/CaptionLayer.tsx: mesma largura
// máxima, peso, sombra e espaçamento entre palavras — senão o preview quebra
// linha num ponto e o render noutro. Tudo em px do frame-alvo, multiplicado
// por `scale` para virar px de tela.
const WORD_GAP_PX = 12; // igual ao marginRight do CaptionLayer

export const CaptionOverlay: React.FC<{
  lines: CaptionLine[];
  currentTime: number;
  style?: { fontSize: number; bottom: number; color: string; highlightColor: string; fontFamily: string };
  scale?: number;
}> = ({ lines, currentTime, style, scale = 1 }) => {
  const li = activeLineIndex(lines, currentTime);
  if (li < 0) return null;
  const line = lines[li];
  const color = style?.color || "#ffffff";
  const highlight = style?.highlightColor || "#22c55e";
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center pointer-events-none"
      style={{ marginBottom: style ? style.bottom * scale : undefined }}>
      <p
        className="text-center"
        style={{
          maxWidth: "80%",
          fontSize: style ? style.fontSize * scale : undefined,
          fontFamily: style?.fontFamily || undefined,
          fontWeight: 800,
          lineHeight: 1.2,
          color,
          textShadow: "0 4px 16px rgba(0,0,0,0.6)",
        }}
      >
        {line.words.map((w, wi) => {
          const active = currentTime >= w.start && currentTime < w.end;
          return (
            <span key={wi} data-active={active}
              style={{
                color: active ? highlight : color,
                transform: active ? "scale(1.08)" : "scale(1)",
                display: "inline-block",
                marginRight: WORD_GAP_PX * scale,
              }}>
              {w.word}
            </span>
          );
        })}
      </p>
    </div>
  );
};
```

> **Mudança de comportamento:** o render separa palavras por `marginRight`, não por espaço em branco — por isso o `{wi < line.words.length - 1 ? " " : ""}` sai. O teste "mostra a linha ativa no tempo dado" (que busca `screen.getByText("olá")`) continua passando porque cada palavra fica no seu próprio `<span>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/__tests__/CaptionOverlay.test.tsx`
Expected: PASS (9 testes — 3 antigos + 6 novos)

Run: `cd web && npx vitest run`
Expected: PASS. `TranscriptStep.test.tsx` pode ter asserção sobre a caixa preta ou sobre o texto concatenado com espaços — ajustar para a nova estrutura se falhar.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/CaptionOverlay.tsx web/src/__tests__/CaptionOverlay.test.tsx
git commit -m "fix(legenda): preview espelha o CaptionLayer do render"
```

---

### Task 10: UI — escolher o formato no upload e renderizar um só

**Files:**
- Modify: `web/src/api.ts` (adicionar `putOrientation`)
- Modify: `web/src/types.ts:55-65` (`JobState.orientation`)
- Modify: `web/src/steps/UploadStep.tsx`
- Modify: `web/src/steps/RenderStep.tsx`
- Test: `web/src/__tests__/UploadStep.test.tsx`, `web/src/__tests__/RenderStep.test.tsx`

**Interfaces:**
- Consumes: `PUT /jobs/{slug}/orientation` (Task 3), `frameSize` (Task 6).
- Produces: `putOrientation(slug: string, orientation: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Em `web/src/__tests__/UploadStep.test.tsx`, o arquivo hoje **não mocka `../api`** (os três testes existentes só mexem na lista de arquivos, sem disparar upload). Adicionar o mock no topo, logo após os imports do vitest, e o novo `describe` ao final.

Topo do arquivo — inserir antes de `import { UploadStep } ...`:

```tsx
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/react";

const uploadJob = vi.fn();
const putOrientation = vi.fn(async () => {});
vi.mock("../api", () => ({
  uploadJob: (...a: any[]) => uploadJob(...a),
  putOrientation: (...a: any[]) => putOrientation(...a),
}));

import { UploadStep } from "../steps/UploadStep";
```

Ao final do arquivo:

```tsx
describe("escolha de formato", () => {
  beforeEach(() => {
    uploadJob.mockReset();
    putOrientation.mockReset();
    putOrientation.mockResolvedValue(undefined);
  });

  async function subir(width: number, height: number) {
    uploadJob.mockResolvedValue({
      slug: "v1",
      probe: { width, height, fps: 30, duration: 10 },
    });
    render(<UploadStep {...props} />);
    addFiles(["a.mp4"]);
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => screen.getByRole("radio", { name: /9:16/i }));
  }

  it("pré-seleciona 9:16 para fonte vertical", async () => {
    await subir(2160, 3840);
    expect((screen.getByRole("radio", { name: /9:16/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /16:9/i }) as HTMLInputElement).checked).toBe(false);
  });

  it("pré-seleciona 16:9 para fonte horizontal", async () => {
    await subir(1280, 720);
    expect((screen.getByRole("radio", { name: /16:9/i }) as HTMLInputElement).checked).toBe(true);
  });

  it("trocar o formato chama a API", async () => {
    await subir(2160, 3840);
    fireEvent.click(screen.getByRole("radio", { name: /16:9/i }));
    await waitFor(() => {
      expect(putOrientation).toHaveBeenCalledWith("v1", "16x9");
    });
  });
});
```

> **Nota:** `setSlug` em `props` é um no-op, então `slug` não atualiza durante o teste — por isso `trocarOrientacao` no Step 3 usa `slug || localSlug`. O mock devolve `slug: "v1"` e `localSlug` tem default `"video1"`; para a asserção `putOrientation).toHaveBeenCalledWith("v1", ...)` valer, use `props = { ...props, setSlug: (s: string) => { propsSlug = s; } }` ou aceite `expect.any(String)` como primeiro argumento. A segunda opção é mais simples e igualmente válida aqui.

Substituir o `describe` inteiro de `web/src/__tests__/RenderStep.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  fileUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  getJob: vi.fn(async () => ({ orientation: "9x16" })),
  streamSSE: vi.fn(async (_url: string, _opts: any, on: any) => {
    on.progress?.({ format: "vertical9x16", kind: "rendered", n: 5, total: 10 });
    on.done?.({ ok: true });
  }),
}));

import { RenderStep } from "../steps/RenderStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("RenderStep com formato único", () => {
  it("anuncia o formato do job em vez de oferecer checkboxes", async () => {
    render(<RenderStep {...props} />);
    await waitFor(() => expect(screen.getByText(/9:16/)).toBeInTheDocument());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("mostra o progresso indexado pela chave lógica vertical9x16", async () => {
    render(<RenderStep {...props} />);
    await waitFor(() => screen.getByRole("button", { name: /renderizar/i }));
    fireEvent.click(screen.getByRole("button", { name: /renderizar/i }));
    await waitFor(() => expect(screen.getByText(/5\/10/)).toBeInTheDocument());
  });

  it("exibe só o vídeo 9x16 ao terminar", async () => {
    const { container } = render(<RenderStep {...props} />);
    await waitFor(() => screen.getByRole("button", { name: /renderizar/i }));
    fireEvent.click(screen.getByRole("button", { name: /renderizar/i }));
    await waitFor(() => {
      const videos = container.querySelectorAll("video");
      expect(videos).toHaveLength(1);
      expect(videos[0].getAttribute("src")).toContain("v1-9x16.mp4");
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/__tests__/RenderStep.test.tsx`
Expected: FAIL — `queryByRole("checkbox")` encontra os dois checkboxes atuais

- [ ] **Step 3: Write minimal implementation**

Em `web/src/types.ts`, adicionar ao tipo `JobState` (após `has_render_9x16`):

```ts
  has_render_9x16: boolean;
  orientation: "16x9" | "9x16";
```

Em `web/src/api.ts`, adicionar depois de `putBrandKit`:

```ts
export async function putOrientation(slug: string, orientation: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/orientation`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orientation }),
  }));
}
```

Em `web/src/steps/UploadStep.tsx`:

Imports e tipo:
```ts
import { uploadJob, putOrientation } from "../api";
import type { Orientation } from "../frame";
```

State novo, junto dos demais:
```ts
  const [orientation, setOrientation] = useState<Orientation>("16x9");
```

No `onUpload`, depois de `setProbe(r.probe)`:
```ts
      const r = await uploadJob(files, localSlug);
      setSlug(r.slug); setProbe(r.probe); setFiles([]);
      // o backend já detectou pelo probe; espelha aqui para o usuário poder trocar
      const detectada: Orientation =
        r.probe && r.probe.width < r.probe.height ? "9x16" : "16x9";
      setOrientation(detectada);
```

Handler:
```ts
  const trocarOrientacao = async (o: Orientation) => {
    setOrientation(o);
    try { await putOrientation(slug || localSlug, o); }
    catch (e: any) { setErr(e.message ?? "erro ao trocar o formato"); }
  };
```

No bloco `{probe && (...)}`, adicionar depois da linha de Duração:
```tsx
          <p>Duração: <strong>{formatSeconds(probe.duration)}</strong></p>
          <fieldset className="mt-3 pt-3 border-t border-zinc-800">
            <legend className="text-zinc-400">Formato de saída</legend>
            <p className="text-xs text-zinc-500 mb-2">
              Detectado pelo vídeo. O preview e o render usam esse formato.
            </p>
            <div className="flex gap-4">
              {(["9x16", "16x9"] as Orientation[]).map((o) => (
                <label key={o} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio" name="orientation" value={o}
                    checked={orientation === o}
                    onChange={() => trocarOrientacao(o)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                  <span>{o === "9x16" ? "9:16 (vertical)" : "16:9 (horizontal)"}</span>
                </label>
              ))}
            </div>
          </fieldset>
```

Substituir `web/src/steps/RenderStep.tsx` inteiro:

```tsx
import { useEffect, useState } from "react";
import { streamSSE, fileUrl, getJob } from "../api";
import { ProgressBar } from "../components/ProgressBar";
import type { Orientation } from "../frame";
import type { StepProps } from "../App";

const LABEL: Record<Orientation, string> = { "16x9": "16:9 (1920×1080)", "9x16": "9:16 (1080×1920)" };

export const RenderStep: React.FC<StepProps> = ({ slug, back }) => {
  const [orientation, setOrientation] = useState<Orientation>("16x9");
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ detail: string; log?: string } | null>(null);

  useEffect(() => {
    getJob(slug).then((j: any) => { if (j?.orientation) setOrientation(j.orientation); })
      .catch(() => {});
  }, [slug]);

  const outName = `${slug}-${orientation}.mp4`;

  const render = async () => {
    setBusy(true); setErr(null); setDone(false); setProg(null);
    try {
      await streamSSE(`/api/jobs/${slug}/render`, { method: "POST" }, {
        progress: (d) => {
          if (d.n != null && d.total != null) setProg({ n: d.n, total: d.total });
        },
        done: () => setDone(true),
        error: (d) => setErr({ detail: d.detail ?? "erro no render", log: d.log }),
      });
    } catch (e: any) { setErr({ detail: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">5. Renderizar</h2>

      <p className="text-sm text-zinc-400">
        Formato do projeto: <strong className="text-zinc-200">{LABEL[orientation]}</strong>.
        Para trocar, volte ao passo 1.
      </p>

      <button onClick={render} disabled={busy}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy ? "Renderizando..." : `Renderizar ${orientation === "9x16" ? "9:16" : "16:9"}`}
      </button>

      {err && (
        <div className="bg-red-950/40 border border-red-800 rounded p-3 text-sm space-y-2">
          <p className="text-red-400 font-medium">{err.detail}</p>
          {err.log && (
            <pre className="text-xs text-red-300/80 whitespace-pre-wrap overflow-x-auto max-h-48">{err.log}</pre>
          )}
        </div>
      )}

      {prog && <ProgressBar label={LABEL[orientation]} n={prog.n} total={prog.total} />}

      {done && (
        <div>
          <p className="text-sm text-zinc-400 mb-1">{LABEL[orientation]}</p>
          <video controls src={fileUrl(slug, outName)} className="w-full max-w-md rounded" />
          <a href={fileUrl(slug, outName)} download
             className="inline-block mt-2 px-3 py-1 bg-zinc-800 rounded text-sm">Baixar</a>
        </div>
      )}

      <div className="pt-4">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
      </div>
    </section>
  );
};
```

> **Nota:** o handler de `progress` deixou de filtrar por `d.format`. Como só existe um formato por render, todo evento de progresso pertence a ele — o campo continua vindo do backend (`main16x9`/`vertical9x16`) mas o front não precisa mais indexar por ele.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run`
Expected: PASS

Run: `cd web && npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 5: Commit**

```bash
git add web/src/api.ts web/src/types.ts web/src/steps/UploadStep.tsx web/src/steps/RenderStep.tsx web/src/__tests__/
git commit -m "feat(ui): formato escolhido no upload, render de um formato só"
```

---

### Task 11: Limpeza do código morto no Remotion

`Vertical9x16` passa `captionFontSize={64}` e `captionBottom={320}` para `Timeline`, que **ignora as duas props** — usa `recipe.captionStyle`. É um resto de uma tentativa antiga de compensar a diferença de escala, e confunde quem lê.

**Files:**
- Modify: `remotion/src/Vertical9x16.tsx`
- Modify: `remotion/src/Main16x9.tsx`
- Modify: `remotion/src/Timeline.tsx:9-13`

**Interfaces:**
- Consumes: nada.
- Produces: `Timeline: React.FC<{ recipe: TEditRecipe }>` — as props `captionFontSize` e `captionBottom` deixam de existir.

> **Esta task não tem ciclo TDD.** É remoção de código morto: as props já são ignoradas hoje, então nenhum comportamento observável muda e não existe teste que possa falhar antes e passar depois. O gate é o compilador — `tsc --noEmit` acusa qualquer chamador que ficou para trás — mais a suíte existente, que prova que nada regrediu.

- [ ] **Step 1: Confirmar o estado atual**

Ler `remotion/src/Main16x9.tsx` (6 linhas) e confirmar que ele também passa `captionFontSize` / `captionBottom`.

Run: `cd remotion && grep -rn "captionFontSize\|captionBottom" src/`
Expected: aparecem só em `Timeline.tsx` (declaração), `Main16x9.tsx` e `Vertical9x16.tsx` (passagem). Se aparecerem em mais algum lugar, incluir esse arquivo na lista de Files.

- [ ] **Step 2: Registrar o baseline verde**

Run: `cd remotion && npx vitest run && npx tsc --noEmit`
Expected: PASS. Se já estiver vermelho antes da sua mudança, pare e resolva isso primeiro — senão você não consegue atribuir a falha do Step 4.

- [ ] **Step 3: Remover as props**

Em `remotion/src/Timeline.tsx`, substituir a assinatura (linhas 9-13):

```tsx
export const Timeline: React.FC<{ recipe: TEditRecipe }> = ({ recipe }) => {
```

Em `remotion/src/Vertical9x16.tsx`:

```tsx
import { Timeline } from "./Timeline";
import type { TEditRecipe } from "./schema";

export const Vertical9x16: React.FC<TEditRecipe> = (recipe) => {
  return <Timeline recipe={recipe} />;
};
```

Em `remotion/src/Main16x9.tsx`, remover as mesmas props da chamada a `<Timeline />`.

- [ ] **Step 4: Verificar**

Run: `cd remotion && npx tsc --noEmit`
Expected: sem erros. Se algum chamador ficou para trás, o erro aponta a linha exata.

Run: `cd remotion && npx vitest run`
Expected: PASS — mesmo resultado do baseline do Step 2.

Run: `cd remotion && grep -rn "captionFontSize\|captionBottom" src/`
Expected: nenhum resultado.

- [ ] **Step 5: Commit**

```bash
git add remotion/src/Timeline.tsx remotion/src/Vertical9x16.tsx remotion/src/Main16x9.tsx
git commit -m "refactor(remotion): remove props de legenda que o Timeline ignorava"
```

---

### Task 12: Verificação de ponta a ponta

Nenhum teste automatizado prova que os pixels do MP4 batem com o preview. Esta task fecha essa lacuna com uma conferência visual.

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir a stack**

```bash
# terminal 1
python -m uvicorn api.app:app --reload
# terminal 2
cd web && npm run dev
```

- [ ] **Step 2: Conferir o job A1 (vertical, 2160×3840)**

Abrir o job `A1` no editor. Confirmar:
- O passo 1 mostra **9:16 (vertical)** selecionado.
- No passo Textos, o hook e os textos aparecem **visivelmente maiores** do que apareciam antes desta mudança. Isso é o esperado: o preview passou a mostrar o tamanho real.
- A faixa amarela da zona de legenda cobre onde a legenda está desenhada.

- [ ] **Step 3: Comparar preview e still**

Capturar um still do frame 30 e comparar com o preview no mesmo instante:

```bash
curl "http://localhost:8000/api/jobs/A1/still?frame=30" --output still-30.png
```

Abrir `still-30.png` lado a lado com o preview parado em `30/fps` segundos. O hook deve ocupar a mesma fração da largura nos dois, quebrar linha nas mesmas palavras, e a legenda deve estar na mesma altura.

- [ ] **Step 4: Renderizar e conferir**

Renderizar pelo passo 5. Confirmar que sai **um** arquivo, `output/A1-9x16.mp4`, e que nenhum `A1-16x9.mp4` novo aparece. Abrir o MP4 e conferir contra o preview.

- [ ] **Step 5: Recalibrar os tamanhos**

Os `fontSize` do job A1 (hook 158, textos 113/137/117, legenda 92) foram escolhidos olhando um preview que mostrava tudo 1,778× menor do que a realidade. Agora que o preview fala a verdade, é provável que estejam grandes demais. Ajustar os sliders vendo o resultado real e salvar.

Isto **não é um bug do plano** — é a calibragem antiga aparecendo. Vale registrar os valores novos como referência para os próximos jobs.

- [ ] **Step 6: Suíte completa**

```bash
python -m pytest tests/ api/tests/ -q
cd web && npx vitest run && npx tsc --noEmit
cd ../remotion && npx vitest run && npx tsc --noEmit
```

Expected: tudo verde.

- [ ] **Step 7: Commit final**

```bash
git commit --allow-empty -m "chore: verificação e2e da paridade preview/render"
```

---

## Notas de decisão

**Por que não unidades relativas na recipe?** Guardar `fontSizePct` (fração da largura) em vez de px faria o mesmo texto ficar idêntico nos dois formatos e dispensaria o preview de saber a orientação. É mais elegante, mas exige migrar `jobs/*.json` e mexer nos sliders do editor. Com um formato único por job, o ganho some — os px passam a ter significado único. Se um dia voltar a existir saída multi-formato no mesmo job, esta é a rota certa.

**Por que `orientation: ""` em vez de gravar o valor detectado no ingest?** Um valor gravado congela a detecção. Com `""` = auto, trocar o vídeo-fonte re-detecta sozinho, e a escolha explícita do usuário continua sendo respeitada. Também elimina qualquer necessidade de migrar os jobs existentes.

**O que continua diferente entre preview e render:** o preview desenha o vídeo-fonte cru. Se a orientação escolhida for diferente da orientação da fonte, o render aplica o caminho *fit + blur* de `SourceClip.tsx:55-87` — fundo borrado e vídeo encaixado no centro — e o preview não mostra isso. Para o caso principal (fonte vertical → saída vertical) os aspectos coincidem e o problema não aparece. Simular o fit+blur no preview seria o próximo passo se você passar a usar formatos cruzados.
