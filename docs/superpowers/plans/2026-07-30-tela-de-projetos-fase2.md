# Tela de projetos — Fase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar nome legível aos projetos e permitir apagá-los — o projeto inteiro, ou só o vídeo original para liberar espaço.

**Architecture:** Três rotas novas (`PUT /title`, `DELETE /jobs/{slug}`, `DELETE /jobs/{slug}/source`), três pendências de backend que a fase 1 deixou registradas, e as ações correspondentes na tela de projetos com confirmação que diz o que sobrevive.

**Tech Stack:** FastAPI + pydantic v2 no backend; React 19 + TypeScript + Tailwind no front; pytest e vitest + Testing Library nos testes.

**Spec:** `docs/superpowers/specs/2026-07-30-tela-de-projetos-design.md`

## Global Constraints

- **Fase 2 apenas.** Os dois avisos (cut sem source; cascata do corte manual) são fase 3 — não os implemente.
- **`output/` é sagrado.** Nenhuma rota desta fase apaga renders exportados. Apagar o projeto mantém `output/<slug>-*.mp4`; é o entregável, e o usuário costuma apagar o projeto justamente por já tê-lo exportado.
- **`init_job` cria o diretório** (`pipeline/job.py`). Nada que apenas consulta pode chamá-lo. `job_summary` e `get_state` já respeitam isso — não regrida.
- **Apagar é irreversível e não tem lixeira.** Toda rota de DELETE tem que ser exata sobre o alvo, e a UI tem que confirmar antes, dizendo o que sobrevive.
- **Rodar os testes do backend:** `.venv/Scripts/python.exe -m pytest <arquivo> -q` a partir da raiz. `python3` não existe nesta máquina.
- **Rodar os testes do front:** `web/node_modules/.bin/vitest.cmd run --root web <arquivo>` a partir da raiz. `npm test` dentro de `web/` está quebrado neste ambiente.
- **Tipos:** `web/node_modules/.bin/tsc.cmd --noEmit -p web/tsconfig.json`
- **Baseline de falhas que não são regressão:** `api/tests/test_tts_routes.py::test_happy_path`; as suítes `captionParity` e `overlayAnimParity` com `--root web`; e 5 erros de `tsc` em `BrandStep.test.tsx`, `animatedApi.ts`, `BrandKitModal.tsx` (×2) e `steps/animated/RenderStep.tsx`.
- **Idioma:** textos de UI, comentários e mensagens em português.

---

### Task 1: Pendências de backend que a fase 2 herda

**Files:**
- Modify: `api/models.py` (adicionar `bytes_render` a `JobSummary`)
- Modify: `api/jobs.py` (`tem_trabalho`, `job_summary`, `job_summary_minimo`, `list_jobs`)
- Modify: `api/routes.py` (`_tem_trabalho` passa a delegar)
- Test: `api/tests/test_jobs_list.py` (acrescentar), `api/tests/test_upload_guard.py` (acrescentar)

**Interfaces:**
- Consumes: nada de tarefas anteriores desta fase.
- Produces:
  - `api.jobs.tem_trabalho(job_dir: Path) -> bool` — fonte única do que conta como trabalho
  - `JobSummary.bytes_render: int` — soma dos renders em `output/` daquele slug
  - `list_jobs` passa a incluir jobs com `job.config.json` ilegível

**Por que:** a fase 1 registrou três achados adiados que viram armadilha exatamente quando o botão de excluir entra. `bytes_total` não conta os renders, então o tamanho exibido mente. `_tem_trabalho` (`api/routes.py`) mantém à mão uma lista de arquivos que `DERIVADOS_DO_SOURCE` (`pipeline/stages.py`) já define, e ignora `overlays.json` e `suggestions.json` — trabalho real do usuário. E um projeto com config corrompido não aparece na lista mas bloqueia o upload com 409: sem aparecer, não há como apagá-lo.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `api/tests/test_jobs_list.py`:

```python
def test_reporta_o_tamanho_dos_renders_separado(client, tmp_root):
    """A tela precisa dizer o que "liberar espaço" libera e o que sobrevive."""
    _criar_job(tmp_root, "A1", {"source.mp4": b"x" * 100})
    (tmp_root / "output" / "A1-9x16.mp4").write_bytes(b"z" * 40)

    item = client.get("/api/jobs").json()[0]
    assert item["bytes_source"] == 100
    assert item["bytes_render"] == 40
    # bytes_total continua sendo só o diretório do job
    assert item["bytes_render"] not in (item["bytes_total"],)


def test_soma_os_dois_renders_quando_existem(client, tmp_root):
    _criar_job(tmp_root, "A1", {})
    (tmp_root / "output" / "A1-9x16.mp4").write_bytes(b"z" * 40)
    (tmp_root / "output" / "A1-16x9.mp4").write_bytes(b"w" * 60)
    assert client.get("/api/jobs").json()[0]["bytes_render"] == 100


def test_sem_render_o_tamanho_e_zero(client, tmp_root):
    _criar_job(tmp_root, "A1", {})
    assert client.get("/api/jobs").json()[0]["bytes_render"] == 0


def test_projeto_com_config_ilegivel_aparece_na_lista(client, tmp_root):
    """Sem aparecer, não há como apagá-lo — e ele bloqueia o upload com 409."""
    d = tmp_root / "jobs" / "quebrado"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text("{{{ isto não é json", encoding="utf-8")
    (d / "transcript.json").write_text("[]", encoding="utf-8")

    slugs = [j["slug"] for j in client.get("/api/jobs").json()]
    assert "quebrado" in slugs


def test_diretorio_vazio_continua_fora_da_lista(client, tmp_root):
    """Config ilegível e sem nenhum artefato não é projeto — não polui a lista."""
    d = tmp_root / "jobs" / "casca"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text("{{{", encoding="utf-8")
    assert client.get("/api/jobs").json() == []
```

Acrescentar ao final de `api/tests/test_upload_guard.py`:

```python
def test_guarda_conta_overlays_como_trabalho(client, tmp_root, sample_mp4):
    """stage_ingest apaga overlays.json; a guarda precisa protegê-lo."""
    d = tmp_root / "jobs" / "ov"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text(json.dumps({}), encoding="utf-8")
    (d / "overlays.json").write_text("[]", encoding="utf-8")
    assert _upload(client, "ov", sample_mp4).status_code == 409


def test_guarda_conta_sugestoes_como_trabalho(client, tmp_root, sample_mp4):
    d = tmp_root / "jobs" / "sg"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text(json.dumps({}), encoding="utf-8")
    (d / "suggestions.json").write_text("[]", encoding="utf-8")
    assert _upload(client, "sg", sample_mp4).status_code == 409
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_jobs_list.py api/tests/test_upload_guard.py -q`
Expected: FAIL — `bytes_render` não existe (KeyError), o job com config ilegível não aparece, e os uploads sobre overlays/suggestions passam com 200.

- [ ] **Step 3: Acrescentar `bytes_render` ao modelo**

Em `api/models.py`, dentro de `JobSummary`, logo após `bytes_total`:

```python
    # renders exportados em output/. Ficam separados de bytes_total porque
    # sobrevivem a apagar o projeto — a tela precisa dizer isso ao confirmar.
    bytes_render: int = 0
```

- [ ] **Step 4: Fonte única do que conta como trabalho**

Em `api/jobs.py`, adicionar antes de `job_summary` (o import de `DERIVADOS_DO_SOURCE` de `pipeline.stages` já existe no arquivo):

```python
def tem_trabalho(job_dir: Path) -> bool:
    """Se há algo a perder ao trocar o vídeo deste projeto.

    Fonte única: o source mais tudo que `stage_ingest` apaga ao reingerir.
    Manter uma segunda lista à mão já tinha deixado `overlays.json` e
    `suggestions.json` de fora da guarda de upload — trabalho real do usuário.
    """
    if not job_dir.is_dir():
        return False
    return (job_dir / "source.mp4").exists() or any(
        (job_dir / nome).exists() for nome in DERIVADOS_DO_SOURCE
    )
```

E simplificar `job_summary_minimo` para usá-la, trocando o corpo do `tem_algo`:

```python
    if not tem_trabalho(job_dir):
        return None
    source = job_dir / "source.mp4"
```

(remova a linha `tem_algo = ...` e o `if not tem_algo:` que ela alimentava).

- [ ] **Step 5: Preencher `bytes_render` e incluir jobs de config ilegível**

Em `api/jobs.py`, dentro de `job_summary`, acrescentar antes do `return`:

```python
    renders = [output_root / f"{slug}-16x9.mp4", output_root / f"{slug}-9x16.mp4"]
```

e o campo no `JobSummary(...)`:

```python
        bytes_render=sum(p.stat().st_size for p in renders if p.exists()),
```

Em `job_summary_minimo`, nada muda — `bytes_render` fica no default 0, porque essa função não recebe `output_root`.

Em `list_jobs`, dar ao job de config ilegível a chance do resumo mínimo:

```python
    resumos = []
    for d in root.iterdir():
        try:
            # config ilegível cai no resumo mínimo: um projeto invisível na
            # lista não pode ser apagado, e ele ainda bloqueia o upload com 409
            s = job_summary(d, Path(output_root)) or job_summary_minimo(d)
        except Exception:
            continue
        if s:
            resumos.append(s)
```

- [ ] **Step 6: `_tem_trabalho` da rota passa a delegar**

