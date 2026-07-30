# Tela de projetos — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Listar os projetos salvos, abrir qualquer um deles, e impedir que um upload sobrescreva silenciosamente o trabalho de outro projeto.

**Architecture:** Uma rota de listagem que varre `jobs/` sem criar nada, uma guarda de 409 no upload, e uma tela de projetos que aparece quando nenhum projeto está aberto. O wizard existente não muda de estrutura: ele passa a ser renderizado só depois que há um projeto escolhido.

**Tech Stack:** FastAPI + pydantic v2 no backend; React 19 + TypeScript + Tailwind no front; pytest e vitest + Testing Library nos testes.

**Spec:** `docs/superpowers/specs/2026-07-30-tela-de-projetos-design.md`

## Global Constraints

- **Fase 1 apenas.** Título editável, excluir projeto e liberar espaço são fase 2. Os avisos de cut sem source e da cascata do corte manual são fase 3. Não implemente nada dessas fases.
- **`init_job` cria o diretório** (`pipeline/job.py`). Nenhum código que apenas consulta pode chamá-lo — consultar um slug inexistente o criaria. A listagem lê `job.config.json` direto.
- **`DELETE` de qualquer natureza está fora desta fase.** Nada neste plano apaga arquivos.
- **Rodar os testes do front:** `npm test` dentro de `web/` está quebrado neste ambiente (falha nas 31 suítes por causa do diretório de trabalho). Use, a partir da raiz do repositório: `web/node_modules/.bin/vitest.cmd run --root web <arquivo>`
- **Rodar os testes do backend:** `.venv/Scripts/python.exe -m pytest <arquivo> -q` a partir da raiz. `python3` não existe nesta máquina.
- **Baseline de falhas:** `api/tests/test_tts_routes.py::test_happy_path` já falha antes deste trabalho, e as duas suítes de paridade do front (`captionParity`, `overlayAnimParity`) falham quando o vitest roda com `--root web`. Não são regressões e não devem ser "consertadas" aqui.
- **Idioma:** comentários, mensagens de erro e textos de UI em português, como o resto do código.

---

### Task 1: Listagem de projetos no backend

**Files:**
- Modify: `api/models.py` (adicionar `JobSummary` após `JobState`)
- Modify: `api/jobs.py` (adicionar `list_jobs`)
- Modify: `api/routes.py` (adicionar `GET /jobs`, importar `list_jobs` e `JobSummary`)
- Test: `api/tests/test_jobs_list.py` (criar)

**Interfaces:**
- Consumes: nada de tarefas anteriores.
- Produces:
  - `api.models.JobSummary` com os campos `slug: str`, `title: str`, `updated_at: float`, `orientation: str`, `has_source: bool`, `has_trimmed: bool`, `has_transcript: bool`, `has_hook: bool`, `has_recipe: bool`, `has_render_16x9: bool`, `has_render_9x16: bool`, `bytes_source: int`, `bytes_total: int`
  - `api.jobs.list_jobs(jobs_root: Path, output_root: Path) -> list[JobSummary]`
  - `api.jobs.job_summary(job_dir: Path, output_root: Path) -> JobSummary | None` — `None` quando o diretório não é um job
  - Rota `GET /api/jobs` devolvendo `list[JobSummary]`

- [ ] **Step 1: Escrever o teste que falha**

Criar `api/tests/test_jobs_list.py`:

```python
"""GET /api/jobs — a lista de projetos salvos.

Os artefatos são escritos à mão: o pipeline real depende de ffmpeg e o que
está sob teste é a varredura do diretório, não o processamento de vídeo.
"""

import json


def _criar_job(tmp_root, slug: str, arquivos: dict[str, bytes]) -> None:
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "job.config.json").write_text(json.dumps({"orientation": "9x16"}), encoding="utf-8")
    for nome, conteudo in arquivos.items():
        (d / nome).write_bytes(conteudo)


def test_sem_projetos_devolve_lista_vazia(client, tmp_root):
    assert client.get("/api/jobs").json() == []


def test_lista_os_projetos_com_o_progresso_de_cada_um(client, tmp_root):
    _criar_job(tmp_root, "A1", {
        "source.mp4": b"x" * 100,
        "trimmed.mp4": b"y" * 50,
        "transcript.json": b"[]",
    })

    body = client.get("/api/jobs").json()
    assert len(body) == 1
    item = body[0]
    assert item["slug"] == "A1"
    assert item["orientation"] == "9x16"
    assert item["has_source"] is True
    assert item["has_trimmed"] is True
    assert item["has_transcript"] is True
    assert item["has_hook"] is False
    assert item["has_recipe"] is False


def test_reporta_o_espaco_ocupado(client, tmp_root):
    _criar_job(tmp_root, "A1", {"source.mp4": b"x" * 100, "trimmed.mp4": b"y" * 50})
    item = client.get("/api/jobs").json()[0]
    assert item["bytes_source"] == 100
    # 100 + 50 + o job.config.json
    assert item["bytes_total"] > 150


def test_marca_os_renders_ja_exportados(client, tmp_root):
    _criar_job(tmp_root, "A1", {"trimmed.mp4": b"y"})
    (tmp_root / "output" / "A1-9x16.mp4").write_bytes(b"z")

    item = client.get("/api/jobs").json()[0]
    assert item["has_render_9x16"] is True
    assert item["has_render_16x9"] is False


def test_ignora_arquivos_soltos_e_pastas_que_nao_sao_job(client, tmp_root):
    _criar_job(tmp_root, "A1", {})
    (tmp_root / "jobs" / "leiame.txt").write_text("nao sou um job", encoding="utf-8")
    (tmp_root / "jobs" / "lixo").mkdir()

    slugs = [j["slug"] for j in client.get("/api/jobs").json()]
    assert slugs == ["A1"]


def test_listar_nao_cria_diretorio_para_slug_inexistente(client, tmp_root):
    """init_job cria diretório; a listagem não pode usá-lo."""
    client.get("/api/jobs")
    assert list((tmp_root / "jobs").iterdir()) == []


def test_mais_recente_primeiro(client, tmp_root):
    import os
    _criar_job(tmp_root, "antigo", {"trimmed.mp4": b"a"})
    _criar_job(tmp_root, "novo", {"trimmed.mp4": b"b"})
    antigo = tmp_root / "jobs" / "antigo"
    for p in antigo.iterdir():
        os.utime(p, (1_000_000, 1_000_000))

    slugs = [j["slug"] for j in client.get("/api/jobs").json()]
    assert slugs == ["novo", "antigo"]
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_jobs_list.py -q`
Expected: FAIL — todos os testes com 404, porque `GET /api/jobs` não existe (só `POST`).

