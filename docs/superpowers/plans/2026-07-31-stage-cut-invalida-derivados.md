# `stage_cut` invalida derivados + confirmação no "Detectar pausas" — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `stage_cut` apaga os derivados do trimmed (como o `stage_refine` já faz) e o botão "Detectar pausas" confirma antes quando há trabalho a perder — fechando a quarta causa do "meu trabalho não fica salvo".

**Architecture:** Espelha o par já existente `stage_refine` + diálogo do "Aplicar cortes". Backend: constante `DERIVADOS_DO_TRIMMED` compartilhada entre `stage_cut` e `stage_refine`. Front: o `CutsStep` ganha `confirmandoCorte` + `pedirParaCortar()` com o mesmo portão do refino, e o parágrafo do aviso vira o componente local `AvisoDescarte`, usado pelos dois diálogos.

**Tech Stack:** Python (pipeline puro, pytest com monkeypatch), React + TypeScript (vitest + testing-library).

**Spec:** `docs/superpowers/specs/2026-07-31-stage-cut-invalida-derivados-design.md`

**Atenção — efeito colateral na suíte existente:** os testes do aviso do refino em `web/src/__tests__/CutsStep.test.tsx` montam o cenário clicando em "Detectar pausas" (`doCut`). Com o novo portão, esse clique passa a abrir o diálogo (quando há trabalho a perder) e, confirmado, **zera `aPerder`** — o cenário "cortar nesta sessão e depois refinar com aviso" fica semanticamente impossível. A Task 4 migra esses testes para montar com corte salvo (`getCuts`), que é o caminho real de ter algo a perder com um corte na tela.

---

## Estrutura de arquivos

| Arquivo | Mudança |
|---|---|
| `pipeline/stages.py` | Nova constante `DERIVADOS_DO_TRIMMED`; `stage_cut` invalida no final; `stage_refine` usa a constante |
| `tests/test_stages.py` | Helper `_cut_falso` + 2 testes novos de invalidação |
| `web/src/steps/CutsStep.tsx` | `AvisoDescarte`, `confirmandoCorte`, `pedirParaCortar`, resets no `done` do `onCut`, botão desabilitado com `carregandoJob` |
| `web/src/__tests__/CutsStep.test.tsx` | Novo describe do aviso no Detectar; `doCut` espera o botão habilitar; testes do refino migram para `montarComCorteSalvo` |
| `docs/superpowers/notes/2026-07-31-handoff.md` | Marca a pendência 1 como resolvida |

---

### Task 1: Backend — `stage_cut` invalida os derivados do trimmed

**Files:**
- Modify: `pipeline/stages.py:14-18` (nova constante), `pipeline/stages.py:37-50` (`stage_cut`), `pipeline/stages.py:71-72` (`stage_refine` usa a constante)
- Test: `tests/test_stages.py`

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/test_stages.py`, ajustar o import do topo (linha 8) para incluir `stage_cut`:

```python
from pipeline.stages import stage_recipe, stage_ingest, stage_cut
```

E acrescentar no final do arquivo:

```python
def _cut_falso(monkeypatch, job):
    """stage_cut sem ffmpeg: sem silêncios (mantém o vídeo inteiro), corte e
    probe mockados. Segue o padrão do _ingest_falso."""
    from pipeline import stages

    class _Meta:
        width, height, fps, duration, nb_frames = 1080, 1920, 30.0, 8.0, 240

    def fake_cut(_src, _kept, dest, total_duration=None, progress_cb=None, scale=None):
        Path(dest).write_bytes(b"trimmed novo")

    monkeypatch.setattr(stages, "detect_silences", lambda *_a, **_k: [])
    monkeypatch.setattr(stages, "cut_segments", fake_cut)
    monkeypatch.setattr(stages, "probe_video", lambda _p: _Meta())
    stage_cut(job)


