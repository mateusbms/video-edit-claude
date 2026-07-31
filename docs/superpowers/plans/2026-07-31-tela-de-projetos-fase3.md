# Tela de projetos — Fase 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar antes das duas perdas silenciosas do passo de Cortes — tentar detectar pausas sem o vídeo original, e aplicar corte manual por cima de transcrição e textos já feitos.

**Architecture:** O `JobState` passa a expor três flags que já existiam no `JobSummary`, o `POST /cut` recusa com 409 quando o source foi apagado, e o `CutsStep` usa essas flags para desabilitar o botão com explicação e para confirmar antes do refino destrutivo.

**Tech Stack:** FastAPI + pydantic v2 no backend; React 19 + TypeScript + Tailwind no front; pytest e vitest + Testing Library nos testes.

**Spec:** `docs/superpowers/specs/2026-07-30-tela-de-projetos-design.md`

## Global Constraints

- **Fase 3 é a última.** Não sobrou nada das fases 1 e 2 para implementar aqui.
- **`stage_refine` apagar transcrição, textos, sugestões e recipe é intencional** — o vídeo encurtou e as legendas ficariam fora de sincronia. Esta fase **não** muda esse comportamento; só avisa antes.
- **`init_job` cria o diretório.** Nada que apenas consulta pode chamá-lo. `get_state` e `job_summary` já respeitam isso.
- **Rodar os testes do backend:** `.venv/Scripts/python.exe -m pytest <arquivo> -q` a partir da raiz. `python3` não existe nesta máquina.
- **Rodar os testes do front:** `web/node_modules/.bin/vitest.cmd run --root web <arquivo>` a partir da raiz. `npm test` dentro de `web/` está quebrado neste ambiente.
- **Tipos:** `web/node_modules/.bin/tsc.cmd --noEmit -p web/tsconfig.json`
- **Baseline que não é regressão:** `api/tests/test_tts_routes.py::test_happy_path`; as suítes `captionParity` e `overlayAnimParity` com `--root web`; e 5 erros de `tsc` em `BrandStep.test.tsx`, `animatedApi.ts`, `BrandKitModal.tsx` (×2) e `steps/animated/RenderStep.tsx`.
- **Idioma:** textos de UI, comentários e mensagens em português.

---

### Task 1: O backend conta o que existe, e recusa cortar sem o vídeo

**Files:**
- Modify: `api/models.py` (três flags em `JobState`)
- Modify: `api/jobs.py` (`get_state` preenche as três)
- Modify: `api/routes.py` (guarda no `POST /jobs/{slug}/cut`)
- Test: `api/tests/test_cut_sem_source.py` (criar)

**Interfaces:**
- Consumes: `api.jobs.get_state`, que já existe.
- Produces:
  - `JobState.has_source: bool`, `JobState.has_overlays: bool`, `JobState.has_suggestions: bool`
  - `POST /api/jobs/{slug}/cut` responde 409 quando não há `source.mp4`

**Por que:** o `stage_cut` é o único leitor do `source.mp4`. Depois que a fase 2 ganhou o botão "Liberar espaço", tentar detectar pausas num projeto com o source apagado estoura dentro do ffmpeg, com erro ilegível no meio de um stream SSE. E o `CutsStep` precisa saber o que existe para avisar antes do refino — hoje ele só recebe `has_trimmed`/`has_transcript`/`has_hook`/`has_recipe`, sem `has_overlays` nem `has_suggestions`, que são justamente dois dos arquivos que o refino apaga.

- [ ] **Step 1: Escrever o teste que falha**

Criar `api/tests/test_cut_sem_source.py`:

```python
"""POST /jobs/{slug}/cut sem o vídeo original, e as flags que a tela precisa.

O stage_cut é o único leitor do source.mp4. Depois do botão "Liberar espaço"
da fase 2, um projeto pode legitimamente não ter mais o original — e aí a
detecção de pausas precisa recusar com uma frase, não estourar no ffmpeg.
"""

import json


def _criar_job(tmp_root, slug: str, arquivos: dict[str, bytes]) -> None:
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "job.config.json").write_text(json.dumps({"orientation": "9x16"}), encoding="utf-8")
    for nome, conteudo in arquivos.items():
        (d / nome).write_bytes(conteudo)


CORTE = {"silence_threshold_db": -30.0, "padding": 0.1, "min_silence": 0.5}


def test_cortar_sem_source_responde_409(client, tmp_root):
    _criar_job(tmp_root, "s1", {"trimmed.mp4": b"y"})
    r = client.post("/api/jobs/s1/cut", json=CORTE)
    assert r.status_code == 409


def test_a_mensagem_explica_o_que_aconteceu_e_o_que_sobra(client, tmp_root):
    _criar_job(tmp_root, "s2", {"trimmed.mp4": b"y"})
    detalhe = client.post("/api/jobs/s2/cut", json=CORTE).json()["detail"]
    assert "original" in detalhe.lower()
    assert "manual" in detalhe.lower()


def test_recusar_nao_grava_os_parametros(client, tmp_root):
    """Não persiste a escolha de um corte que não vai acontecer."""
    _criar_job(tmp_root, "s3", {"trimmed.mp4": b"y"})
    antes = (tmp_root / "jobs" / "s3" / "job.config.json").read_text(encoding="utf-8")
    client.post("/api/jobs/s3/cut", json={"silence_threshold_db": -44.0,
                                          "padding": 0.4, "min_silence": 1.9})
    assert (tmp_root / "jobs" / "s3" / "job.config.json").read_text(encoding="utf-8") == antes


def test_projeto_inexistente_tambem_recusa(client, tmp_root):
    r = client.post("/api/jobs/nunca-existiu/cut", json=CORTE)
    assert r.status_code == 409
    assert not (tmp_root / "jobs" / "nunca-existiu").exists(), "recusar não pode criar o job"


def test_o_estado_do_job_expoe_o_que_o_refino_vai_apagar(client, tmp_root):
    _criar_job(tmp_root, "s4", {
        "source.mp4": b"x",
        "overlays.json": b"[]",
        "suggestions.json": b"[]",
    })
    body = client.get("/api/jobs/s4").json()
    assert body["has_source"] is True
    assert body["has_overlays"] is True
    assert body["has_suggestions"] is True


def test_as_flags_novas_sao_falsas_quando_os_arquivos_nao_existem(client, tmp_root):
    _criar_job(tmp_root, "s5", {"trimmed.mp4": b"y"})
    body = client.get("/api/jobs/s5").json()
    assert body["has_source"] is False
    assert body["has_overlays"] is False
    assert body["has_suggestions"] is False
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_cut_sem_source.py -q`
Expected: FAIL — as três chaves não existem no `GET /jobs/{slug}`, e o `POST /cut` tenta rodar o ffmpeg em vez de responder 409.

- [ ] **Step 3: As três flags no `JobState`**

Em `api/models.py`, dentro de `JobState`, após `has_recipe`:

```python
    has_source: bool = False
    # o refino apaga estes dois junto com a transcrição; a tela avisa antes
    has_overlays: bool = False
    has_suggestions: bool = False
```

- [ ] **Step 4: `get_state` preenche as três**

Em `api/jobs.py`, dentro de `get_state`, no construtor do `JobState(...)`, junto das outras flags:

```python
        has_source=(job_dir / "source.mp4").exists(),
        has_overlays=(job_dir / "overlays.json").exists(),
        has_suggestions=(job_dir / "suggestions.json").exists(),
```

- [ ] **Step 5: A guarda na rota de corte**

Em `api/routes.py`, na função `run_cut`, antes do `update_config`:

```python
@router.post("/jobs/{slug}/cut")
def run_cut(slug: str, params: CutParams):
    jobs_root, *_ = _roots()
    # stage_cut é o único leitor do source.mp4. Sem ele o ffmpeg estoura no meio
    # do stream SSE, com erro ilegível — e o projeto pode legitimamente não ter
    # mais o original, depois do "Liberar espaço". Recusa antes de gravar nada.
    if not get_state(slug, jobs_root).has_source:
        raise HTTPException(
            status_code=409,
            detail=("o vídeo original deste projeto foi apagado para liberar espaço; "
                    "a detecção de pausas não é mais possível aqui — só cortes manuais "
                    "sobre o vídeo já cortado"),
        )
    update_config(slug, jobs_root, params)
    job = init_job(jobs_root, slug)
```

O resto da função fica como está.

- [ ] **Step 6: Rodar e ver passar**

Run: `.venv/Scripts/python.exe -m pytest api/tests/test_cut_sem_source.py -q`
Expected: PASS, 6 testes.

- [ ] **Step 7: Suíte inteira do backend**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: só o baseline de TTS falha.

- [ ] **Step 8: Commit**

```bash
git add api/models.py api/jobs.py api/routes.py api/tests/test_cut_sem_source.py
git commit -m "feat(api): recusa detectar pausas sem o source e expõe o que o refino apaga"
```

---

### Task 2: A tela não oferece um corte que não pode acontecer