- [ ] **Step 3: Adicionar o modelo `JobSummary`**

Em `api/models.py`, logo após a classe `JobState`:

```python
class JobSummary(BaseModel):
    """Um projeto na tela de lista. Só o que a lista precisa mostrar."""
    slug: str
    title: str = ""
    updated_at: float = 0.0
    orientation: str = "16x9"
    has_source: bool = False
    has_trimmed: bool = False
    has_transcript: bool = False
    has_hook: bool = False
    has_recipe: bool = False
    has_render_16x9: bool = False
    has_render_9x16: bool = False
    bytes_source: int = 0
    bytes_total: int = 0
```

O campo `title` já entra aqui com default vazio para o formato da resposta não
mudar quando a fase 2 tornar o título editável. Nesta fase ele é só lido do
`job.config.json`, nunca escrito.

- [ ] **Step 4: Implementar `job_summary` e `list_jobs`**

Em `api/jobs.py`, adicionar após a função `cut_result`. O import de `JobSummary`
entra na linha de `from api.models import ...` que já existe:

```python
def job_summary(job_dir: Path, output_root: Path) -> JobSummary | None:
    """Resumo de um projeto, ou None se o diretório não for um job.

    Lê o job.config.json direto em vez de chamar init_job: init_job cria o
    diretório, e consultar um slug inexistente não pode criá-lo.
    """
    cfg_path = job_dir / "job.config.json"
    if not job_dir.is_dir() or not cfg_path.exists():
        return None
    try:
        cfg = load_json(cfg_path)
    except Exception:
        return None

    arquivos = [p for p in job_dir.iterdir() if p.is_file()]
    source = job_dir / "source.mp4"
    probe = None
    probe_path = job_dir / "probe.json"
    if probe_path.exists():
        try:
            probe = load_json(probe_path)
        except Exception:
            probe = None

    slug = job_dir.name
    return JobSummary(
        slug=slug,
        title=cfg.get("title", ""),
        updated_at=max((p.stat().st_mtime for p in arquivos), default=0.0),
        orientation=resolve_orientation(cfg.get("orientation", ""), probe),
        has_source=source.exists(),
        has_trimmed=(job_dir / "trimmed.mp4").exists(),
        has_transcript=(job_dir / "transcript.json").exists(),
        has_hook=(job_dir / "hook.json").exists(),
        has_recipe=(job_dir / "edit-recipe.json").exists(),
        has_render_16x9=(output_root / f"{slug}-16x9.mp4").exists(),
        has_render_9x16=(output_root / f"{slug}-9x16.mp4").exists(),
        bytes_source=source.stat().st_size if source.exists() else 0,
        bytes_total=sum(p.stat().st_size for p in arquivos),
    )


def list_jobs(jobs_root: Path, output_root: Path) -> list[JobSummary]:
    """Projetos existentes, do mais recente para o mais antigo."""
    root = Path(jobs_root)
    if not root.is_dir():
        return []
    resumos = [s for s in (job_summary(d, Path(output_root)) for d in root.iterdir()) if s]
    return sorted(resumos, key=lambda s: s.updated_at, reverse=True)
```

- [ ] **Step 5: Adicionar a rota**

Em `api/routes.py`, imediatamente antes de `@router.post("/jobs")`:

```python
@router.get("/jobs")
def read_jobs() -> list[JobSummary]:
    """Projetos salvos, para a tela de lista."""
    jobs_root, _, output_root = _roots()
    return list_jobs(jobs_root, output_root)
```

E ajustar os dois imports existentes:

```python
from api.jobs import (
    allowed_file_path, cut_result, get_state, list_jobs, suggest_hook,
    update_brand_kit, update_caption_style, update_config,
    update_hook_card_frames, update_orientation, update_whisper_model,
)
from api.models import (
    CaptionStyleParams, CutParams, CutResult,
    Hook, JobSummary, OrientationParams, OverlayParams, RefineParams,
    SuggestDefaults, Suggestion, TranscribeParams,
)
```

