# Variações de Hook — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projetos "matriz" (só o corpo) geram variações por hook: upload de um clipe de hook → variação nasce pronta (vídeo composto, transcrição fundida, textos deslocados), aberta no passo do texto do hook.

**Architecture:** Composição física com deslocamento (abordagem A da spec). A variação nasce com `trimmed.mp4` próprio (hook cortado + corpo por stream-copy), transcrição = hook ++ corpo deslocado por `delta`, overlays/sugestões com `fromFrame += round(delta×fps)`. Depois de criada é um projeto normal e autossuficiente. A escolha matriz/normal nasce no upload (`papel` no config).

**Tech Stack:** Python (FastAPI + pipeline ffmpeg/whisper, pytest com monkeypatch no padrão `_cut_falso`/`_ingest_falso`), React+TS (vitest).

**Spec:** `docs/superpowers/specs/2026-08-01-variacoes-de-hook-design.md`

**Comandos:** backend `python3 -m pytest -q` (raiz); front `npm test --prefix web`; tsc `cd web && npx tsc --noEmit -p tsconfig.json` (baseline: 5 erros pré-existentes, nenhum nos arquivos deste plano). Comentários/mensagens em pt-BR, no estilo do arquivo.

---

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| `pipeline/job.py` | `JobConfig` ganha `papel`/`origem_matriz` |
| `api/models.py` | `JobState`/`JobSummary` expõem os dois campos |
| `api/jobs.py` | summary/state preenchem do config |
| `pipeline/variants.py` (novo) | fusão/deslocamento puros + orquestração `criar_variacao` |
| `api/routes.py` | `POST /jobs` aceita `papel`; nova rota SSE `POST /jobs/{slug}/variants` |
| `tests/test_variants.py` (novo) | golden do deslocamento + orquestração mockada |
| `api/tests/test_variants_routes.py` (novo) | rota: validações, happy path, rollback |
| `web/src/types.ts`, `web/src/api.ts` | campos novos; `uploadJob(papel)`; `createVariant` |
| `web/src/steps/UploadStep.tsx` | toggle matriz |
| `web/src/RecordedWizard.tsx`, `web/src/App.tsx` | passos por papel; `onOpen(slug, step?)`; `nextLabel` em StepProps |
| `web/src/steps/OverlaysStep.tsx` | botão final usa `nextLabel` ("Concluir" na matriz) |
| `web/src/ProjectsScreen.tsx` | badge matriz + diálogo "Nova variação" |
| `web/src/steps/CutsStep.tsx` | mensagem correta para variação |

Fatos do código que o plano usa (verificados): `concat_videos`/`_try_copy_concat`/`_normalize_clip`/`_probe_stream_info`/`_signature` em `pipeline/concat.py`; `cut_segments(src, segments, out, total_duration, progress_cb, scale)`; `build_scale_filter(w, h)`; transcript = lista de linhas `{"text","start","end","words":[{"word","start","end"}]}`; `run_with_progress(blocking_fn)`→ SSE; `Stepper` aceita `labels`; `uploadJob(files, slug, overwrite)` em `api.ts`; wizard: `Steps=[Upload,Cuts,Transcript,Hook,Overlays,Render]`, `onOpen(s)=>{setSlug(s);setStep(0)}`.

---

### Task 1: Modelo — `papel` e `origem_matriz` (config → summary/state → upload)

**Files:**
- Modify: `pipeline/job.py` (JobConfig), `api/models.py` (JobState/JobSummary), `api/jobs.py` (job_summary, job_summary_minimo, get_state), `api/routes.py` (create_job)
- Test: `api/tests/test_models.py` (ou novo bloco em `api/tests/test_routes.py`)

- [ ] **Step 1: Testes que falham**

Em `api/tests/test_routes.py`, acrescentar:

```python
def test_upload_com_papel_matriz_grava_no_config(client, sample_mp4, tmp_root):
    with open(sample_mp4, "rb") as f:
        r = client.post("/api/jobs", data={"slug": "m1", "papel": "matriz"},
                        files=[("files", ("s.mp4", f, "video/mp4"))])
    assert r.status_code == 200, r.text
    import json
    cfg = json.loads((tmp_root / "jobs" / "m1" / "job.config.json").read_text(encoding="utf-8"))
    assert cfg["papel"] == "matriz"

    s = client.get("/api/jobs/m1").json()
    assert s["papel"] == "matriz"
    lista = client.get("/api/jobs").json()
    assert [j["papel"] for j in lista if j["slug"] == "m1"] == ["matriz"]


def test_upload_sem_papel_continua_normal(client, sample_mp4):
    with open(sample_mp4, "rb") as f:
        r = client.post("/api/jobs", data={"slug": "n1"},
                        files=[("files", ("s.mp4", f, "video/mp4"))])
    assert r.status_code == 200
    assert client.get("/api/jobs/n1").json()["papel"] == "normal"


def test_papel_invalido_no_upload_e_400(client, sample_mp4):
    with open(sample_mp4, "rb") as f:
        r = client.post("/api/jobs", data={"slug": "n2", "papel": "chefe"},
                        files=[("files", ("s.mp4", f, "video/mp4"))])
    assert r.status_code == 400
```

- [ ] **Step 2: Rodar e ver falhar** — `python3 -m pytest api/tests/test_routes.py -q` → os 3 novos FALHAM (campo inexistente / 200 em vez de 400).

- [ ] **Step 3: Implementar**

