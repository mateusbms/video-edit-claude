# Edição escopada da variação (re-corte do hook) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a variação editável no escopo do hook — re-cortar só o silêncio do hook dentro da variação, transcrever só o hook, e travar a herança de estilo/CTA — corrigindo de carona o hook fantasma no preview da matriz.

**Architecture:** O núcleo "compõe hook + corpo da matriz" de `criar_variacao` vira uma função reutilizável `_compor_variacao`, chamada tanto na criação quanto num novo `recompor_hook`. A variação passa a guardar o clipe bruto do hook (`hook_source.mp4`) e a fronteira do hook na transcrição (`hook_linhas`). Uma nova rota SSE `POST /jobs/{slug}/recut-hook` re-corta lendo o corpo da matriz na hora (variação continua renderizável sem a matriz, mas o re-corte fica indisponível se a matriz sumir). O front ganha "modo hook" no passo Cortes, transcrição escopada ao hook, e dois consertos de carona no passo Textos.

**Tech Stack:** Python 3 / FastAPI / ffmpeg (backend, pytest); React + TypeScript / Vite (front, vitest + Testing Library).

---

## Decisões de design travadas neste plano

- **`_compor_variacao` sempre lê a BASE da matriz** (`trimmed.mp4`, `transcript.json`, `overlays.json`, `suggestions.json` da matriz), nunca os artefatos já deslocados da variação. Isso elimina drift por construção: re-cortes sucessivos deslocam sempre a base pelo delta corrente, sem compor deltas.
- **`_compor_variacao` passa a escrever `probe.json`** (= probe do composto), além de `trimmed.probe.json`. Motivo: `cut_result` (api/jobs.py) exige `probe.json` para devolver um `CutResult`; sem ele, o passo Cortes da variação não mostra vídeo nem cortes manuais e o re-corte não teria card de resultado para renderizar. A variação não tem `source.mp4`; o "original" para efeito de edição é o próprio composto. `has_source` continua olhando só `source.mp4`, então isso NÃO reabilita "Detectar pausas" normal nem muda `bytes_source`.
- **Preservar o hook bruto renomeando o upload** (`Path(hook_path).replace(var/"hook_source.mp4")`), em vez de copiar — sem custo de disco extra além do arquivo em si (que o spec aceita em `bytes_total`).
- **Invalidação do re-corte = `DERIVADOS_DO_TRIMMED`.** `recompor_hook` apaga esses arquivos e `_compor_variacao` re-escreve os de conteúdo a partir da base; sobra só `edit-recipe.json` apagado. `hook.json` (texto do hook digitado no passo Textos/Hook) sobrevive de propósito — não é sincronizado com a timeline, igual ao `stage_cut`.
- **Nº do passo Textos e hook fantasma** derivam de `papel` (já buscado via `getJob` no `OverlaysStep`) — sem prop nova no wizard.
- **Fora deste plano (nota):** o passo de landing de uma variação recém-criada continua `HOOK_STEP` (3). A "ordem natural" citada no spec é justificativa da invalidação, não um requisito de mudar o landing — deixado como possível ajuste futuro.

## Estrutura de arquivos

**Backend**
- `pipeline/variants.py` — extrair `_compor_variacao`; adicionar `recompor_hook`; `criar_variacao` preserva `hook_source.mp4` e grava `hook_linhas`. (modificar)
- `pipeline/job.py` — `JobConfig.hook_linhas: int = 0`. (modificar)
- `api/models.py` — `JobState`: `has_hook_source`, `hook_linhas`, `matriz_disponivel`. (modificar)
- `api/jobs.py` — `matriz_do_recut()`; `get_state` preenche os 3 campos novos. (modificar)
- `api/routes.py` — rota `POST /jobs/{slug}/recut-hook`. (modificar)
- `tests/test_variants.py` — atualizar goldens; testes de `_compor_variacao`/`recompor_hook`/paridade. (modificar)
- `api/tests/test_variants_routes.py` — testes da rota `/recut-hook`. (modificar)

**Front**
- `web/src/types.ts` — `JobState` espelha os 3 campos novos. (modificar)
- `web/src/api.ts` — cliente `recutHook`. (modificar)
- `web/src/steps/CutsStep.tsx` — "modo hook". (modificar)
- `web/src/steps/TranscriptStep.tsx` — transcrição escopada ao hook. (modificar)
- `web/src/steps/OverlaysStep.tsx` — sem hook na matriz + nº do heading. (modificar)
- `web/src/__tests__/CutsStep.test.tsx`, `OverlaysStep.test.tsx`, `TranscriptStep.test.tsx` — cobertura. (modificar)

---

## Task 1: Extrair `_compor_variacao` (refator sem mudança de comportamento na criação)

**Files:**
- Modify: `pipeline/variants.py:75-146`
- Modify: `pipeline/job.py:6-29`
- Test: `tests/test_variants.py`

- [ ] **Step 1: Adicionar `hook_linhas` ao `JobConfig`**

Em `pipeline/job.py`, dentro do dataclass `JobConfig`, logo após `origem_matriz: str = ""`:

```python
    origem_matriz: str = ""
    # nº de linhas iniciais de transcript.json que são do hook (fronteira do
    # delta), para o passo Transcrição da variação editar só o hook. 0 = projeto
    # normal/matriz (transcrição inteira).
    hook_linhas: int = 0
```

- [ ] **Step 2: Escrever o teste do refator (mesma saída da criação + novos artefatos)**

Em `tests/test_variants.py`, substituir o corpo de `test_criar_variacao_monta_o_projeto_completo` (linhas 90-119) por esta versão — assere o que já valia, mais `hook_source.mp4`, `probe.json` e `hook_linhas`:

```python
def test_criar_variacao_monta_o_projeto_completo(tmp_path, monkeypatch):
    from pipeline.variants import criar_variacao
    jobs_root, m = _matriz_pronta(tmp_path)
    _variacao_falsa(monkeypatch)
    (tmp_path / "hook.mov").write_bytes(b"hook bruto")

    criar_variacao(m.dir, jobs_root, "corpo-h1", str(tmp_path / "hook.mov"))

    v = jobs_root / "corpo-h1"
    assert (v / "trimmed.mp4").read_bytes() == b"composto"
    assert not (v / "source.mp4").exists()                       # sem source, de propósito
    assert (v / "hook_source.mp4").read_bytes() == b"hook bruto"  # clipe bruto preservado
    probe = load_json(v / "trimmed.probe.json")
    assert probe["duration"] == 11.2
    assert load_json(v / "probe.json")["duration"] == 11.2        # probe.json = composto
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
    assert cfg["hook_linhas"] == 1                               # 1 linha de hook (fake transcribe)
    # temporário do corte de hook limpo; hook_source.mp4 permanece
    assert not (v / "hook_trimmed.tmp.mp4").exists()
```

- [ ] **Step 3: Rodar o teste e vê-lo falhar**