def test_stage_cut_apaga_os_derivados_do_trimmed(tmp_path, monkeypatch):
    """Re-detectar pausas reescreve o trimmed.mp4. Transcrição, textos,
    sugestões e receita descrevem a timeline antiga — sem invalidá-los, o
    render sai com legendas fora de sincronia, em silêncio. Mesma invalidação
    que o stage_refine já faz."""
    job = init_job(tmp_path / "jobs", "c4")
    (job.dir / "source.mp4").write_bytes(b"source")
    write_json(job.dir / "probe.json",
               {"width": 1080, "height": 1920, "fps": 30.0, "duration": 8.0})
    for nome in ("transcript.json", "edit-recipe.json", "overlays.json", "suggestions.json"):
        write_json(job.dir / nome, {"da": "timeline antiga"})
    write_json(job.dir / "hook.json", {"title": "H", "subtitle": ""})
    write_json(job.dir / "suggest-defaults.json", {"x": 0.5})

    _cut_falso(monkeypatch, job)

    for nome in ("transcript.json", "edit-recipe.json", "overlays.json", "suggestions.json"):
        assert not (job.dir / nome).exists(), f"{nome} sobreviveu ao corte novo"
    # hook e preferências não descrevem a timeline — sobrevivem (como no refino)
    assert (job.dir / "hook.json").exists()
    assert (job.dir / "suggest-defaults.json").exists()
    # e o corte em si foi escrito
    assert (job.dir / "cuts.json").exists()
    assert (job.dir / "trimmed.mp4").exists()
    assert (job.dir / "trimmed.probe.json").exists()


def test_stage_cut_sem_derivados_nao_falha(tmp_path, monkeypatch):
    """Primeiro corte de um projeto: não há nada para invalidar."""
    job = init_job(tmp_path / "jobs", "c5")
    (job.dir / "source.mp4").write_bytes(b"source")
    write_json(job.dir / "probe.json",
               {"width": 1080, "height": 1920, "fps": 30.0, "duration": 8.0})
    _cut_falso(monkeypatch, job)
    assert (job.dir / "trimmed.mp4").exists()
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python3 -m pytest tests/test_stages.py -q`
Expected: `test_stage_cut_apaga_os_derivados_do_trimmed` FALHA em `transcript.json sobreviveu ao corte novo`; `test_stage_cut_sem_derivados_nao_falha` PASSA (é guarda de regressão do passo seguinte).

- [ ] **Step 3: Implementar em `pipeline/stages.py`**

Logo abaixo de `DERIVADOS_DO_SOURCE` (após a linha 18):

```python
# Tudo que foi derivado do trimmed.mp4: reescrevê-lo deixa esses arquivos
# apontando para a timeline antiga — legendas fora de sincronia no render.
# hook.json fica de fora de propósito: o texto do hook não é sincronizado
# com a timeline.
DERIVADOS_DO_TRIMMED = (
    "transcript.json", "edit-recipe.json", "overlays.json", "suggestions.json",
)
```

No final de `stage_cut` (depois do `write_json` do `trimmed.probe.json`, linha 50):

```python
    # o trimmed mudou: mesma invalidação do stage_refine — sem ela, re-detectar
    # pausas num projeto transcrito deixava as legendas da timeline antiga
    # entrarem no render, fora de sincronia e sem aviso.
    for stale in DERIVADOS_DO_TRIMMED:
        (job.dir / stale).unlink(missing_ok=True)
```

Em `stage_refine`, trocar a tupla inline (linha 71) pela constante:

```python
    for stale in DERIVADOS_DO_TRIMMED:
        (job.dir / stale).unlink(missing_ok=True)
```

(o comentário existente acima do loop permanece)

- [ ] **Step 4: Rodar o backend inteiro**

Run: `python3 -m pytest -q`
Expected: tudo verde (312 passed, 1 skipped — os 310 de antes + 2 novos).

- [ ] **Step 5: Commit**

```bash
git add pipeline/stages.py tests/test_stages.py
git commit -m "fix(corte): stage_cut invalida os derivados do trimmed, como o refino