`pipeline/job.py`, no fim de `JobConfig`:

```python
    # "matriz" = projeto só-corpo que gera variações de hook (spec 2026-08-01);
    # variações nascem "normal" com origem_matriz preenchido (só exibição —
    # a variação é autossuficiente e sobrevive à exclusão da matriz).
    papel: str = "normal"  # "normal" | "matriz"
    origem_matriz: str = ""
```

`api/models.py` — em `JobState` (após `orientation`) e em `JobSummary` (após `orientation`):

```python
    papel: str = "normal"
    origem_matriz: str = ""
```

`api/jobs.py` — em `job_summary`, no construtor do `JobSummary`:

```python
        papel=cfg.get("papel", "normal"),
        origem_matriz=cfg.get("origem_matriz", ""),
```

(`job_summary_minimo` fica nos defaults — config ilegível não sabe o papel.)
Em `get_state`, onde o `JobState` é montado, preencher os dois campos a partir do `job_config` (o `JobConfig` já os tem pela dataclass).

`api/routes.py` — `create_job` ganha `papel: str = Form(default="normal")`; logo após a validação de `files`:

```python
    if papel not in ("normal", "matriz"):
        raise HTTPException(status_code=400, detail="papel inválido")
```

E depois do `init_job` (que garante o config), gravar quando for matriz:

```python
    if papel == "matriz":
        cfg_path = Path(jobs_root) / slug / "job.config.json"
        data = load_json(cfg_path)
        data["papel"] = "matriz"
        write_json(cfg_path, data)
```

- [ ] **Step 4: Rodar** — `python3 -m pytest -q` → tudo verde (337+3 e nenhum quebrado; projetos de teste antigos sem o campo continuam "normal" pelos defaults).

- [ ] **Step 5: Commit**

```bash
git add pipeline/job.py api/models.py api/jobs.py api/routes.py api/tests/test_routes.py
git commit -m "feat(modelo): papel normal|matriz no config, summary, state e upload"
```

---

### Task 2: `pipeline/variants.py` — fusão e deslocamento (puros, golden)

**Files:**
- Create: `pipeline/variants.py`
- Test: `tests/test_variants.py` (novo)

- [ ] **Step 1: Testes golden que falham**

```python
"""Golden do deslocamento — a única matemática nova das variações de hook.
Errar aqui é ressuscitar a corrupção silenciosa de legendas (spec 2026-08-01)."""
from pipeline.variants import fundir_transcricoes, deslocar_overlays


def _linha(texto, start, end):
    return {"text": texto, "start": start, "end": end,
            "words": [{"word": texto, "start": start, "end": end}]}


def test_fundir_desloca_o_corpo_pela_duracao_do_hook():
    hook = [_linha("oi", 0.0, 0.8)]
    corpo = [_linha("corpo", 1.0, 2.0)]
    out = fundir_transcricoes(hook, corpo, delta=3.2)
    assert out[0] == _linha("oi", 0.0, 0.8)                      # hook intacto
    assert out[1]["start"] == 4.2 and out[1]["end"] == 5.2       # 1.0+3.2
    assert out[1]["words"][0]["start"] == 4.2


def test_fundir_nao_muta_as_entradas():
    corpo = [_linha("corpo", 1.0, 2.0)]
    fundir_transcricoes([], corpo, delta=2.0)
    assert corpo[0]["start"] == 1.0


def test_fundir_com_hook_vazio_so_desloca():
    out = fundir_transcricoes([], [_linha("a", 0.5, 1.0)], delta=1.5)
    assert [round(out[0]["start"], 3), round(out[0]["end"], 3)] == [2.0, 2.5]


def test_deslocar_overlays_soma_frames_e_preserva_o_resto():
    ovs = [{"id": "ov_a", "type": "text", "text": "M", "fromFrame": 30,
            "durationInFrames": 20, "x": 0.5}]
    out = deslocar_overlays(ovs, delta=3.2, fps=30.0)
    assert out[0]["fromFrame"] == 30 + 96                        # round(3.2*30)
    assert out[0]["durationInFrames"] == 20 and out[0]["x"] == 0.5
    assert ovs[0]["fromFrame"] == 30                             # não muta
```

- [ ] **Step 2: Rodar e ver falhar** — `python3 -m pytest tests/test_variants.py -q` → ImportError.

- [ ] **Step 3: Implementar**

`pipeline/variants.py`:

```python
"""Variações de hook (spec 2026-08-01): fusão/deslocamento + orquestração.

A variação nasce com trimmed próprio (hook cortado + corpo da matriz) e
artefatos fundidos; depois disso é um projeto normal. delta é SEMPRE a
duração do hook cortado lida do probe — nunca estimada."""
import copy


def fundir_transcricoes(hook: list, corpo: list, delta: float) -> list:
    """hook ++ corpo com start/end (linhas e palavras) somados de delta."""
    deslocado = []
    for linha in corpo:
        nova = copy.deepcopy(linha)
        nova["start"] = linha["start"] + delta
        nova["end"] = linha["end"] + delta
        for w in nova["words"]:
            w["start"] += delta
            w["end"] += delta
        deslocado.append(nova)
    return list(hook) + deslocado


def deslocar_overlays(overlays: list, delta: float, fps: float) -> list:
    """fromFrame += round(delta*fps); serve para overlays e sugestões."""
    frames = round(delta * fps)
    out = []
    for ov in overlays:
        novo = copy.deepcopy(ov)
        novo["fromFrame"] = ov["fromFrame"] + frames
        out.append(novo)
    return out
```