Run: `pytest tests/test_variants.py::test_criar_variacao_monta_o_projeto_completo -q`
Expected: FAIL (hoje não há `hook_source.mp4`, `probe.json` nem `hook_linhas`).

- [ ] **Step 4: Extrair `_compor_variacao` e reescrever `criar_variacao`**

Em `pipeline/variants.py`, substituir toda a função `criar_variacao` (linhas 75-146) por estas duas funções:

```python
def _compor_variacao(var_dir: Path, matriz_dir: Path, hook_source: str,
                     cfg: dict, progress_cb=None) -> int:
    """Núcleo compartilhado por criar_variacao e recompor_hook.

    Corta o hook bruto (hook_source) com os sliders de `cfg`, compõe com o corpo
    INTOCADO da matriz, transcreve só o hook e funde/desloca os artefatos a
    partir da BASE da matriz (transcript/overlays/suggestions da matriz, nunca
    dos já deslocados da variação — evita drift em re-cortes sucessivos).

    Escreve em var_dir: trimmed.mp4, trimmed.probe.json, probe.json, cuts.json,
    transcript.json e (se a matriz tiver) overlays.json/suggestions.json/
    suggest-defaults.json. NÃO mexe em job.config.json nem preserva hook_source
    — isso é responsabilidade de cada caller.

    Devolve hook_linhas: quantas linhas iniciais de transcript.json são do hook.
    """
    corpo = matriz_dir / "trimmed.mp4"
    hook_cortado = var_dir / "hook_trimmed.tmp.mp4"
    try:
        # 1. corta as pausas do hook com os sliders de cfg
        silencios = detect_silences(hook_source,
                                    cfg.get("silence_threshold_db", -30.0),
                                    cfg.get("min_silence", 0.5))
        hook_meta = probe_video(hook_source)
        kept = compute_kept_segments(silencios, hook_meta.duration,
                                     cfg.get("padding", 0.1),
                                     cfg.get("min_segment", 0.3))
        scale = build_scale_filter(hook_meta.width, hook_meta.height)
        cut_segments(hook_source, kept, str(hook_cortado),
                     total_duration=sum(s.duration for s in kept),
                     progress_cb=progress_cb, scale=scale)
        delta = probe_video(str(hook_cortado)).duration  # do probe, nunca estimado

        # 2. compõe o trimmed da variação (corpo intocado)
        _concat_hook_e_corpo(str(hook_cortado), str(corpo), str(var_dir / "trimmed.mp4"))
        composto = probe_video(str(var_dir / "trimmed.mp4"))
        probe_dict = {"width": composto.width, "height": composto.height,
                      "fps": composto.fps, "duration": composto.duration,
                      "nb_frames": composto.nb_frames}
        write_json(var_dir / "trimmed.probe.json", probe_dict)
        # probe.json = probe do composto: cut_result exige probe.json para o
        # passo Cortes remontar o preview e os cortes manuais sobre o composto,
        # e o passo Textos lê fps/duração daqui. A variação não tem source.mp4.
        write_json(var_dir / "probe.json", probe_dict)
        # cuts.json sintético: o passo de Cortes remonta player e cortes manuais
        write_json(var_dir / "cuts.json", [{"start": 0, "end": composto.duration}])

        # 3. transcreve SÓ o hook e funde com o corpo deslocado
        hook_words = transcribe_audio(str(hook_cortado),
                                      cfg.get("whisper_model", "base"),
                                      cfg.get("language", "pt"),
                                      progress_cb=progress_cb)
        corpo_transcript = load_json(matriz_dir / "transcript.json")
        write_json(var_dir / "transcript.json",
                   fundir_transcricoes(hook_words, corpo_transcript, delta))

        # 4. textos e sugestões deslocados A PARTIR DA BASE DA MATRIZ; defaults
        #    copiados; hook.json NÃO é criado — o texto é o que o usuário digita
        fps = composto.fps
        for nome in ("overlays.json", "suggestions.json"):
            origem = matriz_dir / nome
            if origem.exists():
                write_json(var_dir / nome, deslocar_overlays(load_json(origem), delta, fps))
        if (matriz_dir / "suggest-defaults.json").exists():
            shutil.copy(matriz_dir / "suggest-defaults.json", var_dir / "suggest-defaults.json")

        return len(hook_words)
    finally:
        hook_cortado.unlink(missing_ok=True)


def criar_variacao(matriz_dir: Path, jobs_root: Path, novo_slug: str,
                   hook_path: str, progress_cb=None) -> None:
    """Cria jobs_root/novo_slug a partir da matriz + clipe de hook.

    Qualquer falha remove o diretório da variação (rollback): nenhum projeto
    meio-nascido aparece na lista. A rota valida ANTES (papel, trimmed,
    transcript, colisão) — aqui é só execução."""
    matriz_cfg = load_json(matriz_dir / "job.config.json")

    var = init_job(jobs_root, novo_slug)
    try:
        # preserva o clipe bruto do hook para re-corte futuro (edição escopada):
        # renomear em vez de copiar não gasta disco a mais além do arquivo em si
        hook_source = var.dir / "hook_source.mp4"
        Path(hook_path).replace(hook_source)

        hook_linhas = _compor_variacao(var.dir, matriz_dir, str(hook_source),
                                       matriz_cfg, progress_cb=progress_cb)

        # config herdado da matriz + identidade da variação + fronteira do hook
        cfg = dict(matriz_cfg)
        sufixo = novo_slug.removeprefix(matriz_dir.name).lstrip("-") or novo_slug
        cfg.update({
            "papel": "normal",
            "origem_matriz": matriz_dir.name,
            "title": f"{matriz_cfg.get('title') or matriz_dir.name} {sufixo}".strip(),
            "hook_linhas": hook_linhas,
        })
        write_json(var.dir / "job.config.json", cfg)
    except Exception:
        # rollback: nada meio-nascido na lista
        shutil.rmtree(var.dir, ignore_errors=True)
        raise
```

- [ ] **Step 5: Rodar o teste e vê-lo passar**

Run: `pytest tests/test_variants.py::test_criar_variacao_monta_o_projeto_completo -q`
Expected: PASS.

- [ ] **Step 6: Rodar a suíte de variants inteira (garantir que nada quebrou)**

Run: `pytest tests/test_variants.py -q`
Expected: PASS (o rollback, o "sem overlays", e os `_concat_*` continuam valendo — nenhum tocou nas assinaturas mexidas).

- [ ] **Step 7: Commit**

```bash
git add pipeline/variants.py pipeline/job.py tests/test_variants.py
git commit -m "refactor(variants): extrai _compor_variacao e preserva hook_source + hook_linhas"
```

---

## Task 2: `recompor_hook` — re-corte a partir da base da matriz, sem drift

**Files:**
- Modify: `pipeline/variants.py` (novo `recompor_hook` + import de `DERIVADOS_DO_TRIMMED`)
- Test: `tests/test_variants.py`

