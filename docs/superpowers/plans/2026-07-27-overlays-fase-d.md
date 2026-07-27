# Fase D — Sugestões de texto sem API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Um painel de sugestões de texto no passo Textos: o Claude da sessão grava `suggestions.json`, o usuário define um estilo padrão, e aplica/pula cada sugestão (aplicar = vira texto no estilo padrão). Zero IA/chave no servidor.

**Architecture:** Backend só persiste dois arquivos por job (`suggestions.json`, `suggest-defaults.json`), espelhando o padrão de overlays. Frontend adiciona um painel de estilo padrão + um painel de sugestões ao `OverlaysStep`. Helper puro `suggestionToOverlay` converte sugestão + estilo padrão em overlay. A geração é feita pelo Claude no chat (fora do código).

**Tech Stack:** FastAPI + pydantic (backend), React/Vite/Vitest (web). Testes: `python3 -m pytest` e `cd web && npx vitest run`.

**Constraints:** Nada de API Anthropic. Não mexer em render/recipe/schema além do combinado. `python3` (não `python`). Rotas têm prefixo `/api`.

---

### Task 1: Backend — endpoints e modelos de sugestões

**Files:**
- Modify: `api/models.py`
- Modify: `api/routes.py`
- Modify: `pipeline/stages.py:52` (stage_refine)
- Test: `api/tests/test_routes.py`, `api/tests/test_stages.py`

- [ ] **Step 1: Testes que falham (routes)**

Adicionar em `api/tests/test_routes.py`. Os testes deste arquivo usam os fixtures `client` (TestClient) e `sample_mp4`, e criam o job com o helper local `_upload(client, sample_mp4, slug)` (já definido no topo do arquivo). `write_json` NÃO cria o diretório pai, então PUT exige um job existente → sempre suba o job antes. Siga exatamente esse padrão:

```python
def test_suggestions_get_empty_returns_list(client, sample_mp4):
    _upload(client, sample_mp4, "sug1")
    r = client.get("/api/jobs/sug1/suggestions")
    assert r.status_code == 200
    assert r.json() == []


def test_suggestions_put_get_roundtrip(client, sample_mp4):
    _upload(client, sample_mp4, "sug2")
    items = [{
        "id": "sug_01", "text": "R$ 6-15 mil / ano",
        "fromFrame": 810, "durationInFrames": 60,
        "kind": "short", "angle": "urgency", "source": "custa de 6 a 15 mil por ano",
    }]
    assert client.put("/api/jobs/sug2/suggestions", json=items).status_code == 200
    got = client.get("/api/jobs/sug2/suggestions").json()
    assert len(got) == 1 and got[0]["text"] == "R$ 6-15 mil / ano" and got[0]["kind"] == "short"


def test_suggest_defaults_get_default_when_absent(client, sample_mp4):
    _upload(client, sample_mp4, "sug3")
    d = client.get("/api/jobs/sug3/suggest-defaults").json()
    assert d["x"] == 0.5 and d["y"] == 0.12 and d["fontSize"] == 64 and d["anchor"] == "center"


def test_suggest_defaults_roundtrip(client, sample_mp4):
    _upload(client, sample_mp4, "sug4")
    d = {"x": 0.5, "y": 0.8, "anchor": "center", "fontSize": 80, "fontFamily": "Poppins", "color": "#ffffff"}
    assert client.put("/api/jobs/sug4/suggest-defaults", json=d).status_code == 200
    assert client.get("/api/jobs/sug4/suggest-defaults").json()["y"] == 0.8
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `python3 -m pytest api/tests/test_routes.py -k "suggest" -q`
Expected: FAIL (404 / rota inexistente).

- [ ] **Step 3: Modelos em `api/models.py`**

Após a classe `OverlayParams` (por volta da linha 104), adicionar:

```python
class Suggestion(BaseModel):
    id: str = ""
    text: str
    fromFrame: int
    durationInFrames: int
    kind: Literal["short", "dense"] = "short"
    angle: str = ""
    source: str = ""


class SuggestDefaults(BaseModel):
    x: float = 0.5
    y: float = 0.12
    anchor: Literal["center", "left", "right"] = "center"
    fontSize: int = 64
    fontFamily: str = ""
    color: HexOrEmpty = ""