- [ ] **Step 4: Rodar** — verde. **Step 5: Commit** — `git add pipeline/variants.py tests/test_variants.py && git commit -m "feat(variants): fusão de transcrições e deslocamento de overlays (golden)"`

---

### Task 3: `criar_variacao` — orquestração com rollback

**Files:**
- Modify: `pipeline/variants.py`
- Test: `tests/test_variants.py`

- [ ] **Step 1: Testes que falham** (padrão `_cut_falso`: mocka só o I/O caro; a lógica fica real)

```python
import json
from pathlib import Path
import pytest
from pipeline.job import init_job, write_json, load_json


def _matriz_pronta(tmp_path):
    """Matriz mínima: trimmed + probe + transcript + textos + config."""
    jobs_root = tmp_path / "jobs"
    m = init_job(jobs_root, "corpo")
    (m.dir / "trimmed.mp4").write_bytes(b"corpo trimmed")
    write_json(m.dir / "trimmed.probe.json",
               {"width": 1080, "height": 1920, "fps": 30.0, "duration": 8.0, "nb_frames": 240})
    write_json(m.dir / "transcript.json", [_linha("corpo", 1.0, 2.0)])
    write_json(m.dir / "overlays.json", [{"id": "ov_a", "type": "text", "text": "M",
                                          "fromFrame": 30, "durationInFrames": 20}])
    write_json(m.dir / "suggestions.json", [{"id": "sug_a", "text": "S",
                                             "fromFrame": 60, "durationInFrames": 30}])
    write_json(m.dir / "suggest-defaults.json", {"x": 0.5, "y": 0.12})
    cfg = load_json(m.dir / "job.config.json")
    cfg.update({"papel": "matriz", "title": "Meu corpo", "silence_threshold_db": -35.0})
    write_json(m.dir / "job.config.json", cfg)
    return jobs_root, m


def _variacao_falsa(monkeypatch, dur_hook=3.2, dur_composto=11.2):
    """Mocka ffmpeg/whisper de pipeline.variants; devolve os probes usados."""
    from pipeline import variants

    class _Meta:
        width, height, fps = 1080, 1920, 30.0
        def __init__(self, duration): self.duration = duration; self.nb_frames = int(duration * 30)

    probes = {}
    def fake_probe(p):
        # hook cortado tem dur_hook; qualquer outro (o composto) tem dur_composto
        meta = _Meta(dur_hook if "hook" in Path(p).name else dur_composto)
        probes[Path(p).name] = meta
        return meta

    monkeypatch.setattr(variants, "detect_silences", lambda *a, **k: [])
    monkeypatch.setattr(variants, "cut_segments",
                        lambda src, seg, dest, **k: Path(dest).write_bytes(b"hook cortado"))
    monkeypatch.setattr(variants, "probe_video", fake_probe)
    monkeypatch.setattr(variants, "_concat_hook_e_corpo",
                        lambda hook, corpo, dest: Path(dest).write_bytes(b"composto"))
    monkeypatch.setattr(variants, "transcribe_audio",
                        lambda *a, **k: [_linha("oi", 0.0, 0.8)])
    return probes


def test_criar_variacao_monta_o_projeto_completo(tmp_path, monkeypatch):
    from pipeline.variants import criar_variacao
    jobs_root, m = _matriz_pronta(tmp_path)
    _variacao_falsa(monkeypatch)
    (tmp_path / "hook.mov").write_bytes(b"hook bruto")

    criar_variacao(m.dir, jobs_root, "corpo-h1", str(tmp_path / "hook.mov"))

    v = jobs_root / "corpo-h1"
    assert (v / "trimmed.mp4").read_bytes() == b"composto"
    assert not (v / "source.mp4").exists()                       # sem source, de propósito
    probe = load_json(v / "trimmed.probe.json")
    assert probe["duration"] == 11.2
    assert load_json(v / "cuts.json") == [{"start": 0, "end": 11.2}]

    t = load_json(v / "transcript.json")
    assert t[0]["text"] == "oi"                                  # hook primeiro
    assert t[1]["start"] == 1.0 + 3.2                            # corpo deslocado
    assert load_json(v / "overlays.json")[0]["fromFrame"] == 30 + round(3.2 * 30)
    assert load_json(v / "suggestions.json")[0]["fromFrame"] == 60 + round(3.2 * 30)
    assert load_json(v / "suggest-defaults.json") == {"x": 0.5, "y": 0.12}
    assert not (v / "hook.json").exists()                        # texto fica para o usuário

    cfg = load_json(v / "job.config.json")
    assert cfg["papel"] == "normal"
    assert cfg["origem_matriz"] == "corpo"
    assert cfg["silence_threshold_db"] == -35.0                  # sliders herdados
    assert cfg["title"] == "Meu corpo h1"                        # título + sufixo do slug
    # temporários limpos
    assert not any(p.name.startswith("hook") for p in v.iterdir())


def test_criar_variacao_falha_no_meio_faz_rollback(tmp_path, monkeypatch):
    from pipeline.variants import criar_variacao
    jobs_root, m = _matriz_pronta(tmp_path)
    _variacao_falsa(monkeypatch)
    from pipeline import variants
    def explode(*a, **k): raise RuntimeError("whisper caiu")
    monkeypatch.setattr(variants, "transcribe_audio", explode)
    (tmp_path / "hook.mov").write_bytes(b"hook bruto")

    with pytest.raises(RuntimeError, match="whisper caiu"):
        criar_variacao(m.dir, jobs_root, "corpo-h2", str(tmp_path / "hook.mov"))
    assert not (jobs_root / "corpo-h2").exists()                 # nada meio-nascido


def test_criar_variacao_matriz_sem_overlays_nao_estoura(tmp_path, monkeypatch):
    from pipeline.variants import criar_variacao
    jobs_root, m = _matriz_pronta(tmp_path)
    (m.dir / "overlays.json").unlink()
    (m.dir / "suggestions.json").unlink()
    (m.dir / "suggest-defaults.json").unlink()
    _variacao_falsa(monkeypatch)
    (tmp_path / "hook.mov").write_bytes(b"hook bruto")
    criar_variacao(m.dir, jobs_root, "corpo-h3", str(tmp_path / "hook.mov"))
    v = jobs_root / "corpo-h3"
    assert not (v / "overlays.json").exists()
    assert (v / "transcript.json").exists()
```