Em `api/routes.py`, substituir a função `_tem_trabalho` e o uso dela na guarda. A função deixa de existir; a guarda passa a olhar o diretório:

```python
    if not overwrite:
        job_dir = Path(jobs_root) / slug
        if tem_trabalho(job_dir):
            existente = job_summary(job_dir, output_root) or job_summary_minimo(job_dir)
            raise HTTPException(status_code=409, detail=existente.model_dump())
```

Acrescente `tem_trabalho` ao import de `api.jobs` e remova a definição de `_tem_trabalho` junto com o import de `JobSummary` se ele ficar sem uso (confira antes de remover — `read_jobs` usa `JobSummary` na anotação de retorno, então ele fica).

- [ ] **Step 7: Rodar e ver passar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_jobs_list.py api/tests/test_upload_guard.py -q`
Expected: PASS.

- [ ] **Step 8: Suíte inteira do backend**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: só o baseline de TTS falha.

- [ ] **Step 9: Commit**

```bash
git add api/models.py api/jobs.py api/routes.py api/tests/test_jobs_list.py api/tests/test_upload_guard.py
git commit -m "fix(api): tamanho dos renders, trabalho com fonte única e projeto de config ilegível na lista"
```

---

### Task 2: Título do projeto

**Files:**
- Modify: `pipeline/job.py` (campo `title` em `JobConfig`)
- Modify: `api/models.py` (modelo `TitleParams`)
- Modify: `api/jobs.py` (`update_title`)
- Modify: `api/routes.py` (rota `PUT /jobs/{slug}/title`)
- Test: `api/tests/test_title_routes.py` (criar)

**Interfaces:**
- Consumes: nada da Task 1.
- Produces:
  - `JobConfig.title: str = ""`
  - `api.models.TitleParams` com o campo `title: str`
  - `api.jobs.update_title(slug: str, jobs_root: Path, title: str) -> None`
  - Rota `PUT /api/jobs/{slug}/title`

- [ ] **Step 1: Escrever o teste que falha**

Criar `api/tests/test_title_routes.py`:

```python
"""PUT /jobs/{slug}/title — nome legível do projeto.

O slug segue sendo o nome da pasta e do arquivo exportado; o título é só para
a pessoa se achar na lista semanas depois.
"""

import json


def _job(client, slug: str):
    """Cria o diretório do job sem passar pelo pipeline."""
    client.put(f"/api/jobs/{slug}/orientation", json={"orientation": "9x16"})


def test_grava_o_titulo(client, tmp_root):
    _job(client, "t1")
    r = client.put("/api/jobs/t1/title", json={"title": "Check-up da carteira"})
    assert r.status_code == 200
    cfg = json.loads((tmp_root / "jobs" / "t1" / "job.config.json").read_text(encoding="utf-8"))
    assert cfg["title"] == "Check-up da carteira"


def test_o_titulo_aparece_na_listagem(client, tmp_root):
    _job(client, "t2")
    client.put("/api/jobs/t2/title", json={"title": "Anúncio de julho"})
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "t2"][0]
    assert item["title"] == "Anúncio de julho"


def test_titulo_vazio_volta_a_usar_o_slug(client, tmp_root):
    _job(client, "t3")
    client.put("/api/jobs/t3/title", json={"title": "Alguma coisa"})
    client.put("/api/jobs/t3/title", json={"title": ""})
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "t3"][0]
    assert item["title"] == ""


def test_espacos_em_volta_sao_descartados(client, tmp_root):
    _job(client, "t4")
    client.put("/api/jobs/t4/title", json={"title": "   Só espaços em volta   "})
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "t4"][0]
    assert item["title"] == "Só espaços em volta"


def test_titulo_so_de_espacos_vira_vazio(client, tmp_root):
    """Senão a lista mostraria um nome em branco em vez de cair no slug."""
    _job(client, "t5")
    client.put("/api/jobs/t5/title", json={"title": "     "})
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "t5"][0]
    assert item["title"] == ""


def test_titulo_nao_mexe_no_resto_do_config(client, tmp_root):
    _job(client, "t6")
    antes = json.loads((tmp_root / "jobs" / "t6" / "job.config.json").read_text(encoding="utf-8"))
    client.put("/api/jobs/t6/title", json={"title": "Novo nome"})
    depois = json.loads((tmp_root / "jobs" / "t6" / "job.config.json").read_text(encoding="utf-8"))
    del depois["title"]
    antes.pop("title", None)
    assert depois == antes


def test_config_antigo_sem_a_chave_le_com_default(client, tmp_root):
    """Projetos criados antes desta feature não têm `title` no config."""
    d = tmp_root / "jobs" / "antigo"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text(json.dumps({"orientation": "9x16"}), encoding="utf-8")
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "antigo"][0]
    assert item["title"] == ""
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_title_routes.py -q`
Expected: FAIL — 404/405, a rota não existe.

- [ ] **Step 3: Campo no `JobConfig`**

Em `pipeline/job.py`, dentro de `JobConfig`, após `orientation`:

```python
    title: str = ""  # nome legível na lista de projetos; "" = usa o slug