Re-detectar pausas num projeto transcrito reescrevia o trimmed.mp4 e deixava
transcript/recipe/overlays/suggestions da timeline antiga em disco — o render
saía com legendas fora de sincronia, sem aviso. Quarta causa do \"meu
trabalho não fica salvo\" (handoff 2026-07-31)."
```

---

### Task 2: Front — testes novos do aviso no "Detectar pausas" (devem falhar)

**Files:**
- Modify: `web/src/__tests__/CutsStep.test.tsx`

- [ ] **Step 1: Mover `comTrabalho` para o escopo do arquivo**

Hoje `comTrabalho` vive dentro do describe "aviso antes do corte manual" (linha 200). Movê-lo para logo após `const props = ...` (linha 29), sem alterar o conteúdo:

```tsx
const comTrabalho = {
  config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
  has_source: true, has_transcript: true, has_overlays: true,
  has_suggestions: false, has_recipe: true,
};
```

(e remover a definição local do describe antigo)

- [ ] **Step 2: `doCut` espera o botão habilitar**

O botão "Detectar pausas" vai ficar desabilitado enquanto `carregandoJob`. Atualizar o helper `doCut` (linha 32):

```tsx
async function doCut(container: HTMLElement) {
  // o botão fica desabilitado enquanto o getJob não responde (carregandoJob)
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /detectar pausas/i })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
  await waitFor(() => expect(screen.getByText(/trechos mantidos/i)).toBeInTheDocument());
  return container.querySelector("video") as HTMLVideoElement;
}
```

- [ ] **Step 3: Escrever o describe novo**

Acrescentar no final do arquivo:

```tsx
describe("CutsStep — aviso antes do Detectar pausas destruir trabalho", () => {
  // stage_cut agora invalida transcript/recipe/overlays/suggestions (mesma
  // invalidação do refino), então o botão confirma antes quando há o que
  // perder — o mesmo portão do "Aplicar cortes".
  async function esperarBotao() {
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /detectar pausas/i })).not.toBeDisabled());
    return screen.getByRole("button", { name: /detectar pausas/i });
  }

  it("pergunta antes de detectar de novo, listando o que será descartado", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());

    expect(await screen.findByText(/refaz o corte/i)).toBeInTheDocument();
    expect(screen.getByText(/transcrição/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/cut"))).toBe(false);
  });

  it("confirmar corta de verdade", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));

    expect(await screen.findByText(/trechos mantidos/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/cut"))).toBe(true);
  });

  it("desistir não corta nada", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());
    fireEvent.click(await screen.findByRole("button", { name: /desistir/i }));

    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/cut"))).toBe(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("sem nada a perder, corta direto e não pergunta", async () => {
    // getJob padrão: sem flags has_* → aPerder = []
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());

    expect(await screen.findByText(/trechos mantidos/i)).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("com getJob rejeitando, confirma sem saber o que há a perder", async () => {
    getJob.mockRejectedValueOnce(new Error("falha de rede"));
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());

    expect(await screen.findByText(/não foi possível confirmar/i)).toBeInTheDocument();
    expect(screen.getByText(/receita de render/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/cut"))).toBe(false);
  });

  it("depois de um corte confirmado, re-detectar não pergunta de novo", async () => {
    // o corte acabou de apagar os derivados; avisar outra vez seria mentira
    getJob.mockResolvedValueOnce(comTrabalho as any);
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));
    await screen.findByText(/trechos mantidos/i);

    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
    await waitFor(() => {
      const cuts = streamSSE.mock.calls.filter((c) => String(c[0]).includes("/cut"));
      expect(cuts.length).toBe(2);
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("o corte novo limpa as marcações da timeline antiga", async () => {
    // marcações de corte manual referenciam o trimmed anterior, que o
    // Detectar pausas acabou de substituir
    getJob.mockResolvedValueOnce(comTrabalho as any);
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 6 }], trimmed_mtime: 5,
    } as any);
    const { container } = render(<CutsStep {...props} />);
    await screen.findByText(/trechos mantidos/i);
    const video = container.querySelector("video") as HTMLVideoElement;
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    expect(screen.getByRole("button", { name: /remover trecho 1/i })).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /detectar pausas/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /remover trecho 1/i })).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test --prefix web -- CutsStep`
Expected: seis dos sete testes novos FALHAM (o diálogo não existe; `/cut` dispara direto). "sem nada a perder, corta direto" já passa — é guarda de regressão do caminho sem atrito. Os antigos continuam verdes — a implementação ainda não mudou.

*(sem commit aqui: a suíte está intencionalmente vermelha até a Task 4)*

---

### Task 3: Front — implementação no `CutsStep`

**Files:**
- Modify: `web/src/steps/CutsStep.tsx`

- [ ] **Step 1: Componente `AvisoDescarte`**

Logo antes de `export const CutsStep` (após os imports):

```tsx
// Parágrafo compartilhado pelos dois diálogos de confirmação (re-detectar
// pausas e corte manual): lista o que será descartado, com a variante
// conservadora para quando não sabemos o que o projeto tem (aPerder === null).
const AvisoDescarte: React.FC<{
  acao: string; // primeira frase, própria de cada botão
  aPerder: string[] | null;
  perdeTranscricao: boolean;
}> = ({ acao, aPerder, perdeTranscricao }) => (
  <p className="text-amber-200">
    {aPerder === null ? (
      <>
        Não foi possível confirmar o que este projeto já tem salvo. {acao}, então{" "}
        <strong>a transcrição, os textos, as sugestões e a receita de render</strong>{" "}
        seriam descartados, se existirem — as legendas ficariam fora de sincronia
        com o vídeo novo.
      </>
    ) : (
      <>
        {acao}, então <strong>{aPerder.join(", ")}</strong>{" "}
        {aPerder.length > 1 ? "serão descartados" : "será descartado"} — as
        legendas ficariam fora de sincronia com o vídeo novo.
        {perdeTranscricao && " Você vai precisar transcrever outra vez."}
      </>
    )}
  </p>
);
```

- [ ] **Step 2: Estado e portão do corte**

Junto de `confirmandoRefino` (linha 50):

```tsx
  const [confirmandoCorte, setConfirmandoCorte] = useState(false);