- [ ] **Step 2: Rodar e ver falhar** — ImportError de `criar_variacao`.

- [ ] **Step 3: Implementar** (acrescentar em `pipeline/variants.py`)

```python
import shutil
import logging
from pathlib import Path

from pipeline.job import init_job, write_json, load_json
from pipeline.probe import probe_video
from pipeline.silence import detect_silences, compute_kept_segments, cut_segments, build_scale_filter
from pipeline.transcribe import transcribe_audio
from pipeline.concat import _probe_stream_info, _signature, _normalize_clip, _try_copy_concat, _display_dims

logger = logging.getLogger(__name__)


def _concat_hook_e_corpo(hook: str, corpo: str, dest: str) -> None:
    """Concatena SEM tocar no corpo: assinaturas iguais → copy direto; senão
    normaliza SÓ o hook para os parâmetros do corpo e tenta de novo. O corpo
    da matriz nunca é re-encodado — é a promessa central da abordagem A."""
    ih, ic = _probe_stream_info(hook), _probe_stream_info(corpo)
    if _signature(ih) == _signature(ic) and _try_copy_concat([hook, corpo], dest):
        return
    logger.warning("hook difere do corpo (%s vs %s): normalizando só o hook",
                   _signature(ih), _signature(ic))
    w, h = _display_dims(ic)
    normalizado = str(Path(dest).with_suffix(".hooknorm.mp4"))
    try:
        _normalize_clip(hook, normalizado, w, h, ic["fps"], ih["has_audio"])
        if not _try_copy_concat([normalizado, corpo], dest):
            raise RuntimeError("concat do hook normalizado com o corpo falhou")
    finally:
        Path(normalizado).unlink(missing_ok=True)


def criar_variacao(matriz_dir: Path, jobs_root: Path, novo_slug: str,
                   hook_path: str, progress_cb=None) -> None:
    """Cria jobs_root/novo_slug a partir da matriz + clipe de hook.

    Qualquer falha remove o diretório da variação (rollback): nenhum projeto
    meio-nascido aparece na lista. A rota valida ANTES (papel, trimmed,
    transcript, colisão) — aqui é só execução."""
    matriz_cfg = load_json(matriz_dir / "job.config.json")
    corpo = matriz_dir / "trimmed.mp4"
    corpo_probe = load_json(matriz_dir / "trimmed.probe.json")

    var = init_job(jobs_root, novo_slug)
    try:
        # 1. corta as pausas do hook com os sliders da matriz
        hook_cortado = var.dir / "hook_trimmed.tmp.mp4"
        silencios = detect_silences(hook_path,
                                    matriz_cfg.get("silence_threshold_db", -30.0),
                                    matriz_cfg.get("min_silence", 0.5))
        hook_meta = probe_video(hook_path)
        kept = compute_kept_segments(silencios, hook_meta.duration,
                                     matriz_cfg.get("padding", 0.1),
                                     matriz_cfg.get("min_segment", 0.3))
        scale = build_scale_filter(hook_meta.width, hook_meta.height)
        cut_segments(hook_path, kept, str(hook_cortado),
                     total_duration=sum(s.duration for s in kept),
                     progress_cb=progress_cb, scale=scale)
        delta = probe_video(str(hook_cortado)).duration  # do probe, nunca estimado

        # 2. compõe o trimmed da variação (corpo intocado)
        _concat_hook_e_corpo(str(hook_cortado), str(corpo), str(var.dir / "trimmed.mp4"))
        composto = probe_video(str(var.dir / "trimmed.mp4"))
        write_json(var.dir / "trimmed.probe.json",
                   {"width": composto.width, "height": composto.height,
                    "fps": composto.fps, "duration": composto.duration,
                    "nb_frames": composto.nb_frames})
        # cuts.json sintético: o passo de Cortes remonta player e cortes manuais
        write_json(var.dir / "cuts.json", [{"start": 0, "end": composto.duration}])

        # 3. transcreve SÓ o hook e funde com o corpo deslocado
        hook_words = transcribe_audio(str(hook_cortado),
                                      matriz_cfg.get("whisper_model", "base"),
                                      matriz_cfg.get("language", "pt"),
                                      progress_cb=progress_cb)
        corpo_transcript = load_json(matriz_dir / "transcript.json")
        write_json(var.dir / "transcript.json",
                   fundir_transcricoes(hook_words, corpo_transcript, delta))

        # 4. textos e sugestões deslocados; defaults copiados; hook.json NÃO
        #    é criado — o texto é o que o usuário vai digitar
        fps = composto.fps
        for nome in ("overlays.json", "suggestions.json"):
            origem = matriz_dir / nome
            if origem.exists():
                write_json(var.dir / nome, deslocar_overlays(load_json(origem), delta, fps))
        if (matriz_dir / "suggest-defaults.json").exists():
            shutil.copy(matriz_dir / "suggest-defaults.json", var.dir / "suggest-defaults.json")

        # 5. config herdado da matriz + identidade da variação
        cfg = dict(matriz_cfg)
        sufixo = novo_slug.removeprefix(matriz_dir.name).lstrip("-") or novo_slug
        cfg.update({
            "papel": "normal",
            "origem_matriz": matriz_dir.name,
            "title": f"{matriz_cfg.get('title') or matriz_dir.name} {sufixo}".strip(),
        })
        write_json(var.dir / "job.config.json", cfg)

        hook_cortado.unlink(missing_ok=True)
        Path(hook_path).unlink(missing_ok=True)
    except Exception:
        # rollback: nada meio-nascido na lista
        shutil.rmtree(var.dir, ignore_errors=True)
        raise
```