```

Retrocompatível: `init_job` faz `JobConfig(**data)` e configs antigos simplesmente não trazem a chave.

- [ ] **Step 4: Modelo do corpo**

Em `api/models.py`, após `OrientationParams`:

```python
class TitleParams(BaseModel):
    title: str = ""
```

- [ ] **Step 5: Gravar**

Em `api/jobs.py`, junto das outras funções `update_*`:

```python
def update_title(slug: str, jobs_root: Path, title: str) -> None:
    """Grava o título legível. Espaços em volta somem, e um título só de
    espaços vira vazio — senão a lista mostraria um nome em branco em vez de
    cair no slug."""
    job = init_job(jobs_root, slug)
    job.config.title = title.strip()
    write_json(job.dir / "job.config.json", asdict(job.config))
```

- [ ] **Step 6: Rota**

Em `api/routes.py`, junto das outras rotas `PUT` do job:

```python
@router.put("/jobs/{slug}/title")
def put_title(slug: str, params: TitleParams):
    jobs_root, *_ = _roots()
    update_title(slug, jobs_root, params.title)
    return {"ok": True}
```

Acrescente `update_title` ao import de `api.jobs` e `TitleParams` ao de `api.models`.

- [ ] **Step 7: Rodar e ver passar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_title_routes.py -q`
Expected: PASS, 7 testes.

- [ ] **Step 8: Commit**

```bash
git add pipeline/job.py api/models.py api/jobs.py api/routes.py api/tests/test_title_routes.py
git commit -m "feat(api): título legível do projeto"
```

---

### Task 3: Apagar projeto e liberar espaço

**Files:**
- Modify: `api/jobs.py` (`delete_job`, `delete_source`)
- Modify: `api/routes.py` (duas rotas `DELETE`)
- Test: `api/tests/test_delete_routes.py` (criar)

**Interfaces:**
- Consumes: `api.jobs.tem_trabalho` da Task 1 (não obrigatório, mas está no arquivo).
- Produces:
  - `api.jobs.delete_job(slug: str, jobs_root: Path) -> bool` — `False` se não existia
  - `api.jobs.delete_source(slug: str, jobs_root: Path) -> bool` — `False` se não havia source
  - Rotas `DELETE /api/jobs/{slug}` e `DELETE /api/jobs/{slug}/source`

**Atenção:** apagar é irreversível e não há lixeira. As duas funções recebem `slug` e montam o caminho — um slug com `..` não pode escapar de `jobs_root`. Valide.

- [ ] **Step 1: Escrever o teste que falha**

Criar `api/tests/test_delete_routes.py`:

```python
"""DELETE de projeto e de source.

O render exportado em output/ sobrevive aos dois, de propósito: é o entregável,
e o usuário costuma apagar o projeto justamente por já tê-lo exportado.
"""

import json


def _criar_job(tmp_root, slug: str, arquivos: dict[str, bytes]) -> None:
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "job.config.json").write_text(json.dumps({"orientation": "9x16"}), encoding="utf-8")
    for nome, conteudo in arquivos.items():
        (d / nome).write_bytes(conteudo)


def test_apaga_o_projeto_inteiro(client, tmp_root):
    _criar_job(tmp_root, "d1", {"source.mp4": b"x", "transcript.json": b"[]"})
    r = client.delete("/api/jobs/d1")
    assert r.status_code == 200
    assert not (tmp_root / "jobs" / "d1").exists()


def test_apagar_o_projeto_preserva_o_render_exportado(client, tmp_root):
    _criar_job(tmp_root, "d2", {"source.mp4": b"x"})
    render = tmp_root / "output" / "d2-9x16.mp4"
    render.write_bytes(b"z")

    client.delete("/api/jobs/d2")
    assert render.exists(), "o render exportado não pode sumir junto"


def test_apagar_projeto_inexistente_responde_404(client, tmp_root):
    assert client.delete("/api/jobs/nunca-existiu").status_code == 404


def test_o_projeto_some_da_listagem(client, tmp_root):
    _criar_job(tmp_root, "d3", {"source.mp4": b"x"})
    assert "d3" in [j["slug"] for j in client.get("/api/jobs").json()]
    client.delete("/api/jobs/d3")
    assert "d3" not in [j["slug"] for j in client.get("/api/jobs").json()]


def test_libera_espaco_apagando_so_o_source(client, tmp_root):
    _criar_job(tmp_root, "d4", {
        "source.mp4": b"x" * 100,
        "trimmed.mp4": b"y" * 10,
        "transcript.json": b"[]",
        "overlays.json": b"[]",
    })
    r = client.delete("/api/jobs/d4/source")
    assert r.status_code == 200

    d = tmp_root / "jobs" / "d4"
    assert not (d / "source.mp4").exists()
    assert (d / "trimmed.mp4").exists()
    assert (d / "transcript.json").exists()
    assert (d / "overlays.json").exists()


def test_apos_liberar_espaco_a_lista_marca_sem_source(client, tmp_root):
    _criar_job(tmp_root, "d5", {"source.mp4": b"x" * 100, "trimmed.mp4": b"y"})
    client.delete("/api/jobs/d5/source")
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "d5"][0]
    assert item["has_source"] is False
    assert item["bytes_source"] == 0


def test_liberar_espaco_sem_source_responde_404(client, tmp_root):
    _criar_job(tmp_root, "d6", {"trimmed.mp4": b"y"})
    assert client.delete("/api/jobs/d6/source").status_code == 404


def test_slug_com_travessia_de_caminho_e_recusado(client, tmp_root):
    """`..` não pode escapar de jobs_root — apagar é irreversível."""
    vitima = tmp_root / "jobs" / "vizinho"
    vitima.mkdir(parents=True)
    (vitima / "job.config.json").write_text("{}", encoding="utf-8")

    r = client.delete("/api/jobs/..%2Fvizinho")
    assert r.status_code in (400, 404)
    assert vitima.exists()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_delete_routes.py -q`