- [ ] **Step 6: Rodar os testes e ver passar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_jobs_list.py -q`
Expected: PASS, 7 testes.

- [ ] **Step 7: Rodar a suíte inteira do backend**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: só `api/tests/test_tts_routes.py::test_happy_path` falha (baseline).

- [ ] **Step 8: Commit**

```bash
git add api/models.py api/jobs.py api/routes.py api/tests/test_jobs_list.py
git commit -m "feat(api): GET /jobs lista os projetos salvos"
```

---

### Task 2: Guarda contra sobrescrita no upload

**Files:**
- Modify: `api/routes.py:45-66` (a função `create_job`)
- Test: `api/tests/test_upload_guard.py` (criar)

**Interfaces:**
- Consumes: `api.jobs.job_summary` e `api.models.JobSummary` da Task 1.
- Produces:
  - `POST /api/jobs` aceita o campo de formulário `overwrite: bool = Form(default=False)`
  - 409 com `detail` = o dict de um `JobSummary` quando o slug já tem trabalho e `overwrite` é falso
  - `api.routes._tem_trabalho(resumo: JobSummary) -> bool`

- [ ] **Step 1: Escrever o teste que falha**

Criar `api/tests/test_upload_guard.py`:

```python
"""POST /api/jobs não pode sobrescrever um projeto em silêncio.

O campo de nome no passo 1 vem preenchido com o slug atual, então reusar o nome
do projeto anterior é o caminho de menor esforço — foi assim que um upload
trocou o source de um job que já tinha transcrição e textos.
"""

import json


def _criar_job_com_trabalho(tmp_root, slug: str) -> None:
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "job.config.json").write_text(json.dumps({"orientation": "9x16"}), encoding="utf-8")
    (d / "source.mp4").write_bytes(b"video antigo")
    (d / "trimmed.mp4").write_bytes(b"cortado")
    (d / "transcript.json").write_text("[]", encoding="utf-8")


def _upload(client, slug: str, sample_mp4, overwrite=None):
    data = {"slug": slug}
    if overwrite is not None:
        data["overwrite"] = str(overwrite).lower()
    return client.post(
        "/api/jobs",
        files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
        data=data,
    )


def test_recusa_upload_para_slug_que_ja_tem_trabalho(client, tmp_root, sample_mp4):
    _criar_job_com_trabalho(tmp_root, "A1")
    r = _upload(client, "A1", sample_mp4)
    assert r.status_code == 409


def test_o_409_diz_o_que_existe_naquele_projeto(client, tmp_root, sample_mp4):
    """A UI monta o diálogo com isso, sem uma segunda chamada."""
    _criar_job_com_trabalho(tmp_root, "A1")
    detail = _upload(client, "A1", sample_mp4).json()["detail"]
    assert detail["slug"] == "A1"
    assert detail["has_transcript"] is True
    assert detail["has_trimmed"] is True


def test_nao_toca_no_projeto_ao_recusar(client, tmp_root, sample_mp4):
    _criar_job_com_trabalho(tmp_root, "A1")
    _upload(client, "A1", sample_mp4)
    assert (tmp_root / "jobs" / "A1" / "source.mp4").read_bytes() == b"video antigo"
    assert (tmp_root / "jobs" / "A1" / "transcript.json").exists()


def test_overwrite_explicito_passa(client, tmp_root, sample_mp4):
    _criar_job_com_trabalho(tmp_root, "A1")
    r = _upload(client, "A1", sample_mp4, overwrite=True)
    assert r.status_code == 200
    assert (tmp_root / "jobs" / "A1" / "source.mp4").read_bytes() != b"video antigo"


def test_slug_novo_nao_precisa_de_overwrite(client, tmp_root, sample_mp4):
    assert _upload(client, "novissimo", sample_mp4).status_code == 200


def test_slug_existente_mas_vazio_nao_bloqueia(client, tmp_root, sample_mp4):
    """Só job.config.json: não há trabalho a perder."""
    d = tmp_root / "jobs" / "vazio"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text(json.dumps({}), encoding="utf-8")
    assert _upload(client, "vazio", sample_mp4).status_code == 200
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_upload_guard.py -q`
Expected: FAIL — os testes de 409 recebem 200, porque hoje o upload sempre grava.

- [ ] **Step 3: Implementar a guarda**

Em `api/routes.py`, substituir a função `create_job` inteira por:

```python
def _tem_trabalho(resumo: JobSummary) -> bool:
    """Se há algo a perder ao trocar o vídeo deste projeto.

    O source conta: reenviar por cima dele é exatamente o caso que queremos
    tornar explícito. Um slug que existe só com job.config.json não conta.
    """
    return any((
        resumo.has_source, resumo.has_trimmed, resumo.has_transcript,
        resumo.has_hook, resumo.has_recipe,
    ))