- [ ] **Step 4: Rodar** — `python3 -m pytest tests/test_variants.py -q` → verde; suíte `tests/` inteira verde.

- [ ] **Step 5: Commit** — `git add pipeline/variants.py tests/test_variants.py && git commit -m "feat(variants): criar_variacao — corte do hook, concat sem tocar o corpo, fusão e rollback"`

---

### Task 4: Rota `POST /api/jobs/{slug}/variants` (SSE)

**Files:**
- Modify: `api/routes.py`
- Test: `api/tests/test_variants_routes.py` (novo; fixtures `client`/`tmp_root` do conftest, padrão dos arquivos vizinhos)

- [ ] **Step 1: Testes que falham**

```python
"""Rota de variações: validações ANTES de gravar, SSE no happy path,
rollback quando o pipeline estoura no meio."""
import json
from pathlib import Path

from pipeline.job import write_json, load_json


def _matriz(tmp_root, slug="corpo", papel="matriz", com_transcript=True):
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True)
    write_json(d / "job.config.json", {"papel": papel, "title": "Corpo"})
    (d / "trimmed.mp4").write_bytes(b"corpo")
    write_json(d / "trimmed.probe.json",
               {"width": 1080, "height": 1920, "fps": 30.0, "duration": 8.0, "nb_frames": 240})
    if com_transcript:
        write_json(d / "transcript.json", [])
    return d


def _post(client, slug, novo="corpo-h1"):
    return client.post(f"/api/jobs/{slug}/variants",
                       data={"novo_slug": novo},
                       files=[("file", ("hook.mov", b"hook bruto", "video/quicktime"))])


def test_variacao_de_projeto_normal_e_409(client, tmp_root):
    _matriz(tmp_root, papel="normal")
    r = _post(client, "corpo")
    assert r.status_code == 409
    assert "matriz" in r.json()["detail"]


def test_variacao_de_matriz_sem_transcript_e_409(client, tmp_root):
    _matriz(tmp_root, com_transcript=False)
    r = _post(client, "corpo")
    assert r.status_code == 409
    assert "transcreva" in r.json()["detail"]


def test_variacao_de_matriz_inexistente_e_404(client, tmp_root):
    assert _post(client, "nunca-existiu").status_code == 404


def test_variacao_com_nome_colidindo_e_409(client, tmp_root):
    _matriz(tmp_root)
    ocupado = tmp_root / "jobs" / "corpo-h1"
    ocupado.mkdir()
    write_json(ocupado / "job.config.json", {})
    (ocupado / "transcript.json").write_text("[]", encoding="utf-8")
    r = _post(client, "corpo")
    assert r.status_code == 409


def test_variacao_happy_path_cria_e_devolve_o_slug(client, tmp_root, monkeypatch):
    _matriz(tmp_root)
    import api.routes as routes
    def fake_criar(matriz_dir, jobs_root, novo_slug, hook_path, progress_cb=None):
        d = Path(jobs_root) / novo_slug
        d.mkdir(parents=True, exist_ok=True)
        write_json(d / "job.config.json", {"origem_matriz": "corpo"})
        assert Path(hook_path).exists(), "o upload precisa estar salvo antes do pipeline"
    monkeypatch.setattr(routes, "criar_variacao", fake_criar)

    r = _post(client, "corpo")
    assert r.status_code == 200
    corpo_resposta = r.text
    assert '"slug": "corpo-h1"' in corpo_resposta.replace("'", '"') or "corpo-h1" in corpo_resposta


def test_variacao_com_erro_no_pipeline_vira_evento_error(client, tmp_root, monkeypatch):
    _matriz(tmp_root)
    import api.routes as routes
    def explode(*a, **k): raise RuntimeError("ffmpeg caiu")
    monkeypatch.setattr(routes, "criar_variacao", explode)
    r = _post(client, "corpo")
    assert r.status_code == 200          # SSE já abriu; o erro vai no stream
    assert "ffmpeg caiu" in r.text
```

- [ ] **Step 2: Rodar e ver falhar** — 404 (rota inexistente) em todos.

- [ ] **Step 3: Implementar** (em `api/routes.py`, junto das outras rotas de jobs; import `from pipeline.variants import criar_variacao`)