- [ ] **Step 1: Escrever o teste de "sem drift após dois re-cortes com deltas diferentes"**

Adicionar em `tests/test_variants.py`. Este helper varia o delta entre chamadas (o delta vem do probe do hook cortado):

```python
def _variacao_falsa_deltas(monkeypatch, deltas, dur_composto=11.2):
    """Como _variacao_falsa, mas o hook cortado tem duração de `deltas` em
    sequência (um valor consumido por chamada de probe do hook cortado)."""
    from pipeline import variants

    class _Meta:
        width, height, fps = 1080, 1920, 30.0
        def __init__(self, duration): self.duration = duration; self.nb_frames = int(duration * 30)

    fila = list(deltas)
    def fake_probe(p):
        nome = Path(p).name
        if nome == "hook_trimmed.tmp.mp4":
            return _Meta(fila.pop(0))       # delta do corte corrente
        if "hook" in nome:                  # hook_source.mp4 (bruto)
            return _Meta(9.9)
        return _Meta(dur_composto)          # composto

    monkeypatch.setattr(variants, "detect_silences", lambda *a, **k: [])
    monkeypatch.setattr(variants, "cut_segments",
                        lambda src, seg, dest, **k: Path(dest).write_bytes(b"hook cortado"))
    monkeypatch.setattr(variants, "probe_video", fake_probe)
    monkeypatch.setattr(variants, "_concat_hook_e_corpo",
                        lambda hook, corpo, dest: Path(dest).write_bytes(b"composto"))
    monkeypatch.setattr(variants, "transcribe_audio",
                        lambda *a, **k: [_linha("oi", 0.0, 0.8)])


def test_recompor_hook_desloca_da_base_sem_drift(tmp_path, monkeypatch):
    from pipeline.variants import criar_variacao, recompor_hook
    jobs_root, m = _matriz_pronta(tmp_path)
    _variacao_falsa_deltas(monkeypatch, deltas=[3.2, 5.0])
    (tmp_path / "hook.mov").write_bytes(b"hook bruto")

    criar_variacao(m.dir, jobs_root, "corpo-h1", str(tmp_path / "hook.mov"))
    v = jobs_root / "corpo-h1"
    assert load_json(v / "transcript.json")[1]["start"] == 1.0 + 3.2

    # segundo corte com delta diferente: o corpo desloca da BASE (1.0), não do
    # já deslocado — 1.0 + 5.0, nunca 1.0 + 3.2 + 5.0
    hook_linhas = recompor_hook(v, m.dir)
    assert hook_linhas == 1
    assert load_json(v / "transcript.json")[1]["start"] == 1.0 + 5.0
    assert load_json(v / "overlays.json")[0]["fromFrame"] == 30 + round(5.0 * 30)
    assert load_json(v / "job.config.json")["hook_linhas"] == 1


def test_recompor_hook_invalida_edit_recipe_e_preserva_hook_json(tmp_path, monkeypatch):
    from pipeline.variants import criar_variacao, recompor_hook
    jobs_root, m = _matriz_pronta(tmp_path)
    _variacao_falsa_deltas(monkeypatch, deltas=[3.2, 3.2])
    (tmp_path / "hook.mov").write_bytes(b"hook bruto")
    criar_variacao(m.dir, jobs_root, "corpo-h1", str(tmp_path / "hook.mov"))
    v = jobs_root / "corpo-h1"
    write_json(v / "edit-recipe.json", {"stale": True})   # derivado do trimmed
    write_json(v / "hook.json", {"title": "meu hook"})     # texto do usuário

    recompor_hook(v, m.dir)

    assert not (v / "edit-recipe.json").exists()           # invalidado
    assert load_json(v / "hook.json") == {"title": "meu hook"}  # sobrevive
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pytest tests/test_variants.py::test_recompor_hook_desloca_da_base_sem_drift tests/test_variants.py::test_recompor_hook_invalida_edit_recipe_e_preserva_hook_json -q`
Expected: FAIL com `ImportError: cannot import name 'recompor_hook'`.

- [ ] **Step 3: Adicionar o import e a função `recompor_hook`**

Em `pipeline/variants.py`, adicionar ao bloco de imports (após `from pipeline.probe import probe_video`):

```python
from pipeline.stages import DERIVADOS_DO_TRIMMED
```

E adicionar a função (após `criar_variacao`):

```python
def recompor_hook(var_dir: Path, matriz_dir: Path, progress_cb=None) -> int:
    """Re-corta o hook de uma variação existente a partir do hook_source.mp4
    guardado e do corpo ATUAL da matriz, e recompõe. Reusa _compor_variacao
    (mesma base da matriz, sem drift). Invalida os derivados do trimmed (a
    transcrição/textos editados da variação + a recipe) — o texto do hook
    (hook.json) sobrevive de propósito, como no stage_cut. Grava o novo
    hook_linhas no config e o devolve. O caller (rota) já validou aptidão e
    persistiu os novos sliders no config."""
    cfg = load_json(var_dir / "job.config.json")
    hook_source = var_dir / "hook_source.mp4"
    # invalida os derivados do trimmed; _compor re-escreve os de conteúdo a
    # partir da base da matriz, sobrando só edit-recipe.json apagado
    for stale in DERIVADOS_DO_TRIMMED:
        (var_dir / stale).unlink(missing_ok=True)
    hook_linhas = _compor_variacao(var_dir, matriz_dir, str(hook_source),
                                   cfg, progress_cb=progress_cb)
    cfg["hook_linhas"] = hook_linhas
    write_json(var_dir / "job.config.json", cfg)
    return hook_linhas
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pytest tests/test_variants.py -q`
Expected: PASS (toda a suíte).

- [ ] **Step 5: Commit**

```bash
git add pipeline/variants.py tests/test_variants.py
git commit -m "feat(variants): recompor_hook re-corta o hook da base da matriz sem drift"
```

---

## Task 3: Golden de paridade (item 4) — estilo de legenda + CTA herdados

**Files:**
- Test: `tests/test_variants.py`

- [ ] **Step 1: Estender a matriz de teste com estilo de legenda + CTA e escrever o golden**

Adicionar em `tests/test_variants.py` (usa `_variacao_falsa` já existente e um matriz com `caption_*`, `brand_kit_slug` e um overlay com geometria):