@router.post("/jobs")
async def create_job(
    files: list[UploadFile] = File(...),
    slug: str = Form(default="job"),
    overwrite: bool = Form(default=False),
):
    jobs_root, input_root, output_root = _roots()
    input_root.mkdir(parents=True, exist_ok=True)
    if not files:
        raise HTTPException(status_code=400, detail="envie ao menos um arquivo")

    # Antes de gravar qualquer byte: subir um vídeo por cima de um projeto com
    # trabalho apaga o corte, a transcrição e os textos dele (stage_ingest). A
    # guarda vive aqui, e não só no diálogo da tela, para que a sobrescrita
    # silenciosa seja impossível por qualquer caminho.
    if not overwrite:
        existente = job_summary(Path(jobs_root) / slug, output_root)
        if existente and _tem_trabalho(existente):
            raise HTTPException(status_code=409, detail=existente.model_dump())

    paths: list[str] = []
    for i, f in enumerate(files):
        suffix = Path(f.filename or "").suffix or ".mp4"
        upload_path = input_root / f"{slug}-part{i}{suffix}"
        with upload_path.open("wb") as out:
            shutil.copyfileobj(f.file, out)
        paths.append(str(upload_path))
    job = init_job(jobs_root, slug)
    try:
        stage_ingest(job, paths)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ingest falhou: {e}")
    state = get_state(slug, jobs_root)
    return {"slug": slug, "probe": state.probe.model_dump() if state.probe else None}
```

E acrescentar `job_summary` ao import de `api.jobs`:

```python
from api.jobs import (
    allowed_file_path, cut_result, get_state, job_summary, list_jobs, suggest_hook,
    update_brand_kit, update_caption_style, update_config,
    update_hook_card_frames, update_orientation, update_whisper_model,
)
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_upload_guard.py -q`
Expected: PASS, 6 testes.

- [ ] **Step 5: Rodar a suíte inteira do backend**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: só o baseline de TTS falha. Em especial, `tests/test_stages.py` continua verde — a guarda vem antes da invalidação do `stage_ingest`, não no lugar dela.

- [ ] **Step 6: Commit**

```bash
git add api/routes.py api/tests/test_upload_guard.py
git commit -m "feat(api): upload recusa slug com trabalho sem overwrite explícito"
```

---

### Task 3: Cliente e sugestão de slug no front

**Files:**
- Modify: `web/src/types.ts` (adicionar `JobSummary`)
- Modify: `web/src/api.ts` (adicionar `listJobs`, `SlugOcupado`, alterar `uploadJob`)
- Create: `web/src/slug.ts`
- Test: `web/src/__tests__/slug.test.ts` (criar)
- Test: `web/src/__tests__/uploadGuard.test.ts` (criar)

**Interfaces:**
- Consumes: o formato de `JobSummary` e o 409 das Tasks 1 e 2.
- Produces:
  - `types.JobSummary` — espelho do modelo do backend
  - `api.listJobs(): Promise<JobSummary[]>`
  - `api.SlugOcupado` — `Error` com a propriedade `existente: JobSummary`
  - `api.uploadJob(files: File[], slug: string, overwrite?: boolean)` — assinatura estendida, `overwrite` default `false`
  - `slug.proximoSlugLivre(existentes: string[]): string`

- [ ] **Step 1: Escrever os testes que falham**

Criar `web/src/__tests__/slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { proximoSlugLivre } from "../slug";

describe("proximoSlugLivre", () => {
  it("sem projetos, sugere A1", () => {
    expect(proximoSlugLivre([])).toBe("A1");
  });

  it("pula os nomes já usados", () => {
    expect(proximoSlugLivre(["A1", "A2", "A3"])).toBe("A4");
  });

  it("preenche buracos na sequência", () => {
    expect(proximoSlugLivre(["A1", "A3"])).toBe("A2");
  });

  it("ignora projetos com outro padrão de nome", () => {
    expect(proximoSlugLivre(["demo", "fala"])).toBe("A1");
  });
});
```

Criar `web/src/__tests__/uploadGuard.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadJob, listJobs, SlugOcupado } from "../api";

afterEach(() => vi.unstubAllGlobals());

const resumo = {
  slug: "A1", title: "", updated_at: 0, orientation: "9x16",
  has_source: true, has_trimmed: true, has_transcript: true,
  has_hook: false, has_recipe: false,
  has_render_16x9: false, has_render_9x16: false,
  bytes_source: 100, bytes_total: 150,
};

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("listJobs", () => {
  it("devolve a lista do backend", async () => {
    stubFetch(200, [resumo]);
    expect((await listJobs())[0].slug).toBe("A1");
  });
});