```python
@router.post("/jobs/{slug}/variants")
async def create_variant(slug: str, novo_slug: str = Form(...),
                         file: UploadFile = File(...)):
    """Variação de hook (spec 2026-08-01): valida tudo ANTES de gravar
    qualquer byte; o pipeline roda com progresso SSE e faz rollback sozinho."""
    jobs_root, *_ = _roots()
    matriz_dir = _dir_do_job(slug, jobs_root)
    if not matriz_dir.is_dir():
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    cfg = load_json(matriz_dir / "job.config.json") if (matriz_dir / "job.config.json").exists() else {}
    if cfg.get("papel") != "matriz":
        raise HTTPException(status_code=409,
                            detail="este projeto não é uma matriz de variações de hook")
    if not (matriz_dir / "trimmed.mp4").exists() or not (matriz_dir / "transcript.json").exists():
        raise HTTPException(status_code=409,
                            detail="transcreva o corpo antes de criar variações")
    var_dir = _dir_do_job(novo_slug, jobs_root)
    if tem_trabalho(var_dir):
        raise HTTPException(status_code=409,
                            detail=f"já existe um projeto '{novo_slug}' com trabalho salvo")

    # o upload entra DENTRO do diretório da variação: o rollback de
    # criar_variacao (rmtree) limpa o clipe junto em caso de falha
    var_dir.mkdir(parents=True, exist_ok=True)
    sufixo = Path(file.filename or "").suffix or ".mp4"
    hook_path = var_dir / f"hook_upload{sufixo}"
    with hook_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    def work(progress_cb):
        criar_variacao(matriz_dir, jobs_root, novo_slug, str(hook_path),
                       progress_cb=progress_cb)
        return {"slug": novo_slug}

    return StreamingResponse(run_with_progress(work), media_type="text/event-stream")
```

Nota: `criar_variacao` chama `init_job` (idempotente — o diretório já existe) e remove `hook_upload*` no cleanup/rollback.

- [ ] **Step 4: Rodar** — arquivo novo verde; `python3 -m pytest -q` inteiro verde; `ruff check api/routes.py` sem achado novo.

- [ ] **Step 5: Commit** — `git add api/routes.py api/tests/test_variants_routes.py && git commit -m "feat(api): POST /jobs/{slug}/variants — validações, SSE e upload dentro do rollback"`

---

### Task 5: Front — tipos e API

**Files:**
- Modify: `web/src/types.ts` (JobSummary/JobState), `web/src/api.ts`
- Test: `web/src/__tests__/api.test.ts`

- [ ] **Step 1: Testes que falham** (seguir o padrão de mocks de fetch do arquivo)

```ts
it("uploadJob manda o papel quando informado", async () => {
  // inspecionar o FormData do fetch mockado: papel === "matriz"
});
it("createVariant posta multipart em /variants via streamSSE", async () => {
  // streamSSE chamado com /api/jobs/corpo/variants, body FormData com file e novo_slug
});
```

(Escrever no padrão real do arquivo — ele já mocka `fetch`/`streamSSE`; asserts: URL correta, FormData contém `papel`/`novo_slug`/`file`.)

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar**

`types.ts` — em `JobSummary` e `JobState`:

```ts
  papel: "normal" | "matriz";
  origem_matriz: string;
```

`api.ts` — `uploadJob` ganha o 4º parâmetro:

```ts
export async function uploadJob(
  files: File[], slug: string, overwrite = false, papel: "normal" | "matriz" = "normal",
): Promise<{ slug: string; probe: any }> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("slug", slug);
  fd.append("overwrite", String(overwrite));
  fd.append("papel", papel);
  // ... (resto idêntico)
```

E a nova função:

```ts
export function createVariant(
  slug: string, file: File, novoSlug: string,
  handlers: Parameters<typeof streamSSE>[2],
) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("novo_slug", novoSlug);
  return streamSSE(`/api/jobs/${slug}/variants`, { method: "POST", body: fd }, handlers);
}
```

- [ ] **Step 4: Rodar** — `npm test --prefix web -- api` verde; tsc na baseline (os testes/telas que montam `JobSummary` fixture precisam dos campos novos — atualizar fixtures onde o tsc/testes apontarem, ex.: `ProjectsScreen.test.tsx` `const projeto`).

- [ ] **Step 5: Commit** — `git add web/src/types.ts web/src/api.ts web/src/__tests__/api.test.ts web/src/__tests__/ProjectsScreen.test.tsx && git commit -m "feat(web): papel/origem_matriz nos tipos, uploadJob(papel) e createVariant"`

---

### Task 6: Front — toggle de matriz no Upload

**Files:**
- Modify: `web/src/steps/UploadStep.tsx`
- Test: `web/src/__tests__/UploadStep.test.tsx`

- [ ] **Step 1: Teste que falha**

```tsx
it("com o toggle de matriz marcado, o upload manda papel=matriz", async () => {
  // renderiza, marca o checkbox "Matriz de variações de hook", seleciona
  // arquivo, envia; assert uploadJob chamado com papel === "matriz"
  // (uploadJob já é mockado no topo do arquivo — inspecionar mock.calls)
});
it("sem o toggle, o upload continua normal", async () => {
  // envia sem marcar; uploadJob chamado com papel === "normal" (ou sem o arg)
});
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar** — estado `const [matriz, setMatriz] = useState(false);` + checkbox acima do botão de envio:

```tsx
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={matriz} onChange={(e) => setMatriz(e.target.checked)} />
        Matriz de variações de hook (só o corpo, sem hook falado)
      </label>