```

- [ ] **Step 4: Rotas em `api/routes.py`**

No import de `api.models` (linha 15-18), acrescentar `Suggestion, SuggestDefaults`:

```python
from api.models import (
    CaptionStyleParams, CutParams, CutResult, CutSegmentOut,
    Hook, OverlayParams, RefineParams, RenderParams, Suggestion, SuggestDefaults, TranscribeParams,
)
```

Depois do bloco de overlays (após a linha 135), adicionar:

```python
@router.get("/jobs/{slug}/suggestions")
def get_suggestions(slug: str):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "suggestions.json"
    if not p.exists():
        return []
    return load_json(p)


@router.put("/jobs/{slug}/suggestions")
def put_suggestions(slug: str, suggestions: list[Suggestion]):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "suggestions.json"
    write_json(p, [s.model_dump() for s in suggestions])
    return {"ok": True}


@router.get("/jobs/{slug}/suggest-defaults")
def get_suggest_defaults(slug: str):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "suggest-defaults.json"
    if not p.exists():
        return SuggestDefaults().model_dump()
    return load_json(p)


@router.put("/jobs/{slug}/suggest-defaults")
def put_suggest_defaults(slug: str, defaults: SuggestDefaults):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "suggest-defaults.json"
    write_json(p, defaults.model_dump())
    return {"ok": True}
```

- [ ] **Step 5: `stage_refine` apaga suggestions.json (mantém suggest-defaults)**

Em `pipeline/stages.py:52`, trocar:

```python
    for stale in ("transcript.json", "edit-recipe.json", "overlays.json"):
```
por:
```python
    for stale in ("transcript.json", "edit-recipe.json", "overlays.json", "suggestions.json"):
```

- [ ] **Step 6: Teste do stage_refine**

Em `api/tests/test_stages.py`, adicionar um teste que cria `suggestions.json` e `suggest-defaults.json` no job, roda `stage_refine` com um range qualquer, e verifica que `suggestions.json` foi apagado e `suggest-defaults.json` permanece. Siga o padrão do teste existente de stage_refine (mesmos helpers de job/tmp). Exemplo de asserção:

```python
    assert not (job.dir / "suggestions.json").exists()
    assert (job.dir / "suggest-defaults.json").exists()
```

- [ ] **Step 7: Rodar e ver passar**

Run: `python3 -m pytest api/tests/test_routes.py api/tests/test_stages.py -q`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/models.py api/routes.py pipeline/stages.py api/tests/test_routes.py api/tests/test_stages.py
git commit -m "feat(api): endpoints de suggestions + suggest-defaults (Fase D, sem IA)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Web — helper `suggestionToOverlay` + tipos + api

**Files:**
- Create: `web/src/suggestions.ts`
- Modify: `web/src/api.ts`
- Test: `web/src/__tests__/suggestions.test.ts`

- [ ] **Step 1: Teste que falha**

Criar `web/src/__tests__/suggestions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { suggestionToOverlay } from "../suggestions";
import type { Suggestion, SuggestDefaults } from "../suggestions";

const sug: Suggestion = {
  id: "sug_01", text: "R$ 6-15 mil / ano",
  fromFrame: 810, durationInFrames: 60, kind: "short", angle: "urgency", source: "...",
};
const defs: SuggestDefaults = {
  x: 0.4, y: 0.8, anchor: "left", fontSize: 90, fontFamily: "Poppins", color: "#ff0000",
};