describe("uploadJob", () => {
  it("no 409, lança SlugOcupado carregando o projeto existente", async () => {
    stubFetch(409, { detail: resumo });
    await expect(uploadJob([], "A1")).rejects.toBeInstanceOf(SlugOcupado);
    try {
      await uploadJob([], "A1");
    } catch (e) {
      expect((e as SlugOcupado).existente.has_transcript).toBe(true);
    }
  });

  it("manda overwrite=false por padrão", async () => {
    const f = stubFetch(200, { slug: "A1", probe: null });
    await uploadJob([], "A1");
    const fd = (f.mock.calls[0] as any[])[1].body as FormData;
    expect(fd.get("overwrite")).toBe("false");
  });

  it("manda overwrite=true quando pedido", async () => {
    const f = stubFetch(200, { slug: "A1", probe: null });
    await uploadJob([], "A1", true);
    const fd = (f.mock.calls[0] as any[])[1].body as FormData;
    expect(fd.get("overwrite")).toBe("true");
  });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/slug.test.ts src/__tests__/uploadGuard.test.ts`
Expected: FAIL — `../slug` não existe e `listJobs`/`SlugOcupado` não são exportados.

- [ ] **Step 3: Criar `web/src/slug.ts`**

```ts
// Sugestão de nome para um projeto novo. O campo do passo 1 vinha preenchido
// com o slug atual, o que fazia do reuso — e da sobrescrita — o caminho de
// menor esforço. A sugestão é sempre um nome livre.
export function proximoSlugLivre(existentes: string[]): string {
  const usados = new Set(existentes);
  for (let n = 1; ; n++) {
    const candidato = `A${n}`;
    if (!usados.has(candidato)) return candidato;
  }
}
```

- [ ] **Step 4: Adicionar o tipo `JobSummary`**

Em `web/src/types.ts`, após o tipo `JobState`:

```ts
// Espelho de api/models.py::JobSummary.
export type JobSummary = {
  slug: string;
  title: string;
  updated_at: number;
  orientation: "16x9" | "9x16";
  has_source: boolean;
  has_trimmed: boolean;
  has_transcript: boolean;
  has_hook: boolean;
  has_recipe: boolean;
  has_render_16x9: boolean;
  has_render_9x16: boolean;
  bytes_source: number;
  bytes_total: number;
};
```

- [ ] **Step 5: Estender `web/src/api.ts`**

Acrescentar `JobSummary` ao import de tipos no topo do arquivo, e substituir a
função `uploadJob` por:

```ts
/** O slug já tem trabalho e o upload não foi confirmado como sobrescrita. */
export class SlugOcupado extends Error {
  constructor(readonly existente: JobSummary) {
    super(`o projeto ${existente.slug} já existe`);
    this.name = "SlugOcupado";
  }
}

export async function listJobs(): Promise<JobSummary[]> {
  return jsonOrThrow(await fetch(`${BASE}/jobs`));
}

export async function uploadJob(
  files: File[], slug: string, overwrite = false,
): Promise<{ slug: string; probe: any }> {
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("slug", slug);
  fd.append("overwrite", String(overwrite));
  const r = await fetch(`${BASE}/jobs`, { method: "POST", body: fd });
  // 409 não é erro de rede: é a pergunta "sobrescrever?" e vem com o projeto
  // existente no corpo, para a tela montar o diálogo sem outra chamada.
  if (r.status === 409) {
    const body = await r.json();
    throw new SlugOcupado(body.detail as JobSummary);
  }
  return jsonOrThrow(r);
}
```

- [ ] **Step 6: Rodar os testes e ver passar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/slug.test.ts src/__tests__/uploadGuard.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 7: Commit**

```bash
git add web/src/slug.ts web/src/types.ts web/src/api.ts web/src/__tests__/slug.test.ts web/src/__tests__/uploadGuard.test.ts
git commit -m "feat(web): cliente da lista de projetos e do 409 de sobrescrita"
```

---

### Task 4: A tela de projetos

**Files:**
- Create: `web/src/ProjectsScreen.tsx`
- Test: `web/src/__tests__/ProjectsScreen.test.tsx` (criar)

**Interfaces:**
- Consumes: `api.listJobs` e `types.JobSummary` da Task 3.
- Produces: `ProjectsScreen` — componente com as props `onOpen: (slug: string) => void` e `onNew: () => void`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `web/src/__tests__/ProjectsScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { listJobs } = vi.hoisted(() => ({ listJobs: vi.fn() }));
vi.mock("../api", () => ({ listJobs }));

import { ProjectsScreen } from "../ProjectsScreen";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const projeto = {
  slug: "A1", title: "", updated_at: 1_700_000_000, orientation: "9x16" as const,
  has_source: true, has_trimmed: true, has_transcript: true,
  has_hook: false, has_recipe: false,
  has_render_16x9: false, has_render_9x16: true,
  bytes_source: 379_205_809, bytes_total: 395_000_000,
};

describe("ProjectsScreen", () => {
  it("lista os projetos salvos", async () => {
    listJobs.mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText("A1")).toBeInTheDocument();
  });

  it("abre o projeto escolhido", async () => {
    const onOpen = vi.fn();
    listJobs.mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={onOpen} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /abrir A1/i }));
    expect(onOpen).toHaveBeenCalledWith("A1");
  });

  it("mostra em que passo o projeto parou", async () => {
    listJobs.mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText(/renderizado/i)).toBeInTheDocument();
  });

  it("mostra o espaço ocupado", async () => {
    listJobs.mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText(/376(,|\.)7 MB/)).toBeInTheDocument();
  });

  it("sem projetos, convida a criar o primeiro", async () => {
    listJobs.mockResolvedValueOnce([]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText(/nenhum projeto ainda/i)).toBeInTheDocument();
  });

  it("o botão de novo projeto avisa quem chamou", async () => {
    const onNew = vi.fn();
    listJobs.mockResolvedValueOnce([]);
    render(<ProjectsScreen onOpen={() => {}} onNew={onNew} />);
    fireEvent.click(await screen.findByRole("button", { name: /novo projeto/i }));
    expect(onNew).toHaveBeenCalled();
  });

  it("backend fora do ar mostra o erro em vez de tela vazia", async () => {
    listJobs.mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText(/não consegui carregar/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/ProjectsScreen.test.tsx`
Expected: FAIL — `../ProjectsScreen` não existe.

- [ ] **Step 3: Implementar `web/src/ProjectsScreen.tsx`**

```tsx
import { useEffect, useState } from "react";
import { listJobs } from "./api";
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

export const ProjectsScreen: React.FC<{
  onOpen: (slug: string) => void;
  onNew: () => void;
}> = ({ onOpen, onNew }) => {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listJobs()
      .then((l) => { if (vivo) setJobs(l); })
      .catch(() => { if (vivo) setErr("não consegui carregar os projetos"); });
    return () => { vivo = false; };
  }, []);

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Projetos</h1>
        <button
          onClick={onNew}
          className="px-4 py-2 bg-emerald-600 rounded font-medium"
        >
          Novo projeto
        </button>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}

      {jobs && jobs.length === 0 && (
        <p className="text-zinc-400">
          Nenhum projeto ainda. Crie o primeiro para começar.
        </p>
      )}

      <ul className="space-y-2">
        {(jobs ?? []).map((j) => (
          <li
            key={j.slug}
            className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded p-4"
          >
            <div className="flex-1 min-w-0">
              <p className="font-medium text-zinc-100 truncate">
                {j.title || j.slug}
              </p>
              <p className="text-sm text-zinc-400">
                {LABEL_FORMATO[j.orientation] ?? j.orientation} · {progresso(j)}
                {" · "}{tamanho(j.bytes_total)}
                {quando(j.updated_at) && ` · ${quando(j.updated_at)}`}
              </p>
            </div>
            <button
              aria-label={`abrir ${j.slug}`}
              onClick={() => onOpen(j.slug)}
              className="px-3 py-1 bg-zinc-800 rounded text-sm"
            >
              Abrir
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
};
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/ProjectsScreen.test.tsx`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add web/src/ProjectsScreen.tsx web/src/__tests__/ProjectsScreen.test.tsx
git commit -m "feat(web): tela de projetos listando os jobs salvos"
```

---

### Task 5: Ligar a tela ao wizard

**Files:**
- Modify: `web/src/RecordedWizard.tsx` (arquivo inteiro)
- Test: `web/src/__tests__/RecordedWizard.test.tsx` (criar)

**Interfaces:**
- Consumes: `ProjectsScreen` da Task 4.
- Produces: `RecordedWizard` passa a mostrar a lista quando não há projeto aberto, e o wizard ganha um botão "← Projetos".

- [ ] **Step 1: Escrever o teste que falha**

Criar `web/src/__tests__/RecordedWizard.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { listJobs } = vi.hoisted(() => ({ listJobs: vi.fn(async () => []) }));
vi.mock("../api", () => ({
  listJobs,
  getJob: vi.fn(async () => ({ config: {} })),
  getCuts: vi.fn(async () => null),
  getTranscript: vi.fn(async () => []),
  mediaUrl: (s: string, n: string) => `/api/jobs/${s}/files/${n}`,
  streamSSE: vi.fn(),
  uploadJob: vi.fn(),
  putOrientation: vi.fn(),
}));

import { RecordedWizard } from "../RecordedWizard";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("RecordedWizard", () => {
  it("sem projeto aberto, mostra a lista", async () => {
    render(<RecordedWizard />);
    expect(await screen.findByText("Projetos")).toBeInTheDocument();
  });

  it("abrir um projeto entra no wizard", async () => {
    listJobs.mockResolvedValueOnce([{
      slug: "A1", title: "", updated_at: 0, orientation: "9x16",
      has_source: true, has_trimmed: true, has_transcript: false,
      has_hook: false, has_recipe: false,
      has_render_16x9: false, has_render_9x16: false,
      bytes_source: 1, bytes_total: 2,
    }] as any);
    render(<RecordedWizard />);
    fireEvent.click(await screen.findByRole("button", { name: /abrir A1/i }));
    expect(await screen.findByText("Edit Local")).toBeInTheDocument();
  });

  it("do wizard dá para voltar à lista", async () => {
    listJobs.mockResolvedValue([{
      slug: "A1", title: "", updated_at: 0, orientation: "9x16",
      has_source: true, has_trimmed: true, has_transcript: false,
      has_hook: false, has_recipe: false,
      has_render_16x9: false, has_render_9x16: false,
      bytes_source: 1, bytes_total: 2,
    }] as any);
    render(<RecordedWizard />);
    fireEvent.click(await screen.findByRole("button", { name: /abrir A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /projetos/i }));
    expect(await screen.findByText("Projetos")).toBeInTheDocument();
  });

  it("novo projeto entra no wizard no passo de upload", async () => {
    render(<RecordedWizard />);
    fireEvent.click(await screen.findByRole("button", { name: /novo projeto/i }));
    expect(await screen.findByText(/1\. Subir/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/RecordedWizard.test.tsx`
Expected: FAIL — o wizard renderiza o `UploadStep` direto, sem lista.

- [ ] **Step 3: Reescrever `web/src/RecordedWizard.tsx`**

```tsx
import React, { useEffect, useState } from "react";
import { Stepper } from "./components/Stepper";
import { ProjectsScreen } from "./ProjectsScreen";
import { loadState, saveState } from "./state";
import { UploadStep } from "./steps/UploadStep";
import { CutsStep } from "./steps/CutsStep";
import { TranscriptStep } from "./steps/TranscriptStep";
import { HookStep } from "./steps/HookStep";
import { OverlaysStep } from "./steps/OverlaysStep";
import { RenderStep } from "./steps/RenderStep";
import type { StepProps } from "./App";

export function RecordedWizard() {
  const initial = loadState();
  const [slug, setSlug] = useState(initial.slug);
  const [step, setStep] = useState(initial.step);
  // Um projeto novo ainda não tem slug, mas também não é "estar na lista".
  // Este estado não é persistido de propósito: recarregar a página no meio de
  // um projeto sem vídeo nenhum volta para a lista, que é o lugar certo.
  const [criando, setCriando] = useState(false);

  useEffect(() => { saveState({ slug, step }); }, [slug, step]);

  const next = () => setStep((s) => Math.min(5, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const voltarParaLista = () => { setCriando(false); setSlug(""); setStep(0); };

  if (!slug && !criando) {
    return (
      <ProjectsScreen
        onOpen={(s) => { setSlug(s); setStep(0); }}
        onNew={() => { setCriando(true); setStep(0); }}
      />
    );
  }

  const Steps: React.ComponentType<StepProps>[] = [UploadStep, CutsStep, TranscriptStep, HookStep, OverlaysStep, RenderStep];
  const Current = Steps[step];

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Edit Local</h1>
        <button onClick={voltarParaLista} className="px-3 py-1 bg-zinc-800 rounded text-sm">
          ← Projetos
        </button>
      </div>
      <Stepper step={step} onJump={setStep} />
      <Current slug={slug} setSlug={setSlug} next={next} back={back} />
    </main>
  );
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/RecordedWizard.test.tsx`
Expected: PASS, 4 testes.

- [ ] **Step 5: Rodar a suíte inteira do front**

Run: `web/node_modules/.bin/vitest.cmd run --root web`
Expected: só `captionParity` e `overlayAnimParity` falham (baseline do `--root web`).

- [ ] **Step 6: Commit**

```bash
git add web/src/RecordedWizard.tsx web/src/__tests__/RecordedWizard.test.tsx
git commit -m "feat(web): wizard abre a partir da lista de projetos"
```

---

### Task 6: Sugestão de nome livre e diálogo de colisão

**Files:**
- Modify: `web/src/steps/UploadStep.tsx`
- Test: `web/src/__tests__/UploadStep.test.tsx` (arquivo existente — acrescentar)

**Interfaces:**
- Consumes: `api.listJobs`, `api.SlugOcupado`, `api.uploadJob(files, slug, overwrite)` da Task 3.
- Produces: nada que outra tarefa consuma.

- [ ] **Step 1: Ler o teste existente**

Abrir `web/src/__tests__/UploadStep.test.tsx` e ver como o módulo `../api` é
mockado. O mock precisa ganhar `listJobs` e `SlugOcupado`, senão o componente
quebra ao montar — a Task 3 acrescentou chamadas novas.

- [ ] **Step 2: Escrever os testes que falham**

Acrescentar ao final de `web/src/__tests__/UploadStep.test.tsx` (ajustando o
mock de `../api` no topo do arquivo para incluir `listJobs` e `SlugOcupado`):

```tsx
describe("UploadStep — projeto novo e colisão de nome", () => {
  it("num projeto novo, sugere um nome livre em vez do slug atual", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([
      { slug: "A1" }, { slug: "A2" }, { slug: "A3" },
    ]);
    render(<UploadStep {...props} slug="" />);
    const campo = await screen.findByLabelText(/nome do projeto/i);
    await waitFor(() => expect((campo as HTMLInputElement).value).toBe("A4"));
  });

  it("o 409 abre o diálogo dizendo o que existe", async () => {
    const api = await import("../api");
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true, has_trimmed: true } as any),
    );
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    expect(await screen.findByText(/já existe/i)).toBeInTheDocument();
  });

  it("substituir reenvia com overwrite", async () => {
    const api = await import("../api");
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true } as any),
    );
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    fireEvent.click(await screen.findByRole("button", { name: /substituir/i }));
    await waitFor(() => {
      const ultima = (api.uploadJob as any).mock.calls.at(-1);
      expect(ultima[2]).toBe(true);
    });
  });

  it("criar novo projeto troca o nome e não sobrescreve nada", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValue([{ slug: "A1" }]);
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true } as any),
    );
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    fireEvent.click(await screen.findByRole("button", { name: /criar novo/i }));
    const campo = screen.getByLabelText(/nome do projeto/i) as HTMLInputElement;
    await waitFor(() => expect(campo.value).toBe("A2"));
  });
});
```

- [ ] **Step 3: Rodar os testes e ver falhar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/UploadStep.test.tsx`
Expected: FAIL — não há sugestão de nome nem diálogo.

- [ ] **Step 4: Implementar no `UploadStep`**

Acrescentar aos imports do arquivo:

```tsx
import { uploadJob, putOrientation, getJob, listJobs, SlugOcupado } from "../api";
import { proximoSlugLivre } from "../slug";
import type { JobSummary } from "../types";
```

Acrescentar ao estado do componente, junto dos outros `useState`:

```tsx
  const [colisao, setColisao] = useState<JobSummary | null>(null);
  const [slugsUsados, setSlugsUsados] = useState<string[]>([]);
```

Acrescentar, após os `useState`:

```tsx
  // Num projeto novo (sem slug), o campo vinha com "video1" ou com o slug do
  // projeto anterior — o que fazia da sobrescrita o caminho de menor esforço.
  // Sugerimos sempre um nome livre.
  useEffect(() => {
    let vivo = true;
    listJobs()
      .then((l) => {
        if (!vivo) return;
        const usados = l.map((j) => j.slug);
        setSlugsUsados(usados);
        if (!slug) setLocalSlug(proximoSlugLivre(usados));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [slug]);
```

Substituir a função `onUpload` por:

```tsx
  const enviar = async (overwrite: boolean) => {
    if (files.length === 0) return;
    setBusy(true); setErr(null); setColisao(null);
    try {
      const r = await uploadJob(files, localSlug, overwrite);
      setSlug(r.slug); setProbe(r.probe); setFiles([]); setChanged(false);
      const detected = r.probe
        ? orientationFromProbe(r.probe.width, r.probe.height)
        : "16x9";
      await reconcileOrientation(r.slug, detected);
    } catch (e: any) {
      // 409: o slug tem trabalho. Não é erro — é uma pergunta.
      if (e instanceof SlugOcupado) setColisao(e.existente);
      else setErr(e.message ?? "erro no upload");
    } finally {
      setBusy(false);
    }
  };

  const onUpload = () => enviar(false);
```

Trocar o `onClick={onUpload}` do botão de enviar por `onClick={() => onUpload()}`
e acrescentar o diálogo logo depois do bloco `{err && ...}`:

```tsx
      {colisao && (
        <div role="alertdialog" aria-label="projeto já existe"
             className="rounded border border-amber-700 bg-amber-950/40 p-4 text-sm space-y-3">
          <p className="text-amber-200">
            <strong>O projeto "{colisao.slug}" já existe.</strong>{" "}
            {[
              colisao.has_trimmed && "corte",
              colisao.has_transcript && "transcrição",
              colisao.has_hook && "hook",
              colisao.has_recipe && "textos",
            ].filter(Boolean).join(", ") || "o vídeo enviado"}
            {" "}está salvo nele.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setLocalSlug(proximoSlugLivre(slugsUsados));
                setColisao(null);
              }}
              className="px-3 py-1 bg-emerald-600 rounded"
            >
              Criar novo projeto
            </button>
            <button
              onClick={() => { setSlug(colisao.slug); setColisao(null); next(); }}
              className="px-3 py-1 bg-zinc-800 rounded"
            >
              Abrir o existente
            </button>
            <button
              onClick={() => enviar(true)}
              className="px-3 py-1 bg-red-900 rounded"
            >
              Substituir o vídeo
            </button>
          </div>
          <p className="text-xs text-amber-300/70">
            Substituir descarta corte, transcrição e textos. O vídeo já
            exportado em output/ é mantido.
          </p>
        </div>
      )}
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/UploadStep.test.tsx`
Expected: PASS — os testes novos e os que já existiam no arquivo.

- [ ] **Step 6: Rodar as duas suítes inteiras**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: só o baseline de TTS falha.

Run: `web/node_modules/.bin/vitest.cmd run --root web`
Expected: só `captionParity` e `overlayAnimParity` falham.

- [ ] **Step 7: Verificar os tipos**

Run: `web/node_modules/.bin/tsc.cmd --noEmit -p web/tsconfig.json`
Expected: os 5 erros pré-existentes (`BrandStep.test.tsx`, `animatedApi.ts`, `BrandKitModal.tsx` ×2, `steps/animated/RenderStep.tsx`) e nenhum novo.

- [ ] **Step 8: Publicar o build e reiniciar o servidor**

O servidor roda sem `--reload`, então tanto o build do front quanto a mudança em
Python só valem depois de reiniciar. Em PowerShell, a partir da raiz:

```powershell
npm run build --prefix web
Remove-Item -Recurse -Force api\static\assets -Confirm:$false -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force web\dist\* api\static\
$c = Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue
if ($c) { Stop-Process -Id $c.OwningProcess -Force -Confirm:$false }
```

E subir de novo com `TTS_MODE=mock` (não há `.env` nesta máquina, e sem a
variável o `api/app.py` recusa iniciar):

```powershell
$env:TTS_MODE = "mock"; .venv\Scripts\python.exe -m uvicorn api.app:app --host 127.0.0.1 --port 8000
```

- [ ] **Step 9: Smoke manual**

Abrir `http://localhost:8000`, escolher "Editar gravação" e confirmar:
a lista mostra A1, A2 e A3 com formato, progresso e tamanho; "Abrir" entra no
wizard no projeto certo; "← Projetos" volta; "Novo projeto" sugere um nome livre;
e subir um vídeo com o nome de um projeto existente abre o diálogo com as três
saídas em vez de sobrescrever.

- [ ] **Step 10: Commit**

```bash
git add web/src/steps/UploadStep.tsx web/src/__tests__/UploadStep.test.tsx
git commit -m "feat(web): sugestão de nome livre e diálogo de colisão no upload"
```