Expected: FAIL — 405, as rotas não existem.

- [ ] **Step 3: Implementar em `api/jobs.py`**

Adicionar após `list_jobs`:

```python
def _job_dir_seguro(slug: str, jobs_root: Path) -> Path | None:
    """Caminho do job, ou None se o slug tentar escapar de jobs_root.

    Apagar é irreversível e não há lixeira: um slug com `..` ou barra não pode
    virar um caminho fora da pasta de jobs.
    """
    root = Path(jobs_root).resolve()
    alvo = (root / slug).resolve()
    if alvo == root or root not in alvo.parents:
        return None
    return alvo


def delete_job(slug: str, jobs_root: Path) -> bool:
    """Apaga o diretório do job. Não toca em output/ — o render exportado
    sobrevive de propósito. Devolve False se não havia o que apagar."""
    alvo = _job_dir_seguro(slug, jobs_root)
    if alvo is None or not alvo.is_dir():
        return False
    shutil.rmtree(alvo)
    return True


def delete_source(slug: str, jobs_root: Path) -> bool:
    """Apaga só o source.mp4, mantendo corte, transcrição e textos.

    O que se perde: refazer o corte automático (stage_cut é o único leitor do
    source) e o master em resolução original. O que continua: transcrever,
    editar textos, cortes manuais e renderizar, que operam sobre o trimmed.
    """
    alvo = _job_dir_seguro(slug, jobs_root)
    if alvo is None:
        return False
    source = alvo / "source.mp4"
    if not source.exists():
        return False
    source.unlink()
    return True
```

`api/jobs.py` hoje começa com `import re`; `shutil` **não** está importado. Acrescente `import shutil` no topo, junto de `import re`.

- [ ] **Step 4: As duas rotas**

Em `api/routes.py`, logo após a rota `GET /jobs/{slug}`:

```python
@router.delete("/jobs/{slug}")
def remove_job(slug: str):
    """Apaga o projeto. O render exportado em output/ é mantido."""
    jobs_root, *_ = _roots()
    if not delete_job(slug, jobs_root):
        raise HTTPException(status_code=404, detail="projeto não encontrado")
    return {"ok": True}


@router.delete("/jobs/{slug}/source")
def remove_source(slug: str):
    """Apaga só o vídeo original, para liberar espaço."""
    jobs_root, *_ = _roots()
    if not delete_source(slug, jobs_root):
        raise HTTPException(status_code=404, detail="este projeto não tem vídeo original")
    return {"ok": True}
```

Acrescente `delete_job` e `delete_source` ao import de `api.jobs`.