```

Logo antes de `onCut`:

```tsx
  const pedirParaCortar = () => {
    // mesmo portão do pedirParaAplicar: confirmar quando há o que perder — ou
    // quando não sabemos (aPerder === null), que erra para o lado seguro
    setConfirmandoRefino(false); // um diálogo por vez
    if (aPerder === null || aPerder.length > 0) { setConfirmandoCorte(true); return; }
    onCut();
  };
```

E o espelho em `pedirParaAplicar` — primeira linha do corpo ganha:

```tsx
    setConfirmandoCorte(false); // um diálogo por vez
```

- [ ] **Step 3: `onCut` fecha o diálogo e zera o que o corte apagou**

No início de `onCut`:

```tsx
    setConfirmandoCorte(false);
```

No `done` do `onCut`, depois de `setTrimmedVersion(...)`:

```tsx
          // o corte apagou os derivados (DERIVADOS_DO_TRIMMED); avisar de
          // novo no próximo clique seria mentira — igual ao refino
          setAPerder([]);
          setPerdeTranscricao(false);
          // as marcações antigas referenciam a timeline do trimmed anterior
          setRemoveList([]);
          setMarkStart(null);
```

- [ ] **Step 4: Botão + diálogo**

O botão "Detectar pausas" (linha 179) passa a:

```tsx
      <button onClick={pedirParaCortar} disabled={busy || !temSource || carregandoJob}
        className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
        {busy ? "Cortando..." : "Detectar pausas"}
      </button>
      {confirmandoCorte && (
        <div role="alertdialog" aria-label="confirmar nova detecção de pausas"
             className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm space-y-2">
          <AvisoDescarte acao="Detectar pausas refaz o corte a partir do vídeo original"
                         aPerder={aPerder} perdeTranscricao={perdeTranscricao} />
          <div className="flex gap-2">
            <button onClick={onCut} disabled={busy}
                    className="px-3 py-1 bg-amber-800 rounded disabled:opacity-40">
              Descartar e cortar
            </button>
            <button onClick={() => setConfirmandoCorte(false)} disabled={busy}
                    className="px-3 py-1 bg-zinc-800 rounded disabled:opacity-40">
              Desistir
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Diálogo do refino passa a usar `AvisoDescarte`**

Substituir o `<p className="text-amber-200">…</p>` inteiro do diálogo `confirmandoRefino` (linhas 274-294) por:

```tsx
                    <AvisoDescarte acao="Cortar de novo encurta o vídeo"
                                   aPerder={aPerder} perdeTranscricao={perdeTranscricao} />
```

O texto renderizado é o mesmo de hoje (a frase "Cortar de novo encurta o vídeo, então …" se recompõe por inteiro).

- [ ] **Step 6: Rodar os testes novos**

Run: `npm test --prefix web -- CutsStep`
Expected: o describe novo PASSA. Os testes antigos do describe "aviso antes do corte manual" FALHAM (usam `doCut` com `comTrabalho`, que agora abre o diálogo do corte). É o efeito esperado — a Task 4 os migra.

*(sem commit ainda)*

---

### Task 4: Front — migrar os testes do refino para a nova semântica

**Files:**
- Modify: `web/src/__tests__/CutsStep.test.tsx` (describe "aviso antes do corte manual destruir trabalho")

- [ ] **Step 1: Novos helpers do describe**

No describe "CutsStep — aviso antes do corte manual destruir trabalho", substituir o helper `marcarUmTrecho` por:

```tsx
  // Com o Detectar pausas também invalidando os derivados, um corte feito
  // nesta sessão zera o aviso — o caminho real para ter algo a perder E um
  // corte na tela é reabrir um projeto que já tem corte salvo.
  async function montarComCorteSalvo() {
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 6 }], trimmed_mtime: 5,
    } as any);
    const { container } = render(<CutsStep {...props} />);
    await screen.findByText(/trechos mantidos/i);
    return container;
  }

  async function marcarUmTrecho(container: HTMLElement) {
    const video = container.querySelector("video") as HTMLVideoElement;
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /aplicar cortes/i })).not.toBeDisabled());
  }
```

- [ ] **Step 2: Migrar os testes que faziam `doCut`**

Cada teste abaixo troca `const { container } = render(<CutsStep {...props} />); await marcarUmTrecho(container);` por `const container = await montarComCorteSalvo(); await marcarUmTrecho(container);` (o mock do `getJob` de cada teste fica como está, **antes** do `montarComCorteSalvo`):

- "pergunta antes de aplicar, listando o que será descartado"
- "confirmar aplica de verdade"
- "desistir não aplica nada e mantém os trechos marcados"
- "sem nada a perder, aplica direto e não pergunta"
- "com has_transcript, avisa que será preciso transcrever de novo"
- "sem has_transcript, não avisa sobre transcrever de novo mesmo com outra coisa a perder"
- "refino que falha mantém o aviso para a próxima tentativa"

Exemplo com o primeiro (o padrão é idêntico nos demais):

```tsx
  it("pergunta antes de aplicar, listando o que será descartado", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const container = await montarComCorteSalvo();
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));

    expect(await screen.findByText(/transcrição/i)).toBeInTheDocument();
    expect(screen.getByText(/textos/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(false);
  });
```

- [ ] **Step 3: Migrar "o segundo corte da mesma sessão não avisa de novo"**

Este usava `marcarUmTrecho` duas vezes (e a versão antiga refazia `doCut`). Na nova semântica, o segundo trecho é marcado sobre o mesmo vídeo:

```tsx
  it("o segundo corte da mesma sessão não avisa de novo", async () => {
    // o refino já apagou tudo; avisar outra vez seria mentira
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const container = await montarComCorteSalvo();
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
```

Os testes "com corte salvo, espera o getJob…" e "com getJob rejeitando, libera Aplicar cortes…" já montam com corte salvo inline — **não mudam**.

- [ ] **Step 4: Suíte do front inteira**

Run: `npm test --prefix web`
Expected: tudo verde (36 arquivos; 250 testes de antes + os 7 novos).

- [ ] **Step 5: TypeScript sem erros novos**

Run: `npx tsc --noEmit -p web/tsconfig.json`
Expected: apenas os 5 erros de baseline do handoff (`BrandStep.test.tsx`, `animatedApi.ts`, `BrandKitModal.tsx` ×2, `steps/animated/RenderStep.tsx`). Nenhum novo em `CutsStep`.

- [ ] **Step 6: Commit**

```bash
git add web/src/steps/CutsStep.tsx web/src/__tests__/CutsStep.test.tsx
git commit -m "feat(corte): Detectar pausas confirma antes de descartar trabalho

Mesmo portão do Aplicar cortes: com transcrição/textos/sugestões/receita a
perder (ou sem conseguir saber), abre o diálogo antes de refazer o corte. O
parágrafo do aviso vira o componente AvisoDescarte, compartilhado pelos dois
diálogos. Após o corte, aPerder zera e as marcações da timeline antiga somem."
```

---

### Task 5: Verificação final e registro

**Files:**
- Modify: `docs/superpowers/notes/2026-07-31-handoff.md` (seção "O que falta", item 1)

- [ ] **Step 1: Suítes completas**

Run: `python3 -m pytest -q && npm test --prefix web`
Expected: backend 312 passed + 1 skipped; front verde com os testes novos.

- [ ] **Step 2: Marcar a pendência 1 como resolvida no handoff**

No topo da seção "### 1. `stage_cut` não invalida os derivados — corrupção silenciosa (grave)", inserir a linha:

```markdown
> **Resolvido em 2026-07-31** — spec em
> `docs/superpowers/specs/2026-07-31-stage-cut-invalida-derivados-design.md`,
> plano em `docs/superpowers/plans/2026-07-31-stage-cut-invalida-derivados.md`.
```

- [ ] **Step 3: Commit e push**

```bash
git add docs/superpowers/notes/2026-07-31-handoff.md
git commit -m "docs(handoff): pendência 1 (stage_cut) resolvida"
git push origin main
```