```python
def test_paridade_estilo_e_cta_variacao_iguais_a_matriz(tmp_path, monkeypatch):
    """Item 4 do spec: caption_* + brand kit e o x/y/fontSize do CTA são
    idênticos entre matriz e variação. Golden que trava a herança contra
    regressão (config copiado inteiro + deslocamento que só mexe no tempo)."""
    from pipeline.variants import criar_variacao
    jobs_root, m = _matriz_pronta(tmp_path)
    # estilo de legenda + marca na matriz
    cfg = load_json(m.dir / "job.config.json")
    cfg.update({"caption_font_size": 52, "caption_bottom": 96, "caption_color": "#ff0000",
                "caption_highlight": "#00ff00", "caption_font": "Inter", "brand_kit_slug": "aventos"})
    write_json(m.dir / "job.config.json", cfg)
    # CTA com geometria própria (x/y/fontSize) na matriz
    write_json(m.dir / "overlays.json", [{"id": "cta", "type": "text", "text": "Assine",
        "fromFrame": 45, "durationInFrames": 60, "x": 0.5, "y": 0.82, "fontSize": 40}])
    _variacao_falsa(monkeypatch)
    (tmp_path / "hook.mov").write_bytes(b"hook bruto")

    criar_variacao(m.dir, jobs_root, "corpo-h1", str(tmp_path / "hook.mov"))
    v = jobs_root / "corpo-h1"

    mv, vv = load_json(m.dir / "job.config.json"), load_json(v / "job.config.json")
    for campo in ("caption_font_size", "caption_bottom", "caption_color",
                  "caption_highlight", "caption_font", "brand_kit_slug"):
        assert vv[campo] == mv[campo], campo

    cta_m = load_json(m.dir / "overlays.json")[0]
    cta_v = load_json(v / "overlays.json")[0]
    assert (cta_v["x"], cta_v["y"], cta_v["fontSize"]) == (cta_m["x"], cta_m["y"], cta_m["fontSize"])
    assert cta_v["fromFrame"] == cta_m["fromFrame"] + round(3.2 * 30)  # só o tempo desloca
```

- [ ] **Step 2: Rodar e ver passar**

Run: `pytest tests/test_variants.py::test_paridade_estilo_e_cta_variacao_iguais_a_matriz -q`
Expected: PASS (a herança já funciona; o teste é a rede contra regressão).

- [ ] **Step 3: Commit**

```bash
git add tests/test_variants.py
git commit -m "test(variants): golden de paridade de estilo de legenda e CTA (item 4)"
```

---

## Task 4: `matriz_do_recut` + campos de estado no backend

**Files:**
- Modify: `api/models.py:150-170` (JobState)
- Modify: `api/jobs.py` (`matriz_do_recut`, `get_state`)
- Test: `api/tests/test_jobs.py` (criar se não houver bloco adequado — ver Step 1)

- [ ] **Step 1: Escrever os testes de `get_state`**

Adicionar em `api/tests/test_jobs.py` (o arquivo já existe; se não, criar com `from pathlib import Path` + imports abaixo). Testam os 3 campos novos direto em `get_state`:

```python
def test_get_state_variacao_expoe_recut(tmp_path, monkeypatch):
    from pipeline.job import init_job, write_json, load_json
    from api.jobs import get_state
    jobs = tmp_path / "jobs"; jobs.mkdir()
    # matriz apta (trimmed + transcript)
    m = init_job(jobs, "corpo")
    (m.dir / "trimmed.mp4").write_bytes(b"c"); write_json(m.dir / "transcript.json", [])
    mc = load_json(m.dir / "job.config.json"); mc["papel"] = "matriz"; write_json(m.dir / "job.config.json", mc)
    # variação com hook_source e hook_linhas
    v = init_job(jobs, "corpo-h1")
    (v.dir / "hook_source.mp4").write_bytes(b"h")
    vc = load_json(v.dir / "job.config.json")
    vc.update({"papel": "normal", "origem_matriz": "corpo", "hook_linhas": 2})
    write_json(v.dir / "job.config.json", vc)

    st = get_state("corpo-h1", jobs)
    assert st.has_hook_source is True
    assert st.hook_linhas == 2
    assert st.matriz_disponivel is True


def test_get_state_variacao_com_matriz_excluida(tmp_path):
    from pipeline.job import init_job, write_json, load_json
    from api.jobs import get_state
    jobs = tmp_path / "jobs"; jobs.mkdir()
    v = init_job(jobs, "corpo-h1")
    (v.dir / "hook_source.mp4").write_bytes(b"h")
    vc = load_json(v.dir / "job.config.json")
    vc.update({"papel": "normal", "origem_matriz": "corpo"})  # matriz "corpo" não existe
    write_json(v.dir / "job.config.json", vc)

    st = get_state("corpo-h1", jobs)
    assert st.has_hook_source is True
    assert st.matriz_disponivel is False
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pytest api/tests/test_jobs.py -q -k recut_ or variacao`
Expected: FAIL com `AttributeError: 'JobState' object has no attribute 'has_hook_source'`.

- [ ] **Step 3: Adicionar os campos ao `JobState`**

Em `api/models.py`, no model `JobState`, após `origem_matriz: str = ""` (linha 169):

```python
    origem_matriz: str = ""
    # edição escopada da variação (spec 2026-08-01): hook_source.mp4 presente
    # (dá para re-cortar o hook), fronteira do hook na transcrição, e se a
    # matriz de origem ainda está apta a alimentar o re-corte.
    has_hook_source: bool = False
    hook_linhas: int = 0
    matriz_disponivel: bool = False
```

- [ ] **Step 4: Adicionar `matriz_do_recut` e preencher `get_state`**

Em `api/jobs.py`, adicionar a função (perto de `get_state`, antes dela):

```python
def matriz_do_recut(job_dir: Path, jobs_root: Path) -> Path | None:
    """Diretório da matriz apta a re-cortar o hook desta variação, ou None.

    Apta = origem_matriz preenchido no config, a matriz existe e ainda tem
    trimmed.mp4 + transcript.json (o corpo que o re-corte lê na hora). Fonte
    única da checagem que get_state expõe ao front e que /recut-hook reusa para
    o 409. Usa _job_dir_seguro: um origem_matriz de travessia vira None."""
    cfg_path = job_dir / "job.config.json"
    if not cfg_path.exists():
        return None
    try:
        cfg = load_json(cfg_path)
    except Exception:
        return None
    origem = cfg.get("origem_matriz", "")
    if not origem:
        return None
    matriz = _job_dir_seguro(origem, Path(jobs_root))
    if matriz is None or not matriz.is_dir():
        return None
    if not (matriz / "trimmed.mp4").exists() or not (matriz / "transcript.json").exists():
        return None
    return matriz
```

Em `get_state`, dentro da construção do `JobState(...)` (após `origem_matriz=job_config.origem_matriz,`, linha 494):

```python
        origem_matriz=job_config.origem_matriz,
        has_hook_source=(job_dir / "hook_source.mp4").exists(),
        hook_linhas=job_config.hook_linhas,
        matriz_disponivel=matriz_do_recut(job_dir, Path(jobs_root)) is not None,
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pytest api/tests/test_jobs.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/models.py api/jobs.py api/tests/test_jobs.py
git commit -m "feat(api): estado de re-corte do hook (has_hook_source/hook_linhas/matriz_disponivel)"
```

---

## Task 5: Rota `POST /jobs/{slug}/recut-hook`

**Files:**
- Modify: `api/routes.py` (imports + rota)
- Test: `api/tests/test_variants_routes.py`