- [ ] **Step 5: Rodar e ver passar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_delete_routes.py -q`
Expected: PASS, 8 testes.

- [ ] **Step 6: Suíte inteira do backend**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: só o baseline de TTS falha.

- [ ] **Step 7: Commit**

```bash
git add api/jobs.py api/routes.py api/tests/test_delete_routes.py
git commit -m "feat(api): apagar projeto e liberar espaço apagando o source"
```

---

### Task 4: Cliente das três ações no front

**Files:**
- Modify: `web/src/types.ts` (`bytes_render` em `JobSummary`)
- Modify: `web/src/api.ts` (`putTitle`, `deleteJob`, `deleteSource`)
- Test: `web/src/__tests__/projectActions.test.ts` (criar)

**Interfaces:**
- Consumes: as três rotas das Tasks 1-3.
- Produces:
  - `api.putTitle(slug: string, title: string): Promise<void>`
  - `api.deleteJob(slug: string): Promise<void>`
  - `api.deleteSource(slug: string): Promise<void>`
  - `types.JobSummary.bytes_render: number`

- [ ] **Step 1: Escrever o teste que falha**

Criar `web/src/__tests__/projectActions.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { putTitle, deleteJob, deleteSource } from "../api";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status = 200, body: unknown = { ok: true }) {
  const f = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("putTitle", () => {
  it("manda o título no corpo", async () => {
    const f = stubFetch();
    await putTitle("A1", "Check-up da carteira");
    const [url, init] = f.mock.calls[0] as any[];
    expect(url).toContain("/jobs/A1/title");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ title: "Check-up da carteira" });
  });
});

describe("deleteJob", () => {
  it("chama DELETE no projeto", async () => {
    const f = stubFetch();
    await deleteJob("A1");
    const [url, init] = f.mock.calls[0] as any[];
    expect(url).toContain("/jobs/A1");
    expect(init.method).toBe("DELETE");
  });

  it("propaga erro do servidor", async () => {
    stubFetch(404, { detail: "projeto não encontrado" });
    await expect(deleteJob("sumiu")).rejects.toThrow(/não encontrado/);
  });
});

describe("deleteSource", () => {
  it("chama DELETE no source", async () => {
    const f = stubFetch();
    await deleteSource("A1");
    const [url, init] = f.mock.calls[0] as any[];
    expect(url).toContain("/jobs/A1/source");
    expect(init.method).toBe("DELETE");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/projectActions.test.ts`
Expected: FAIL — as três funções não são exportadas.

- [ ] **Step 3: Tipo**

Em `web/src/types.ts`, dentro de `JobSummary`, após `bytes_total`:

```ts
  // renders exportados; sobrevivem a apagar o projeto
  bytes_render: number;
```

- [ ] **Step 4: As três funções**

Em `web/src/api.ts`, junto das outras funções de job:

```ts
export async function putTitle(slug: string, title: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/title`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  }));
}

export async function deleteJob(slug: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}`, { method: "DELETE" }));
}

export async function deleteSource(slug: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/source`, { method: "DELETE" }));
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/projectActions.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/api.ts web/src/__tests__/projectActions.test.ts
git commit -m "feat(web): cliente de título, excluir projeto e liberar espaço"
```

---

### Task 5: As três ações na tela de projetos

**Files:**
- Modify: `web/src/ProjectsScreen.tsx`
- Test: `web/src/__tests__/ProjectsScreen.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `api.putTitle`, `api.deleteJob`, `api.deleteSource` e `JobSummary.bytes_render` da Task 4.
- Produces: nada que outra tarefa consuma.

**Desenho:** cada linha ganha um botão de renomear (que troca o nome por um input), e dois botões destrutivos. Os destrutivos pedem confirmação **na própria linha**, não com `window.confirm` — a confirmação precisa dizer o que sobrevive, e `confirm` não formata isso. Só uma linha por vez fica em modo de confirmação.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `web/src/__tests__/ProjectsScreen.test.tsx`:

```tsx
describe("ProjectsScreen — renomear", () => {
  it("salva o título e mostra o novo nome", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /renomear A1/i }));
    fireEvent.change(screen.getByLabelText(/título de A1/i), {
      target: { value: "Check-up da carteira" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar nome de A1/i }));
    await waitFor(() =>
      expect(api.putTitle).toHaveBeenCalledWith("A1", "Check-up da carteira"));
    expect(await screen.findByText("Check-up da carteira")).toBeInTheDocument();
  });

  it("cancelar não grava nada", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /renomear A1/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(api.putTitle).not.toHaveBeenCalled();
  });
});

describe("ProjectsScreen — excluir", () => {
  it("pede confirmação antes e diz que o render sobrevive", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    expect(await screen.findByText(/vídeo já exportado/i)).toBeInTheDocument();
    expect(api.deleteJob).not.toHaveBeenCalled();
  });

  it("confirmar apaga e tira o projeto da lista", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirmar exclusão/i }));
    await waitFor(() => expect(api.deleteJob).toHaveBeenCalledWith("A1"));
    await waitFor(() => expect(screen.queryByText("A1")).not.toBeInTheDocument());
  });

  it("desistir fecha a confirmação sem apagar", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /desistir/i }));
    expect(api.deleteJob).not.toHaveBeenCalled();
    expect(screen.getByText("A1")).toBeInTheDocument();
  });
});