describe("suggestionToOverlay", () => {
  it("aplica o estilo padrão e copia texto/tempo", () => {
    const o = suggestionToOverlay(sug, defs, "ov_x");
    expect(o.id).toBe("ov_x");
    expect(o.type).toBe("text");
    expect(o.text).toBe("R$ 6-15 mil / ano");
    expect(o.fromFrame).toBe(810);
    expect(o.durationInFrames).toBe(60);
    expect(o.x).toBe(0.4);
    expect(o.y).toBe(0.8);
    expect(o.anchor).toBe("left");
    expect(o.fontSize).toBe(90);
    expect(o.fontFamily).toBe("Poppins");
    expect(o.color).toBe("#ff0000");
    expect(o.enter).toBe("slide-up");
    expect(o.exit).toBe("fade");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/suggestions.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Criar `web/src/suggestions.ts`**

```ts
import type { Overlay } from "./types";

export type Suggestion = {
  id: string;
  text: string;
  fromFrame: number;
  durationInFrames: number;
  kind: "short" | "dense";
  angle: string;
  source: string;
};

export type SuggestDefaults = {
  x: number;
  y: number;
  anchor: "center" | "left" | "right";
  fontSize: number;
  fontFamily: string;
  color: string;
};

export function suggestionToOverlay(s: Suggestion, d: SuggestDefaults, id: string): Overlay {
  return {
    id,
    type: "text",
    text: s.text,
    fromFrame: s.fromFrame,
    durationInFrames: s.durationInFrames,
    x: d.x,
    y: d.y,
    anchor: d.anchor,
    fontSize: d.fontSize,
    color: d.color,
    highlightColor: "",
    fontFamily: d.fontFamily,
    enter: "slide-up",
    exit: "fade",
    enterDurationInFrames: 12,
    exitDurationInFrames: 12,
  };
}
```

- [ ] **Step 4: Funções de api em `web/src/api.ts`**

Após `putOverlays` (por volta da linha 72), adicionar (siga o mesmo estilo `jsonOrThrow`/`BASE` do arquivo; importe os tipos de `./suggestions`):

```ts
import type { Suggestion, SuggestDefaults } from "./suggestions";

export async function getSuggestions(slug: string): Promise<Suggestion[]> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/suggestions`));
}

export async function putSuggestions(slug: string, items: Suggestion[]): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/suggestions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  }));
}

export async function getSuggestDefaults(slug: string): Promise<SuggestDefaults> {
  return jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/suggest-defaults`));
}

export async function putSuggestDefaults(slug: string, d: SuggestDefaults): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/suggest-defaults`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(d),
  }));
}
```

(Coloque o `import type` no topo, junto dos outros imports de tipo do arquivo.)

- [ ] **Step 5: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/suggestions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/suggestions.ts web/src/api.ts web/src/__tests__/suggestions.test.ts
git commit -m "feat(web): suggestionToOverlay + api de suggestions/suggest-defaults

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `OverlaysStep` — painel de estilo padrão + painel de sugestões

**Files:**
- Modify: `web/src/steps/OverlaysStep.tsx`
- Test: `web/src/__tests__/OverlaysStep.test.tsx`

**Contexto:** `OverlaysStep` já tem `overlays`, `selectedId`, `fps`, `save()`, `idCounter`, `setErr`, `saved` toast. Vamos ADICIONAR sugestões e estilo padrão sem quebrar o existente.

- [ ] **Step 1: Testes que falham**

Primeiro, no `mockFetch()` do arquivo `web/src/__tests__/OverlaysStep.test.tsx`, adicionar handlers para os novos endpoints (GET retornando uma sugestão e os defaults) — adicionar ANTES do `return { ok: true, ... }` final, dentro do `f`:

```tsx
    if (url.endsWith("/suggestions") && (!init || !init.method || init.method === "GET"))
      return { ok: true, json: async () => ([{ id: "sug_01", text: "Aplica isto", fromFrame: 30, durationInFrames: 60, kind: "short", angle: "curiosity", source: "fala origem" }]) } as any;
    if (url.endsWith("/suggest-defaults") && (!init || !init.method || init.method === "GET"))
      return { ok: true, json: async () => ({ x: 0.5, y: 0.12, anchor: "center", fontSize: 72, fontFamily: "Poppins", color: "" }) } as any;