- [ ] **Step 1: Escrever os testes da rota**

Adicionar em `api/tests/test_variants_routes.py`. Helpers de variação + os quatro casos (não-variação 409, matriz sumiu 409, happy path invalida + devolve hook_linhas):

```python
def _variacao(tmp_root, slug="corpo-h1", origem="corpo", com_hook_source=True):
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True)
    write_json(d / "job.config.json",
               {"papel": "normal", "origem_matriz": origem, "hook_linhas": 1})
    (d / "trimmed.mp4").write_bytes(b"composto")
    write_json(d / "trimmed.probe.json",
               {"width": 1080, "height": 1920, "fps": 30.0, "duration": 11.2, "nb_frames": 336})
    if com_hook_source:
        (d / "hook_source.mp4").write_bytes(b"hook bruto")
    return d


def _post_recut(client, slug="corpo-h1"):
    return client.post(f"/api/jobs/{slug}/recut-hook",
                       json={"silence_threshold_db": -30.0, "padding": 0.1, "min_silence": 0.5})


def test_recut_de_projeto_sem_hook_source_e_409(client, tmp_root):
    _variacao(tmp_root, com_hook_source=False)
    r = _post_recut(client)
    assert r.status_code == 409
    assert "não pode re-cortar" in r.json()["detail"]


def test_recut_com_matriz_excluida_e_409(client, tmp_root):
    _variacao(tmp_root)  # matriz "corpo" não existe
    r = _post_recut(client)
    assert r.status_code == 409
    assert "excluída" in r.json()["detail"]


def test_recut_happy_path_invalida_e_devolve_hook_linhas(client, tmp_root, monkeypatch):
    _matriz(tmp_root)                          # matriz "corpo" apta (helper existente)
    v = _variacao(tmp_root)
    write_json(v / "edit-recipe.json", {"stale": True})
    from api import routes
    def fake_recompor(var_dir, matriz_dir, progress_cb=None):
        (var_dir / "edit-recipe.json").unlink(missing_ok=True)  # simula invalidação
        cfg = load_json(var_dir / "job.config.json"); cfg["hook_linhas"] = 4
        write_json(var_dir / "job.config.json", cfg)
        return 4
    monkeypatch.setattr(routes, "recompor_hook", fake_recompor)

    r = _post_recut(client)
    assert r.status_code == 200                 # SSE abriu
    assert '"hook_linhas": 4' in r.text.replace("'", '"')
    assert not (v / "edit-recipe.json").exists()
    # sliders persistidos no config
    assert load_json(v / "job.config.json")["silence_threshold_db"] == -30.0
```

Adicionar no topo do arquivo o import que faltar: `from pipeline.job import load_json` (junto do `write_json` já importado).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pytest api/tests/test_variants_routes.py -q -k recut`
Expected: FAIL (404/405 — a rota não existe).

- [ ] **Step 3: Adicionar imports e a rota**

Em `api/routes.py`, ampliar os imports existentes:

```python
from api.jobs import (
    allowed_file_path, ArquivoEmUsoError, cut_result, delete_job,
    delete_source, get_state, _job_dir_seguro, job_summary, job_summary_minimo,
    list_jobs, matriz_do_recut, ProjetoNaoEncontradoError, suggest_hook, tem_trabalho,
    update_brand_kit, update_caption_style, update_config,
    update_hook_card_frames, update_orientation, update_title,
    update_whisper_model,
)
```

```python
from pipeline.stages import stage_cut, stage_ingest, stage_recipe, stage_refine, stage_transcribe
from pipeline.variants import criar_variacao, recompor_hook
```

Adicionar a rota (logo após `create_variant`, ~linha 177):

```python
@router.post("/jobs/{slug}/recut-hook")
def run_recut_hook(slug: str, params: CutParams):
    """Re-corta só o silêncio do hook de uma variação e recompõe com o corpo
    ATUAL da matriz. Valida aptidão ANTES de gravar; roda com progresso SSE.
    Invalida os derivados do trimmed (mesma invalidação de re-detectar pausas)."""
    jobs_root, *_ = _roots()
    job_dir = _dir_do_job(slug, jobs_root)
    cfg_path = job_dir / "job.config.json"
    cfg = load_json(cfg_path) if cfg_path.exists() else {}
    hook_source = job_dir / "hook_source.mp4"
    if cfg.get("papel") != "normal" or not cfg.get("origem_matriz") or not hook_source.exists():
        raise HTTPException(status_code=409,
                            detail="esta variação não pode re-cortar o hook")
    matriz_dir = matriz_do_recut(job_dir, jobs_root)
    if matriz_dir is None:
        raise HTTPException(
            status_code=409,
            detail="a matriz desta variação foi excluída; o re-corte do hook não é mais possível",
        )
    # persiste os novos sliders (recompor_hook os relê do config)
    update_config(slug, jobs_root, params)

    def work(progress_cb):
        hook_linhas = recompor_hook(job_dir, matriz_dir, progress_cb=progress_cb)
        trimmed = job_dir / "trimmed.mp4"
        return {
            "trimmed_duration": load_json(job_dir / "trimmed.probe.json")["duration"],
            "trimmed_mtime": trimmed.stat().st_mtime if trimmed.exists() else 0.0,
            "hook_linhas": hook_linhas,
        }

    return StreamingResponse(run_with_progress(work), media_type="text/event-stream")
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pytest api/tests/test_variants_routes.py -q`
Expected: PASS.

- [ ] **Step 5: Rodar toda a suíte backend**

Run: `pytest -q`
Expected: PASS. (Baseline de memória: ~358 testes no Mac — o número deve subir.)

- [ ] **Step 6: Commit**

```bash
git add api/routes.py api/tests/test_variants_routes.py
git commit -m "feat(api): rota POST /recut-hook (SSE) para re-cortar o hook da variação"
```

---

## Task 6: Cliente `recutHook` + tipos no front

**Files:**
- Modify: `web/src/types.ts:61-82` (JobState)
- Modify: `web/src/api.ts`
- Test: `web/src/__tests__/api.test.ts`

- [ ] **Step 1: Espelhar os campos novos no `JobState` do front**

Em `web/src/types.ts`, dentro do type `JobState`, após `origem_matriz: string;` (linha 81):

```typescript
  papel: "normal" | "matriz";
  origem_matriz: string;
  // edição escopada da variação (spec 2026-08-01)
  has_hook_source?: boolean;
  hook_linhas?: number;
  matriz_disponivel?: boolean;
```

- [ ] **Step 2: Escrever o teste do cliente `recutHook`**

Adicionar em `web/src/__tests__/api.test.ts` (segue o padrão dos demais testes de SSE do arquivo; se o arquivo mockar `fetch`, reusar esse mock). Teste mínimo de que posta no endpoint certo com o corpo dos sliders:

```typescript
import { recutHook } from "../api";