describe("ProjectsScreen — liberar espaço", () => {
  it("diz o quanto libera e o que deixa de ser possível", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /liberar espaço de A1/i }));
    expect(await screen.findByText(/detectar pausas/i)).toBeInTheDocument();
    expect(screen.getByText(/361(,|\.)6 MB/)).toBeInTheDocument();
  });

  it("confirmar apaga só o source e atualiza a linha", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /liberar espaço de A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(api.deleteSource).toHaveBeenCalledWith("A1"));
    expect(screen.getByText("A1")).toBeInTheDocument();
  });

  it("projeto sem source não oferece liberar espaço", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([
      { ...projeto, has_source: false, bytes_source: 0 },
    ]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    await screen.findByText("A1");
    expect(screen.queryByRole("button", { name: /liberar espaço/i })).not.toBeInTheDocument();
  });
});
```

No topo do arquivo, o mock de `../api` precisa ganhar as três funções novas. Substitua a linha do `vi.mock` por:

```tsx
const { listJobs, putTitle, deleteJob, deleteSource } = vi.hoisted(() => ({
  listJobs: vi.fn(),
  putTitle: vi.fn(async () => {}),
  deleteJob: vi.fn(async () => {}),
  deleteSource: vi.fn(async () => {}),
}));
vi.mock("../api", () => ({ listJobs, putTitle, deleteJob, deleteSource }));
```

E o objeto `projeto` do arquivo precisa de `bytes_render: 0` para casar com o tipo.

- [ ] **Step 2: Rodar e ver falhar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/ProjectsScreen.test.tsx`
Expected: FAIL — os botões não existem.

- [ ] **Step 3: Implementar**

Substituir `web/src/ProjectsScreen.tsx` por:

```tsx
import { useEffect, useState } from "react";
import { listJobs, putTitle, deleteJob, deleteSource } from "./api";
import type { JobSummary } from "./types";

const LABEL_FORMATO: Record<string, string> = {
  "16x9": "16:9",
  "9x16": "9:16",
};

/** Em que ponto do wizard o projeto parou, para a lista dar contexto. */
function progresso(j: JobSummary): string {
  if (j.has_render_16x9 || j.has_render_9x16) return "renderizado";
  if (j.has_recipe) return "pronto para renderizar";
  if (j.has_hook) return "com hook";
  if (j.has_transcript) return "transcrito";
  if (j.has_trimmed) return "cortado";
  if (!j.has_source) return "sem vídeo";
  return "só o vídeo";
}

function tamanho(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function quando(epochSegundos: number): string {
  if (!epochSegundos) return "";
  return new Date(epochSegundos * 1000).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

// Uma linha por vez em modo de edição ou confirmação — duas confirmações
// destrutivas abertas ao mesmo tempo é convite para clicar na errada.
type Modo = { slug: string; tipo: "renomeando" | "excluindo" | "liberando" } | null;

export const ProjectsScreen: React.FC<{
  onOpen: (slug: string) => void;
  onNew: () => void;
}> = ({ onOpen, onNew }) => {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [rascunho, setRascunho] = useState("");

  useEffect(() => {
    let vivo = true;
    listJobs()
      .then((l) => { if (vivo) setJobs(l); })
      .catch(() => { if (vivo) setErr("não consegui carregar os projetos"); });
    return () => { vivo = false; };
  }, []);

  type Tipo = "renomeando" | "excluindo" | "liberando";
  const emModo = (j: JobSummary, tipo: Tipo) =>
    modo?.slug === j.slug && modo?.tipo === tipo;

  const salvarTitulo = async (j: JobSummary) => {
    const novo = rascunho.trim();
    setModo(null);
    try {
      await putTitle(j.slug, novo);
      setJobs((l) => (l ?? []).map((x) => (x.slug === j.slug ? { ...x, title: novo } : x)));
    } catch {
      setErr("não consegui salvar o nome");
    }
  };

  const excluir = async (j: JobSummary) => {
    setModo(null);
    try {
      await deleteJob(j.slug);
      setJobs((l) => (l ?? []).filter((x) => x.slug !== j.slug));
    } catch {
      setErr("não consegui apagar o projeto");
    }
  };

  const liberar = async (j: JobSummary) => {
    setModo(null);
    try {
      await deleteSource(j.slug);
      setJobs((l) => (l ?? []).map((x) => (
        x.slug === j.slug
          ? { ...x, has_source: false, bytes_source: 0, bytes_total: x.bytes_total - x.bytes_source }
          : x
      )));
    } catch {
      setErr("não consegui liberar o espaço");
    }
  };

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Projetos</h1>
        <button onClick={onNew} className="px-4 py-2 bg-emerald-600 rounded font-medium">
          Novo projeto
        </button>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}

      {jobs && jobs.length === 0 && (
        <p className="text-zinc-400">Nenhum projeto ainda. Crie o primeiro para começar.</p>
      )}

      <ul className="space-y-2">
        {(jobs ?? []).map((j) => (
          <li key={j.slug} className="bg-zinc-900 border border-zinc-800 rounded p-4 space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                {emModo(j, "renomeando") ? (
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={`título de ${j.slug}`}
                      className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm"
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      placeholder={j.slug}
                    />
                    <button
                      aria-label={`salvar nome de ${j.slug}`}
                      onClick={() => salvarTitulo(j)}
                      className="px-3 py-1 bg-emerald-600 rounded text-sm"
                    >
                      Salvar
                    </button>
                    <button onClick={() => setModo(null)} className="px-3 py-1 bg-zinc-800 rounded text-sm">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-zinc-100 truncate">{j.title || j.slug}</p>
                    <p className="text-sm text-zinc-400">
                      {j.title ? `${j.slug} · ` : ""}
                      {LABEL_FORMATO[j.orientation] ?? j.orientation} · {progresso(j)}
                      {" · "}{tamanho(j.bytes_total)}
                      {quando(j.updated_at) && ` · ${quando(j.updated_at)}`}
                    </p>
                  </>
                )}
              </div>

              {!emModo(j, "renomeando") && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    aria-label={`abrir ${j.slug}`}
                    onClick={() => onOpen(j.slug)}
                    className="px-3 py-1 bg-zinc-800 rounded text-sm"
                  >
                    Abrir
                  </button>
                  <button
                    aria-label={`renomear ${j.slug}`}
                    onClick={() => { setRascunho(j.title); setModo({ slug: j.slug, tipo: "renomeando" }); }}
                    className="px-3 py-1 bg-zinc-800 rounded text-sm"
                  >
                    Renomear
                  </button>
                  {j.has_source && (
                    <button
                      aria-label={`liberar espaço de ${j.slug}`}
                      onClick={() => setModo({ slug: j.slug, tipo: "liberando" })}
                      className="px-3 py-1 bg-zinc-800 rounded text-sm"
                    >
                      Liberar espaço
                    </button>
                  )}
                  <button
                    aria-label={`excluir ${j.slug}`}
                    onClick={() => setModo({ slug: j.slug, tipo: "excluindo" })}
                    className="px-3 py-1 bg-zinc-800 rounded text-sm text-red-400"
                  >
                    Excluir
                  </button>
                </div>
              )}
            </div>

            {emModo(j, "excluindo") && (
              <div role="alertdialog" aria-label={`confirmar exclusão de ${j.slug}`}
                   className="rounded border border-red-800 bg-red-950/40 p-3 text-sm space-y-2">
                <p className="text-red-200">
                  Apagar <strong>{j.title || j.slug}</strong> descarta o vídeo, o corte, a
                  transcrição e os textos. O vídeo já exportado é mantido.
                </p>
                <div className="flex gap-2">
                  <button
                    aria-label={`confirmar exclusão de ${j.slug}`}
                    onClick={() => excluir(j)}
                    className="px-3 py-1 bg-red-900 rounded"
                  >
                    Apagar mesmo assim
                  </button>
                  <button onClick={() => setModo(null)} className="px-3 py-1 bg-zinc-800 rounded">
                    Desistir
                  </button>
                </div>
              </div>
            )}

            {emModo(j, "liberando") && (
              <div role="alertdialog" aria-label={`confirmar liberar espaço de ${j.slug}`}
                   className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm space-y-2">
                <p className="text-amber-200">
                  Libera <strong>{tamanho(j.bytes_source)}</strong> apagando o vídeo original.
                  Você continua podendo editar textos, legendas e renderizar — mas
                  <strong> Detectar pausas</strong> deixa de funcionar neste projeto, e a
                  resolução original se perde.
                </p>
                <div className="flex gap-2">
                  <button
                    aria-label={`confirmar liberar espaço de ${j.slug}`}
                    onClick={() => liberar(j)}
                    className="px-3 py-1 bg-amber-800 rounded"
                  >
                    Confirmar
                  </button>
                  <button onClick={() => setModo(null)} className="px-3 py-1 bg-zinc-800 rounded">
                    Desistir
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/ProjectsScreen.test.tsx`
Expected: PASS — os testes novos e os 8 que já existiam.

- [ ] **Step 5: As duas suítes inteiras e os tipos**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: só o baseline de TTS falha.

Run: `web/node_modules/.bin/vitest.cmd run --root web`
Expected: só `captionParity` e `overlayAnimParity` falham.

Run: `web/node_modules/.bin/tsc.cmd --noEmit -p web/tsconfig.json`
Expected: só os 5 erros pré-existentes.

- [ ] **Step 6: Commit**

```bash
git add web/src/ProjectsScreen.tsx web/src/__tests__/ProjectsScreen.test.tsx
git commit -m "feat(web): renomear, excluir e liberar espaço na tela de projetos"
```