```

Depois adicionar os testes no `describe("OverlaysStep", ...)`:

```tsx
  it("lista sugestões vindas do backend", async () => {
    render(<OverlaysStep {...props} />);
    expect(await screen.findByText("Aplica isto")).toBeInTheDocument();
  });

  it("aplicar uma sugestão vira texto na lista e some das sugestões", async () => {
    render(<OverlaysStep {...props} />);
    await screen.findByText("Aplica isto");
    fireEvent.click(screen.getByRole("button", { name: /aplicar sugest/i }));
    // virou um input de texto editável com o conteúdo aplicado
    expect(await screen.findByDisplayValue("Aplica isto")).toBeInTheDocument();
    // sumiu do painel de sugestões (não há mais botão aplicar)
    expect(screen.queryByRole("button", { name: /aplicar sugest/i })).not.toBeInTheDocument();
  });

  it("pular remove a sugestão sem criar texto", async () => {
    render(<OverlaysStep {...props} />);
    await screen.findByText("Aplica isto");
    fireEvent.click(screen.getByRole("button", { name: /pular sugest/i }));
    expect(screen.queryByText("Aplica isto")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Aplica isto")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx`
Expected: FAIL (sem painel de sugestões).

- [ ] **Step 3: Implementar em `web/src/steps/OverlaysStep.tsx`**

(a) Imports:
```tsx
import { getSuggestions, putSuggestions, getSuggestDefaults, putSuggestDefaults } from "../api";
import { suggestionToOverlay } from "../suggestions";
import type { Suggestion, SuggestDefaults } from "../suggestions";
```

(b) Estados (junto dos existentes):
```tsx
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [defs, setDefs] = useState<SuggestDefaults>({ x: 0.5, y: 0.12, anchor: "center", fontSize: 64, fontFamily: "", color: "" });
  const defsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

(c) No `useEffect` de carga, buscar sugestões e defaults:
```tsx
    getSuggestions(slug).then(setSuggestions).catch(() => {});
    getSuggestDefaults(slug).then(setDefs).catch(() => {});
```

(d) Cleanup do timer de defaults (no effect de cleanup existente OU um novo):
```tsx
  useEffect(() => () => { if (defsTimer.current) clearTimeout(defsTimer.current); }, []);
```

(e) Handlers (perto de `addOverlay`):
```tsx
  const patchDefs = (p: Partial<SuggestDefaults>) => {
    const next = { ...defs, ...p };
    setDefs(next);
    if (defsTimer.current) clearTimeout(defsTimer.current);
    defsTimer.current = setTimeout(() => { putSuggestDefaults(slug, next).catch(() => {}); }, 500);
  };

  const applySuggestion = async (s: Suggestion) => {
    const id = `ov_${Date.now().toString(36)}_${idCounter.current++}`;
    const ov = suggestionToOverlay(s, defs, id);
    const nextOverlays = [...overlays, ov];
    const nextSug = suggestions.filter((x) => x.id !== s.id);
    setOverlays(nextOverlays); setSelectedId(id); setSuggestions(nextSug);
    setErr(null);
    try {
      await putOverlays(slug, nextOverlays);
      await putSuggestions(slug, nextSug);
      await runRecipe(slug);
    } catch (e: any) { setErr(e.message); }
  };

  const skipSuggestion = async (s: Suggestion) => {
    const nextSug = suggestions.filter((x) => x.id !== s.id);
    setSuggestions(nextSug);
    try { await putSuggestions(slug, nextSug); } catch (e: any) { setErr(e.message); }
  };

  const reloadSuggestions = () => { getSuggestions(slug).then(setSuggestions).catch(() => {}); };
```

(f) UI — inserir logo abaixo do `<OverlayTimeline .../>` (antes da linha de botões "+ Texto"):

```tsx
      {/* Estilo padrão das sugestões */}
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm grid grid-cols-4 gap-3">
        <label className="flex flex-col gap-1 col-span-1">Posição
          <select aria-label="posição padrão" value={defs.y <= 0.2 ? "topo" : defs.y >= 0.7 ? "baixo" : "centro"}
            onChange={(e) => patchDefs({ y: e.target.value === "topo" ? 0.12 : e.target.value === "baixo" ? 0.8 : 0.5 })}
            className="bg-zinc-800 rounded px-2 py-1">
            <option value="topo">Topo</option>
            <option value="centro">Centro</option>
            <option value="baixo">Baixo</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">Fonte
          <select aria-label="fonte padrão" value={defs.fontFamily || "Inter"}
            onChange={(e) => patchDefs({ fontFamily: e.target.value })} className="bg-zinc-800 rounded px-2 py-1">
            {FONTS.map((ff) => <option key={ff} value={ff}>{ff}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Cor
          <input aria-label="cor padrão" type="color" value={defs.color || "#ffffff"}
            onChange={(e) => patchDefs({ color: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">Tamanho
          <input aria-label="tamanho padrão" type="range" min={24} max={160} value={defs.fontSize}
            onChange={(e) => patchDefs({ fontSize: Number(e.target.value) })} />
        </label>
      </div>

      {/* Painel de sugestões */}
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Sugestões ({suggestions.length})</span>
          <button aria-label="recarregar sugestões" onClick={reloadSuggestions} className="text-xs px-2 py-1 bg-zinc-800 rounded">↻ Recarregar</button>
        </div>
        {suggestions.length === 0 ? (
          <p className="text-xs text-zinc-500">Peça no chat: “gera sugestões pro {slug}”. Depois clique ↻ Recarregar.</p>
        ) : (
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-sm border-l-2 border-emerald-700 pl-2">
                <div className="flex-1">
                  <div className="font-medium">{s.text}</div>
                  <div className="text-xs text-zinc-500">{(s.fromFrame / fps).toFixed(1)}s · {s.kind} · {s.angle}</div>
                  {s.source && <div className="text-xs text-zinc-600 italic">“{s.source}”</div>}
                </div>
                <button aria-label={`aplicar sugestão ${s.id}`} onClick={() => applySuggestion(s)} className="px-2 py-1 bg-emerald-600 rounded text-xs">✓ Aplicar</button>
                <button aria-label={`pular sugestão ${s.id}`} onClick={() => skipSuggestion(s)} className="px-2 py-1 bg-zinc-800 rounded text-xs">✗ Pular</button>
              </li>
            ))}
          </ul>
        )}
      </div>
```

NOTA: `putOverlays`, `putSuggestions`, `runRecipe` já estarão importados (os dois primeiros do api). Confirme que `putOverlays` e `runRecipe` estão no import de `../api` (já estão hoje) e some `getSuggestions` etc.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx`
Expected: PASS (5 C.2 + 3 novos).

- [ ] **Step 5: Suíte completa do web**

Run: `cd web && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/steps/OverlaysStep.tsx web/src/__tests__/OverlaysStep.test.tsx
git commit -m "feat(overlays): painel de sugestões + estilo padrão (aplicar/pular/recarregar)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4 (controller, não subagente): geração real + doc + memória

Após 1–3 verdes e o build no ar:

- [ ] Gerar de verdade: ler `jobs/A1 Exame/transcript.json`, seguir `ad-creative` (ângulos + grounding, curto+denso, sem inventar), escrever `jobs/A1 Exame/suggestions.json` com ids `sug_01..`.
- [ ] Escrever `docs/superpowers/notes/gerar-sugestoes.md` (o procedimento que o usuário dispara no chat).
- [ ] Atualizar memória: skills vendorizadas em `.claude/skills/`, `ad-creative` como base, e o fluxo "Claude gera → suggestions.json → aplicar no estilo padrão".

---

## Self-Review

- **Cobertura da spec:** endpoints suggestions/suggest-defaults (T1) ✓; stage_refine apaga suggestions (T1) ✓; helper `suggestionToOverlay` (T2) ✓; api web (T2) ✓; painel de estilo padrão + painel de sugestões aplicar/pular/recarregar (T3) ✓; geração pelo Claude (T4) ✓.
- **Tipos consistentes:** `Suggestion`/`SuggestDefaults` iguais em `api/models.py`, `web/src/suggestions.ts` e nos testes. `suggestionToOverlay(s, d, id)` mesma assinatura na spec/plano/teste.
- **Sem placeholders:** todo passo com código e comando + resultado esperado. (Os fixtures de teste do backend reutilizam os já existentes — instrução explícita de não inventar estilo novo.)
- **Fora de escopo respeitado:** nenhuma chamada de IA/rede no servidor; sem API/chave; render/recipe intactos (só `stage_refine` ganha 1 arquivo na limpeza).