it("recutHook posta os sliders no endpoint /recut-hook", async () => {
  const chamadas: any[] = [];
  const fakeBody = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode('event: done\ndata: {"hook_linhas":2}\n\n'));
      c.close();
    },
  });
  vi.stubGlobal("fetch", (url: string, opts: any) => {
    chamadas.push({ url, opts });
    return Promise.resolve(new Response(fakeBody, { status: 200 }));
  });

  let done: any = null;
  await recutHook("corpo-h1",
    { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
    { done: (d) => { done = d; } });

  expect(chamadas[0].url).toBe("/api/jobs/corpo-h1/recut-hook");
  expect(JSON.parse(chamadas[0].opts.body)).toEqual({ silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 });
  expect(done).toEqual({ hook_linhas: 2 });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/api.test.ts -t recutHook`
Expected: FAIL com `recutHook is not exported`.

- [ ] **Step 4: Adicionar o cliente `recutHook`**

Em `web/src/api.ts`, importar `CutParams` no bloco de tipos do topo:

```typescript
import type {
  Hook, JobState, CaptionLine, CutResult, SSEEvent, Overlay, JobSummary, CutParams,
} from "./types";
```

E adicionar a função (perto de `createVariant`, ~linha 168):

```typescript
// Re-corta só o silêncio do hook de uma variação e recompõe (SSE). Reusa os
// mesmos sliders do corte normal; o backend lê o corpo da matriz na hora.
export function recutHook(
  slug: string, params: CutParams,
  handlers: { progress?: (d: any) => void; done?: (d: any) => void; error?: (d: any) => void },
): Promise<void> {
  return streamSSE(`${BASE}/jobs/${slug}/recut-hook`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }, handlers);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/api.test.ts -t recutHook`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/api.ts web/src/__tests__/api.test.ts
git commit -m "feat(web): cliente recutHook + campos de estado da edição escopada"
```

---

## Task 7: `CutsStep` — "modo hook" (re-corte do hook na variação)

**Files:**
- Modify: `web/src/steps/CutsStep.tsx`
- Test: `web/src/__tests__/CutsStep.test.tsx`

- [ ] **Step 1: Escrever os testes do modo hook**

Adicionar em `web/src/__tests__/CutsStep.test.tsx` (seguir o mock de `../api` usado no arquivo). Três casos: botão do hook aparece + chama `recutHook` após confirmar; matriz excluída mostra aviso e some o botão.

```typescript
// no bloco de vi.mock("../api", ...) garantir que getJob, getCuts e recutHook
// são mockáveis. Exemplo de caso:

it("variação apta oferece 'Detectar pausas (do hook)' e re-corta após confirmar", async () => {
  (api.getJob as any).mockResolvedValue({
    slug: "corpo-h1", config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
    has_source: false, origem_matriz: "corpo", has_hook_source: true,
    matriz_disponivel: true, has_transcript: true,
  });
  (api.getCuts as any).mockResolvedValue({
    original_duration: 11.2, trimmed_duration: 11.2, segments: [{ start: 0, end: 11.2 }], trimmed_mtime: 1,
  });
  const recut = vi.fn().mockResolvedValue(undefined);
  (api.recutHook as any) = recut;

  render(<CutsStep slug="corpo-h1" setSlug={() => {}} next={() => {}} back={() => {}} />);
  const btn = await screen.findByRole("button", { name: /Detectar pausas \(do hook\)/ });
  fireEvent.click(btn);
  // portão de confirmação (há transcrição a perder)
  fireEvent.click(await screen.findByRole("button", { name: /Descartar e cortar/ }));
  await waitFor(() => expect(recut).toHaveBeenCalledWith("corpo-h1", expect.any(Object), expect.any(Object)));
});

it("variação com matriz excluída avisa e não oferece o re-corte", async () => {
  (api.getJob as any).mockResolvedValue({
    slug: "corpo-h1", config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
    has_source: false, origem_matriz: "corpo", has_hook_source: true, matriz_disponivel: false,
  });
  (api.getCuts as any).mockResolvedValue(null);
  render(<CutsStep slug="corpo-h1" setSlug={() => {}} next={() => {}} back={() => {}} />);
  expect(await screen.findByText(/foi excluída/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Detectar pausas \(do hook\)/ })).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/CutsStep.test.tsx`
Expected: FAIL (o botão do hook e o aviso "foi excluída" ainda não existem).

- [ ] **Step 3: Estado novo e leitura do `getJob`**

Em `web/src/steps/CutsStep.tsx`, importar `recutHook` e `getCuts`/`getJob` já existentes:

```typescript
import { streamSSE, mediaUrl, getCuts, getJob, recutHook } from "../api";
```

Adicionar estados (após `const [origemMatriz, setOrigemMatriz] = useState("");`, linha 96):

```typescript
  // Variação com clipe bruto do hook guardado (hook_source.mp4): o passo Cortes
  // deixa de ser só-leitura e oferece re-cortar o silêncio do hook. matriz-
  // Disponivel diz se a matriz de origem ainda pode alimentar o re-corte.
  const [hasHookSource, setHasHookSource] = useState(false);
  const [matrizDisponivel, setMatrizDisponivel] = useState(false);
```

No `getJob(slug).then((j) => {...})` (dentro do useEffect, linhas 126-132), acrescentar:

```typescript
      setOrigemMatriz(j?.origem_matriz ?? "");
      setHasHookSource(!!j?.has_hook_source);
      setMatrizDisponivel(!!j?.matriz_disponivel);
      setPerdeTranscricao(!!j?.has_transcript);
```

- [ ] **Step 4: Função `recut` e o gatilho de confirmação**

Adicionar `modoHook` e a função `recut` (após `onCut`, ~linha 251):

```typescript
  const modoHook = hasHookSource;

  const recut = async () => {
    setConfirmandoCorte(false);
    setBusy(true); setErr(null); setProg(null);
    try {
      await recutHook(slug, params, {
        progress: (d) => { if (d.n != null && d.total != null) setProg({ n: d.n, total: d.total }); },
        done: async (d) => {
          // o re-corte reescreveu o trimmed e re-derivou os artefatos da base
          const r = await getCuts(slug).catch(() => null);
          if (r) { setResult(r); setTrimmedVersion(r.trimmed_mtime ?? 0); }
          else if (d.trimmed_mtime != null) setTrimmedVersion(d.trimmed_mtime);
          // recompor apagou os derivados (DERIVADOS_DO_TRIMMED); não avisar de novo
          setAPerder([]); setPerdeTranscricao(false);
          setRemoveList([]); setMarkStart(null);
        },
        error: (d) => setErr(d.detail ?? "erro ao re-cortar o hook"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
```

- [ ] **Step 5: Botão e avisos condicionais ao modo hook**

Substituir o botão "Detectar pausas" e o bloco `{!temSource && (...)}` (linhas 272-315) por:

```tsx
      {/* refining na guarda: corte e refino reescrevem o mesmo trimmed.mp4 —
          um de cada vez */}
      <button onClick={pedirParaCortar}
        disabled={busy || carregandoJob || refining || (modoHook ? !matrizDisponivel : !temSource)}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy ? "Cortando..." : modoHook ? "Detectar pausas (do hook)" : "Detectar pausas"}
      </button>
      {confirmandoCorte && (
        <ConfirmarDescarte
          ariaLabel="confirmar nova detecção de pausas"
          acao={modoHook
            ? "Re-cortar o hook refaz o corte do hook e remonta a variação a partir da matriz"
            : "Detectar pausas refaz o corte a partir do vídeo original"}
          aPerder={aPerder} perdeTranscricao={perdeTranscricao}
          busy={busy}
          onConfirmar={modoHook ? recut : onCut}
          onDesistir={() => setConfirmandoCorte(false)}
        />
      )}
      {modoHook && !matrizDisponivel && (
        <p role="status" className="text-sm rounded border border-amber-700 bg-amber-950/40 p-3 text-amber-200">
          A matriz <strong>{origemMatriz}</strong> foi excluída, então não dá para
          re-cortar o hook desta variação. A variação continua renderizável, e os
          cortes manuais sobre o vídeo montado continuam funcionando.
        </p>
      )}
      {!modoHook && !temSource && (
        <p role="status" className="text-sm rounded border border-amber-700 bg-amber-950/40 p-3 text-amber-200">
          {origemMatriz ? (
            // Variação antiga (criada antes da edição escopada): nasceu sem
            // hook_source.mp4, então não dá para re-cortar o hook aqui.
            <>
              Esta variação já nasce cortada e montada a partir da matriz{" "}
              <strong>{origemMatriz}</strong> — não há vídeo original para
              re-detectar pausas. Os cortes manuais continuam funcionando.
            </>
          ) : result ? (
            <>
              O vídeo original deste projeto foi apagado para <strong>liberar espaço</strong>,
              então não dá mais para detectar pausas aqui. Os cortes manuais sobre o vídeo
              já cortado continuam funcionando.
            </>
          ) : (
            <>
              O vídeo original deste projeto foi apagado para <strong>liberar espaço</strong>,
              e este projeto não tem nenhum corte salvo — não dá para detectar pausas
              nem cortar manualmente aqui: não sobrou vídeo para trabalhar.
            </>
          )}
        </p>
      )}
```

Nota: `pedirParaCortar` (linhas 174-180) já abre `confirmandoCorte` quando há o que perder — vale para os dois modos sem mudança, porque `onConfirmar` decide entre `recut` e `onCut`.

- [ ] **Step 6: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/CutsStep.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/steps/CutsStep.tsx web/src/__tests__/CutsStep.test.tsx
git commit -m "feat(web): passo Cortes da variação re-corta o hook (modo hook)"
```

---

## Task 8: `TranscriptStep` — revisar só o hook na variação

**Files:**
- Modify: `web/src/steps/TranscriptStep.tsx`
- Test: `web/src/__tests__/TranscriptStep.test.tsx`

- [ ] **Step 1: Escrever o teste "mostra só hook_linhas e salva preservando o corpo"**

Adicionar em `web/src/__tests__/TranscriptStep.test.tsx`:

```typescript
it("variação exibe só as linhas do hook e o save preserva o corpo", async () => {
  const linhas = [
    { text: "oi", start: 0, end: 0.8, words: [{ word: "oi", start: 0, end: 0.8 }] },
    { text: "corpo", start: 4.2, end: 5.2, words: [{ word: "corpo", start: 4.2, end: 5.2 }] },
  ];
  (api.getTranscript as any).mockResolvedValue(linhas);
  (api.getJob as any).mockResolvedValue({ hook_linhas: 1, orientation: "16x9" });
  const put = vi.fn().mockResolvedValue(undefined);
  (api.putTranscript as any) = put;

  render(<TranscriptStep slug="corpo-h1" setSlug={() => {}} next={() => {}} back={() => {}} />);
  // só a palavra do hook fica editável
  const inputs = await screen.findAllByDisplayValue(/oi|corpo/);
  const editaveis = inputs.filter((i) => (i as HTMLInputElement).value === "oi");
  expect(editaveis).toHaveLength(1);
  expect(screen.queryByDisplayValue("corpo")).toBeNull();
  // editar o hook e sair do campo salva a transcrição COMPLETA (hook + corpo)
  fireEvent.change(editaveis[0], { target: { value: "olá" } });
  fireEvent.blur(editaveis[0]);
  await waitFor(() => expect(put).toHaveBeenCalled());
  const enviado = (put.mock.calls[0][1]) as any[];
  expect(enviado).toHaveLength(2);                 // corpo preservado
  expect(enviado[0].words[0].word).toBe("olá");
  expect(enviado[1].text).toBe("corpo");
  // aviso explicando o escopo
  expect(screen.getByText(/só o hook/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/TranscriptStep.test.tsx`
Expected: FAIL (hoje mostra as duas linhas e não há aviso).

- [ ] **Step 3: Estado `hookLinhas`, fatia visível e aviso**

Em `web/src/steps/TranscriptStep.tsx`, adicionar o estado (após `const [orientation, setOrientation] = useState<Orientation>("16x9");`, linha 30):

```typescript
  // Variação (spec 2026-08-01): transcript.json é hook ++ corpo. Só as
  // hook_linhas primeiras linhas são do hook; o corpo já foi transcrito na
  // matriz e não deve ser exibido nem tocado aqui. 0 = projeto normal (tudo).
  const [hookLinhas, setHookLinhas] = useState(0);
```

No `getJob(slug).then((j:any) => {...})` (linhas 34-39), acrescentar:

```typescript
      if (j?.orientation) setOrientation(j.orientation);
      setHookLinhas(j?.hook_linhas ?? 0);
```

Antes do `return (` (após a definição de `maxBottom`, ~linha 62), derivar as linhas visíveis:

```typescript
  // No editor da variação, só o hook é editável; o corpo fica preservado em
  // `lines` e volta inteiro no save. O editor não adiciona/remove linhas, então
  // hook_linhas segue válido durante a edição normal.
  const linhasVisiveis = hookLinhas > 0 && lines ? lines.slice(0, hookLinhas) : lines;
```

- [ ] **Step 4: Renderizar `linhasVisiveis` e o aviso**

No JSX, trocar o `.map` da lista editável (linha 190, `{lines.map((l, li) => (`) por `{linhasVisiveis!.map((l, li) => (` — como `linhasVisiveis` é um prefixo de `lines`, o índice `li` continua casando com `lines` (o que `editWord`/`save` usam, sem mudança).

Adicionar o aviso logo antes do bloco da lista editável (`{lines && (` que começa na linha 188), dentro de um novo guard:

```tsx
      {lines && hookLinhas > 0 && (
        <p className="text-sm rounded border border-sky-800 bg-sky-950/40 p-3 text-sky-200">
          O corpo já está transcrito na matriz — aqui você revisa <strong>só o hook</strong>.
        </p>
      )}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/TranscriptStep.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/steps/TranscriptStep.tsx web/src/__tests__/TranscriptStep.test.tsx
git commit -m "feat(web): passo Transcrição da variação revisa só o hook"
```

---

## Task 9: `OverlaysStep` — sem hook na matriz + nº do heading

**Files:**
- Modify: `web/src/steps/OverlaysStep.tsx`
- Test: `web/src/__tests__/OverlaysStep.test.tsx`

- [ ] **Step 1: Escrever os testes (matriz não desenha hook; heading "4. Textos")**

Adicionar em `web/src/__tests__/OverlaysStep.test.tsx`:

```typescript
it("na matriz não busca nem desenha o hook e o heading é '4. Textos'", async () => {
  (api.getJob as any).mockResolvedValue({ papel: "matriz", probe: { fps: 30, duration: 8 }, orientation: "16x9" });
  (api.getOverlays as any).mockResolvedValue([]);
  (api.getTranscript as any).mockResolvedValue([]);
  (api.getSuggestions as any).mockResolvedValue([]);
  (api.getSuggestDefaults as any).mockResolvedValue({ x: 0.5, y: 0.12 });
  const getHook = vi.fn();
  (api.getHook as any) = getHook;

  render(<OverlaysStep slug="corpo" setSlug={() => {}} next={() => {}} back={() => {}} />);
  expect(await screen.findByText("4. Textos")).toBeInTheDocument();
  await waitFor(() => expect(api.getJob).toHaveBeenCalled());
  expect(getHook).not.toHaveBeenCalled();              // hook não é buscado numa matriz
});

it("num projeto normal mantém '5. Textos' e busca o hook", async () => {
  (api.getJob as any).mockResolvedValue({ papel: "normal", probe: { fps: 30, duration: 8 }, orientation: "16x9" });
  (api.getOverlays as any).mockResolvedValue([]);
  (api.getTranscript as any).mockResolvedValue([]);
  (api.getSuggestions as any).mockResolvedValue([]);
  (api.getSuggestDefaults as any).mockResolvedValue({ x: 0.5, y: 0.12 });
  (api.getHook as any) = vi.fn().mockResolvedValue({ title: "H", subtitle: "" });

  render(<OverlaysStep slug="p1" setSlug={() => {}} next={() => {}} back={() => {}} />);
  expect(await screen.findByText("5. Textos")).toBeInTheDocument();
  await waitFor(() => expect(api.getHook).toHaveBeenCalled());
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx`
Expected: FAIL (heading é sempre "5. Textos" e `getHook` é sempre chamado).

- [ ] **Step 3: Estado `papel`, gate do `getHook` e do desenho**

Em `web/src/steps/OverlaysStep.tsx`, adicionar o estado (após `const [orientation, setOrientation] = useState<Orientation>("16x9");`, linha 52):

```typescript
  // Numa matriz não há hook falado ainda; buscar GET /hook cairia no auto-
  // sugerido a partir da transcrição e desenharia um "hook fantasma" no preview
  // (só visual, mas confuso). papel vem do getJob.
  const [papel, setPapel] = useState<"normal" | "matriz">("normal");
```

Remover o `getHook(slug).then(setHook).catch(() => {});` do useEffect de mount (linha 69) e passá-lo para dentro do `getJob().then`, condicionado ao papel (linhas 70-76):

```typescript
    getJob(slug).then((j: any) => {
      if (j?.probe?.fps) setFps(j.probe.fps);
      if (j?.probe?.duration) setDurationSec(j.probe.duration);
      if (j?.captionStyle) setCapStyle(effectiveCaptionStyle(j.captionStyle, j.captionStyleResolved));
      if (j?.orientation) setOrientation(j.orientation);
      const papelJob = j?.papel ?? "normal";
      setPapel(papelJob);
      if (papelJob !== "matriz") getHook(slug).then(setHook).catch(() => {});
    }).catch(() => {});
```

Trocar a derivação de `hookOverlays` (linha 184) por uma que zera na matriz:

```typescript
  const hookOverlays = papel !== "matriz" && hook ? hookToOverlays(hook) : [];
```

- [ ] **Step 4: Nº do heading conforme o papel**

Trocar o heading fixo (linha 188) por:

```tsx
      <h2 className="text-xl font-semibold">{papel === "matriz" ? 4 : 5}. Textos</h2>
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx`
Expected: PASS.

- [ ] **Step 6: Rodar toda a suíte do front**

Run: `cd web && npx vitest run`
Expected: PASS. (Baseline de memória: ~297 testes — deve subir.)

- [ ] **Step 7: Commit**

```bash
git add web/src/steps/OverlaysStep.tsx web/src/__tests__/OverlaysStep.test.tsx
git commit -m "fix(web): matriz não desenha hook fantasma e heading do passo Textos reflete o papel"
```

---

## Task 10: Verificação de ponta a ponta

**Files:** nenhum (só execução)

- [ ] **Step 1: Suíte backend completa**

Run: `pytest -q`
Expected: PASS, sem warnings novos.

- [ ] **Step 2: Suíte front completa**

Run: `cd web && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `ruff check api pipeline tests`
Expected: sem erros. (Se `ruff` acusar imports não usados na `routes.py`/`variants.py`, corrigir.)

- [ ] **Step 4: Type-check do front**

Run: `cd web && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Smoke manual (opcional, recomendado)**

Subir a API (`uvicorn api.app:app`) e o front, criar uma matriz, gerar uma variação, e no passo Cortes da variação clicar "Detectar pausas (do hook)" com sliders diferentes; confirmar o descarte; conferir que o vídeo remonta, que a Transcrição mostra só o hook, e que os textos/legenda seguem no lugar. Excluir a matriz e conferir que o botão de re-corte some com o aviso.

---

## Self-review (cobertura do spec)

- **Incômodo 1 (hook fantasma + heading):** Task 9. ✓
- **Incômodo 2 (re-corte do hook):** Tasks 1, 2, 5, 7 (backend `hook_source.mp4` + `recompor_hook` + rota; front modo hook). ✓
- **Incômodo 3 (transcrição só do hook):** Tasks 1 (`hook_linhas`), 4 (estado), 8 (front). ✓
- **Incômodo 4 (paridade travada):** Task 3 (golden). ✓
- **Modelo/armazenamento (`hook_source.mp4`, `hook_linhas`, `origem_matriz`):** Tasks 1, 4. ✓
- **Backend `_compor_variacao` compartilhado + rota SSE + validações 409 + invalidação `DERIVADOS_DO_TRIMMED` + sem drift:** Tasks 1, 2, 5. ✓
- **Front modo hook + transcrição escopada + reuso do `ConfirmarDescarte`/`aPerder`:** Tasks 7, 8. ✓
- **Fora de escopo (corte por silêncio local, cópia do corpo, editar corpo pela variação, lote):** não abordados, conforme spec. ✓