```

E na chamada existente: `uploadJob(files, alvo, overwrite, matriz ? "matriz" : "normal")`.

- [ ] **Step 4: Rodar + Step 5: Commit** — `feat(web): toggle de matriz no upload`

---

### Task 7: Front — wizard por papel + `onOpen(slug, step?)` + `nextLabel`

**Files:**
- Modify: `web/src/App.tsx` (StepProps), `web/src/RecordedWizard.tsx`, `web/src/steps/OverlaysStep.tsx`, `web/src/ProjectsScreen.tsx` (assinatura do onOpen)
- Test: `web/src/__tests__/RecordedWizard.test.tsx`

- [ ] **Step 1: Testes que falham**

```tsx
it("projeto matriz mostra só Upload/Cortes/Transcrição/Textos", async () => {
  // getJob mock com papel: "matriz"; abre com slug; stepper NÃO tem "Hook" nem "Render"
});
it("no último passo da matriz, o botão vira Concluir e volta à lista", async () => {});
it("abrir com passo inicial cai direto no passo pedido", async () => {
  // onOpen("corpo-h1", 3) → passo Hook ativo
});
```

(Seguir os mocks existentes do arquivo — ele já monta o wizard com api mockada.)

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar**

`App.tsx` — `StepProps` ganha `nextLabel?: string;`.

`OverlaysStep.tsx` — o botão "Próximo →" do rodapé usa `{nextLabel ?? "Próximo →"}` (prop nova desestruturada).

`RecordedWizard.tsx`:

```tsx
  const [papel, setPapel] = useState<"normal" | "matriz">("normal");
  // papel vem do servidor (sobrevive a reload no meio de uma matriz)
  useEffect(() => {
    if (!slug) { setPapel("normal"); return; }
    let vivo = true;
    getJob(slug).then((j) => { if (vivo && j?.papel) setPapel(j.papel); }).catch(() => {});
    return () => { vivo = false; };
  }, [slug]);

  const NORMAL: [React.ComponentType<StepProps>[], readonly string[]] =
    [[UploadStep, CutsStep, TranscriptStep, HookStep, OverlaysStep, RenderStep],
     ["Upload", "Cortes", "Transcrição", "Hook", "Textos", "Render"]];
  const MATRIZ: [React.ComponentType<StepProps>[], readonly string[]] =
    [[UploadStep, CutsStep, TranscriptStep, OverlaysStep],
     ["Upload", "Cortes", "Transcrição", "Textos"]];
  const [Steps, labels] = papel === "matriz" ? MATRIZ : NORMAL;
  const ultimo = Steps.length - 1;
  const next = () => setStep((s) => Math.min(ultimo, s + 1));
```

- `<Stepper step={step} onJump={setStep} labels={labels} />`
- No passo final da matriz: `<Current ... next={voltarParaLista} nextLabel="Concluir" />` (condicional `papel === "matriz" && step === ultimo`).
- `onOpen` passa a `(s: string, stepInicial = 0) => { setSlug(s); setStep(stepInicial); }` e `ProjectsScreen` tipa `onOpen: (slug: string, step?: number) => void`.
- Guarda: `useEffect(() => { if (step > ultimo) setStep(ultimo); }, [ultimo, step]);` (troca de papel após fetch não pode deixar o índice fora da lista).

- [ ] **Step 4: Rodar** — wizard + suíte inteira verde.

- [ ] **Step 5: Commit** — `feat(web): wizard curto para matriz, Concluir no fim e abertura em passo específico`

---

### Task 8: Front — badge + diálogo "Nova variação" na lista

**Files:**
- Modify: `web/src/ProjectsScreen.tsx`
- Test: `web/src/__tests__/ProjectsScreen.test.tsx`

- [ ] **Step 1: Testes que falham**

```tsx
it("matriz mostra badge e o botão Nova variação", async () => {
  // listJobs com { ...projeto, papel: "matriz" } → badge "matriz" + botão;
  // projeto normal NÃO tem o botão
});
it("o diálogo sugere o menor nome livre corpo-h1, corpo-h2…", async () => {
  // lista com "corpo" (matriz) e "corpo-h1" existente → sugestão "corpo-h2"
});
it("confirmar cria a variação e abre no passo do hook", async () => {
  // createVariant mockado emitindo done {slug}; assert onOpen("corpo-h2", 3)
});
it("erro 409 no createVariant mantém o diálogo aberto com a mensagem", async () => {});
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar** — componente local `NovaVariacaoDialog` (padrão `ConfirmarLiberar`: `useAlertDialog`, `aria-modal`, progresso):

```tsx
const NovaVariacaoDialog: React.FC<{
  matriz: JobSummary;
  sugestao: string;                     // menor "<slug>-h<N>" livre, calculado pelo pai
  onCriada: (slug: string) => void;     // pai chama onOpen(slug, HOOK_STEP)
  onDesistir: () => void;
}> = ({ matriz, sugestao, onCriada, onDesistir }) => {
  const [nome, setNome] = useState(sugestao);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [criando, setCriando] = useState(false);
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useAlertDialog<HTMLDivElement>(onDesistir, criando);

  const criar = async () => {
    if (!arquivo || !nome.trim()) return;
    setCriando(true); setErro(null);
    try {
      await createVariant(matriz.slug, arquivo, nome.trim(), {
        progress: (d) => { if (d.n != null && d.total != null) setProg({ n: d.n, total: d.total }); },
        done: (d) => onCriada(d.slug ?? nome.trim()),
        error: (d) => setErro(d.detail ?? "erro ao criar a variação"),
      });
    } catch (e: any) { setErro(e.message); }
    finally { setCriando(false); setProg(null); }
  };
  // JSX: file input, input de nome (editável), erro em vermelho,
  // ProgressBar quando prog, botões "Criar variação" (disabled sem arquivo/
  // nome ou criando) e "Desistir" (disabled criando)
};
```