**Files:**
- Modify: `web/src/types.ts` (três flags em `JobState`)
- Modify: `web/src/steps/CutsStep.tsx`
- Test: `web/src/__tests__/CutsStep.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `JobState.has_source` da Task 1.
- Produces: nada que outra tarefa consuma.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `web/src/__tests__/CutsStep.test.tsx`:

```tsx
describe("CutsStep — projeto sem o vídeo original", () => {
  it("desabilita Detectar pausas e explica por quê", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
      has_source: false,
    } as any);
    render(<CutsStep {...props} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /detectar pausas/i })).toBeDisabled());
    expect(screen.getByText(/liberar espaço/i)).toBeInTheDocument();
  });

  it("com o vídeo original, o botão continua ativo e sem aviso", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
      has_source: true,
    } as any);
    render(<CutsStep {...props} />);
    await waitFor(() => expect(getJob).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /detectar pausas/i })).not.toBeDisabled();
    expect(screen.queryByText(/liberar espaço/i)).not.toBeInTheDocument();
  });

  it("os cortes manuais continuam disponíveis sem o original", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
      has_source: false,
    } as any);
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 6 }], trimmed_mtime: 5,
    } as any);
    render(<CutsStep {...props} />);
    expect(await screen.findByRole("button", { name: /marcar início/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/CutsStep.test.tsx`
Expected: FAIL — o botão nunca fica desabilitado e o aviso não existe.

- [ ] **Step 3: As flags no tipo do front**

Em `web/src/types.ts`, dentro de `JobState`, junto das outras flags:

```ts
  has_source?: boolean;
  has_overlays?: boolean;
  has_suggestions?: boolean;
```

Opcionais porque testes antigos montam `JobState` parcial; o componente trata
ausente como falso.

- [ ] **Step 4: Guardar a flag e usá-la**

Em `web/src/steps/CutsStep.tsx`, acrescentar ao estado:

```tsx
  // Sem o source, o "Detectar pausas" não pode acontecer — o stage_cut é o
  // único leitor dele. Oferecer o botão só para o servidor recusar com 409
  // seria empurrar o usuário para um beco.
  const [temSource, setTemSource] = useState(true);
```

No `useEffect` que já existe, dentro do `.then` do `getJob`:

```tsx
    getJob(slug).then((j) => {
      if (!vivo) return;
      if (j?.config) setParams(j.config);
      setTemSource(j?.has_source !== false);
    }).catch(() => {});
```

O `!== false` deixa o padrão otimista: um `getJob` que falhe ou um estado sem
a chave não desabilitam o botão.

No botão de detectar pausas, trocar o `disabled`:

```tsx
      <button onClick={onCut} disabled={busy || !temSource}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy ? "Cortando..." : "Detectar pausas"}
      </button>
      {!temSource && (
        <p role="status" className="text-sm rounded border border-amber-700 bg-amber-950/40 p-3 text-amber-200">
          O vídeo original deste projeto foi apagado para <strong>liberar espaço</strong>,
          então não dá mais para detectar pausas aqui. Os cortes manuais sobre o vídeo
          já cortado continuam funcionando.
        </p>
      )}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/CutsStep.test.tsx`
Expected: PASS — os testes novos e os que já existiam no arquivo.

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/steps/CutsStep.tsx web/src/__tests__/CutsStep.test.tsx
git commit -m "feat(web): Detectar pausas desabilitado com explicação sem o vídeo original"
```

---

### Task 3: Confirmar antes do corte manual descartar o trabalho

**Files:**
- Modify: `web/src/steps/CutsStep.tsx`
- Test: `web/src/__tests__/CutsStep.test.tsx` (acrescentar)

**Interfaces:**
- Consumes: `JobState.has_transcript`, `has_overlays`, `has_suggestions`, `has_recipe` da Task 1.
- Produces: nada que outra tarefa consuma.

**Desenho:** aplicar corte manual chama `stage_refine`, que apaga `transcript.json`, `overlays.json`, `suggestions.json` e `edit-recipe.json` de propósito — o vídeo encurtou e as legendas ficariam fora de sincronia. Esta task **não** muda isso; só confirma antes, e só quando existe algo a perder. Sem nada a perder, aplicar segue direto, sem clique extra.

Depois de um refino bem-sucedido esses arquivos deixaram de existir, então as
flags locais têm que zerar — senão o segundo refino da mesma sessão avisaria
sobre um trabalho que já não está lá.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar ao final de `web/src/__tests__/CutsStep.test.tsx`:

```tsx
describe("CutsStep — aviso antes do corte manual destruir trabalho", () => {
  const comTrabalho = {
    config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
    has_source: true, has_transcript: true, has_overlays: true,
    has_suggestions: false, has_recipe: true,
  };

  async function marcarUmTrecho(container: HTMLElement) {
    const video = await doCut(container);
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
  }

  it("pergunta antes de aplicar, listando o que será descartado", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const { container } = render(<CutsStep {...props} />);
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));

    expect(await screen.findByText(/transcrição/i)).toBeInTheDocument();
    expect(screen.getByText(/textos/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(false);
  });

  it("confirmar aplica de verdade", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const { container } = render(<CutsStep {...props} />);
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));

    await waitFor(() =>
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true));
  });

  it("desistir não aplica nada e mantém os trechos marcados", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const { container } = render(<CutsStep {...props} />);
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /desistir/i }));

    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(false);
    expect(screen.getByRole("button", { name: /remover trecho 1/i })).toBeInTheDocument();
  });

  it("sem nada a perder, aplica direto e não pergunta", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
      has_source: true, has_transcript: false, has_overlays: false,
      has_suggestions: false, has_recipe: false,
    } as any);
    const { container } = render(<CutsStep {...props} />);
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));

    await waitFor(() =>
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true));
  });

  it("o segundo corte da mesma sessão não avisa de novo", async () => {
    // o refino já apagou tudo; avisar outra vez seria mentira
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const { container } = render(<CutsStep {...props} />);
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));
    await waitFor(() =>
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true));

    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    await waitFor(() => {
      const refines = streamSSE.mock.calls.filter((c) => String(c[0]).includes("/refine"));
      expect(refines.length).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/CutsStep.test.tsx`
Expected: FAIL — não há confirmação; o refino dispara direto.

- [ ] **Step 3: Implementar**

Em `web/src/steps/CutsStep.tsx`, acrescentar ao estado, junto de `temSource`:

```tsx
  // O que o refino vai apagar. stage_refine remove transcrição, textos,
  // sugestões e recipe de propósito — o vídeo encurta e as legendas sairiam de
  // sincronia. Não mudamos isso; só avisamos, e só quando há o que perder.
  const [aPerder, setAPerder] = useState<string[]>([]);
  const [confirmandoRefino, setConfirmandoRefino] = useState(false);
```

No `.then` do `getJob` do `useEffect`, junto do `setTemSource`:

```tsx
      setAPerder([
        j?.has_transcript && "a transcrição",
        j?.has_overlays && "os textos",
        j?.has_suggestions && "as sugestões",
        j?.has_recipe && "a receita de render",
      ].filter(Boolean) as string[]);
```

Renomear a função que aplica e separar a decisão:

```tsx
  const pedirParaAplicar = () => {
    if (removeList.length === 0) return;
    if (aPerder.length > 0) { setConfirmandoRefino(true); return; }
    applyRefine();
  };
```

Dentro de `applyRefine`, na primeira linha, fechar a confirmação; e no `done`,
zerar o que deixou de existir:

```tsx
  const applyRefine = async () => {
    if (removeList.length === 0) return;
    setConfirmandoRefino(false);
    setRefining(true); setErr(null); setRefineProg(null);
    try {
      await streamSSE(`/api/jobs/${slug}/refine`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remove: removeList }),
      }, {
        progress: (d) => { if (d.n != null && d.total != null) setRefineProg({ n: d.n, total: d.total }); },
        done: (d) => {
          setResult((r) => (r && d.trimmed_duration != null ? { ...r, trimmed_duration: d.trimmed_duration } : r));
          setRemoveList([]);
          if (d.trimmed_mtime != null) setTrimmedVersion(d.trimmed_mtime);
          // o refino apagou tudo isso; avisar de novo no próximo corte seria mentira
          setAPerder([]);
        },
        error: (d) => setErr(d.detail ?? "erro ao aplicar cortes"),
      });
    } catch (e: any) { setErr(e.message); }
    finally { setRefining(false); setRefineProg(null); }
  };
```

Trocar o `onClick` do botão de aplicar por `pedirParaAplicar`, e acrescentar o
bloco de confirmação logo abaixo dele:

```tsx
                <button onClick={pedirParaAplicar} disabled={refining}
                  className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
                  {refining ? "Aplicando..." : `Aplicar cortes (${removeList.length})`}
                </button>
                {confirmandoRefino && (
                  <div role="alertdialog" aria-label="confirmar corte manual"
                       className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm space-y-2">
                    <p className="text-amber-200">
                      Cortar de novo encurta o vídeo, então{" "}
                      <strong>{aPerder.join(", ")}</strong>{" "}
                      {aPerder.length > 1 ? "serão descartados" : "será descartado"} — as
                      legendas ficariam fora de sincronia com o vídeo novo. Você vai
                      precisar transcrever outra vez.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={applyRefine} className="px-3 py-1 bg-amber-800 rounded">
                        Descartar e cortar
                      </button>
                      <button onClick={() => setConfirmandoRefino(false)}
                              className="px-3 py-1 bg-zinc-800 rounded">
                        Desistir
                      </button>
                    </div>
                  </div>
                )}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `web/node_modules/.bin/vitest.cmd run --root web src/__tests__/CutsStep.test.tsx`
Expected: PASS — os testes novos e todos os que já existiam no arquivo.

- [ ] **Step 5: As duas suítes inteiras e os tipos**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: só o baseline de TTS falha.

Run: `web/node_modules/.bin/vitest.cmd run --root web`
Expected: só `captionParity` e `overlayAnimParity` falham.

Run: `web/node_modules/.bin/tsc.cmd --noEmit -p web/tsconfig.json`
Expected: só os 5 erros pré-existentes.

- [ ] **Step 6: Commit**

```bash
git add web/src/steps/CutsStep.tsx web/src/__tests__/CutsStep.test.tsx
git commit -m "feat(web): confirma antes do corte manual descartar transcrição e textos"
```