No pai: `const HOOK_STEP = 3;` — sugestão de nome:

```tsx
const sugerirNomeVariacao = (matriz: string, existentes: string[]): string => {
  for (let n = 1; ; n++) {
    const cand = `${matriz}-h${n}`;
    if (!existentes.includes(cand)) return cand;
  }
};
```

Badge na linha: `{j.papel === "matriz" && <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-900 text-indigo-200">matriz</span>}`; botão "Nova variação" só com `j.papel === "matriz"` (`aria-label={`nova variação de ${j.slug}`}`), entra no `Modo` existente (`tipo: "variando"`). `onCriada` → `onOpen(slug, HOOK_STEP)`. Export `sugerirNomeVariacao` para teste unitário direto.

- [ ] **Step 4: Rodar + Step 5: Commit** — `feat(web): Nova variação na tela de projetos — diálogo, sugestão de nome e abertura no hook`

---

### Task 9: Front — mensagem correta no Cortes da variação

**Files:**
- Modify: `web/src/steps/CutsStep.tsx`
- Test: `web/src/__tests__/CutsStep.test.tsx`

- [ ] **Step 1: Teste que falha**

```tsx
it("variação sem source explica a origem, não fala em liberar espaço", async () => {
  getJob.mockResolvedValueOnce({
    config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
    has_source: false, origem_matriz: "corpo",
  } as any);
  getCuts.mockResolvedValueOnce({
    original_duration: 10, trimmed_duration: 10,
    segments: [{ start: 0, end: 10 }], trimmed_mtime: 5,
  } as any);
  render(<CutsStep {...props} />);
  expect(await screen.findByText(/nasce.*montad/i)).toBeInTheDocument();
  expect(screen.queryByText(/liberar espaço/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Ver falhar.**

- [ ] **Step 3: Implementar** — novo estado `const [origemMatriz, setOrigemMatriz] = useState("");` populado no `getJob` (`setOrigemMatriz(j?.origem_matriz ?? "")`). No aviso de `!temSource`, novo primeiro ramo:

```tsx
          {origemMatriz ? (
            <>
              Esta variação já nasce cortada e montada a partir da matriz{" "}
              <strong>{origemMatriz}</strong> — não há vídeo original para
              re-detectar pausas. Os cortes manuais continuam funcionando.
            </>
          ) : result ? (
            /* ramos existentes inalterados */
```

- [ ] **Step 4: Rodar + Step 5: Commit** — `fix(web): variação explica a origem no passo de Cortes`

---

### Task 10: Paridade de legendas + verificação final e deploy

**Files:**
- Test: `tests/test_variants.py` (paridade)
- Modify: nada além do que os passos pedirem

- [ ] **Step 1: Teste de paridade (golden de integração)**

```python
def test_paridade_captions_da_variacao_sao_as_da_matriz_deslocadas():
    """Legenda da variação = legenda da matriz deslocada por delta, medida no
    produto final (frames da recipe do Remotion), não na transcrição
    intermediária. build_recipe é keyword-only (ver pipeline/recipe.py:88)."""
    from pipeline.recipe import build_recipe
    from pipeline.variants import fundir_transcricoes
    fps = 30.0
    delta = 3.2
    base = dict(width=1080, height=1920, fps=fps,
                hook={"title": "", "subtitle": ""}, hook_card_frames=0)

    palavras_corpo = [{"word": "corpo", "start": 1.0, "end": 2.0}]
    r_matriz = build_recipe(trimmed_duration=8.0, words=palavras_corpo, **base)

    fundida = fundir_transcricoes([_linha("oi", 0.0, 0.8)],
                                  [_linha("corpo", 1.0, 2.0)], delta)
    palavras_fundidas = [w for linha in fundida for w in linha["words"]]
    r_var = build_recipe(trimmed_duration=8.0 + delta, words=palavras_fundidas, **base)

    # o gap hook→corpo (0.8s vs 4.2s) é maior que max_gap (0.6s), então o
    # corpo vira caption própria nas duas recipes — comparável 1:1
    assert (r_var["captions"][-1]["fromFrame"] - r_matriz["captions"][0]["fromFrame"]
            == round(delta * fps))
```

- [ ] **Step 2: Suítes completas**

`python3 -m pytest -q` e `npm test --prefix web` → tudo verde; `cd web && npx tsc --noEmit -p tsconfig.json` → só os 5 de baseline; `ruff check api/ pipeline/` → nenhum achado novo.

- [ ] **Step 3: Build + deploy local**

```bash
npm run build --prefix web
rm -rf api/static/assets && cp -R web/dist/. api/static/
# reiniciar o uvicorn SÓ com autorização do usuário se ele estiver editando
```

- [ ] **Step 4: Commit final e push**

```bash
git add -A && git commit -m "test(variants): paridade de legendas da variação"
git push origin main
```
