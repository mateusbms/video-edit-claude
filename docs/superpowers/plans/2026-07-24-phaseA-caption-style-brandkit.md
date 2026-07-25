# Phase A — Caption Style + Brand Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estilo de legenda editável (tamanho/posição/cor/destaque/fonte) com preview ao vivo, tendo o brand kit por projeto como origem dos padrões.

**Architecture:** `captionStyle` vive no `JobConfig`, é resolvido (com defaults do brand kit) para dentro do `edit-recipe.json`, e a `CaptionLayer` do Remotion o lê (fontes carregadas via `@remotion/google-fonts`). A UI edita o estilo e o brand kit no passo de Transcrição, com o preview refletindo em tempo real.

**Tech Stack:** Python/FastAPI; React 19/Vite/Vitest; Remotion 4.

---

## PARTE 1 — Estilo de legenda (defaults do brand.json estático)

## Task 1: backend — JobConfig + recipe captionStyle

**Files:** Modify `pipeline/job.py`, `pipeline/recipe.py`, `pipeline/stages.py`. Test: `tests/test_recipe.py`.

- [ ] **Step 1: failing test** — add to `tests/test_recipe.py`:

```python
def test_build_recipe_injects_caption_style_defaults():
    from pipeline.recipe import build_recipe
    r = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[{"word": "a", "start": 0.0, "end": 0.5}],
        hook={"title": "T", "subtitle": ""}, hook_card_frames=0,
        caption_style={"fontSize": 60, "bottom": 200, "color": "", "highlightColor": "", "fontFamily": ""},
        brand={"colors": {"foreground": "#111111", "accent": "#22c55e"}, "fonts": {"body": "Poppins"}},
    )
    cs = r["captionStyle"]
    assert cs["fontSize"] == 60
    assert cs["bottom"] == 200
    assert cs["color"] == "#111111"        # herdou do brand
    assert cs["highlightColor"] == "#22c55e"
    assert cs["fontFamily"] == "Poppins"


def test_build_recipe_caption_style_overrides_brand():
    from pipeline.recipe import build_recipe
    r = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[], hook={"title": "T", "subtitle": ""}, hook_card_frames=0,
        caption_style={"fontSize": 48, "bottom": 120, "color": "#ff0000", "highlightColor": "#00ff00", "fontFamily": "Inter"},
        brand={"colors": {"foreground": "#111", "accent": "#222"}, "fonts": {"body": "Roboto"}},
    )
    cs = r["captionStyle"]
    assert cs["color"] == "#ff0000"
    assert cs["fontFamily"] == "Inter"
```

- [ ] **Step 2: run to verify fail** — `.venv/bin/pytest tests/test_recipe.py::test_build_recipe_injects_caption_style_defaults -v` → FAIL (`build_recipe` não aceita `caption_style`).

- [ ] **Step 3: implement**

In `pipeline/job.py` `JobConfig`, add fields (após `max_caption_gap`):
```python
    brand_kit_slug: str = ""
    caption_font_size: int = 48
    caption_bottom: int = 120
    caption_color: str = ""
    caption_highlight: str = ""
    caption_font: str = ""
```

In `pipeline/recipe.py`, change `build_recipe` signature to accept the new kwargs (defaults keep back-compat):
```python
def build_recipe(
    *,
    width: int,
    height: int,
    fps: float,
    trimmed_duration: float,
    words: list[dict],
    hook: dict,
    hook_card_frames: int,
    max_chars: int = 24,
    max_gap: float = 0.6,
    trimmed_frames_actual: int | None = None,
    caption_style: dict | None = None,
    brand: dict | None = None,
) -> dict:
```
Add a helper + resolution before the final `return`. Right before `return {`:
```python
    cs = caption_style or {}
    bcolors = (brand or {}).get("colors", {})
    bfonts = (brand or {}).get("fonts", {})
    resolved_caption_style = {
        "fontSize": cs.get("fontSize") or 48,
        "bottom": cs.get("bottom") or 120,
        "color": cs.get("color") or bcolors.get("foreground") or "#ffffff",
        "highlightColor": cs.get("highlightColor") or bcolors.get("accent") or "#22c55e",
        "fontFamily": cs.get("fontFamily") or bfonts.get("body") or "Inter",
    }
```
Add `"captionStyle": resolved_caption_style,` as a key in the returned dict (e.g. right after `"captions": captions,`).

In `pipeline/stages.py` `stage_recipe`, pass the new args from the config (o carregamento do brand kit por slug entra na Task 5; por ora passe `brand=None` e o `caption_style` dos campos do config):
```python
    recipe = build_recipe(
        width=meta["width"], height=meta["height"], fps=meta["fps"],
        trimmed_duration=trimmed_duration, words=words,
        hook=hook, hook_card_frames=job.config.hook_card_frames,
        max_chars=job.config.max_caption_chars, max_gap=job.config.max_caption_gap,
        trimmed_frames_actual=trimmed_frames_actual,
        caption_style={
            "fontSize": job.config.caption_font_size,
            "bottom": job.config.caption_bottom,
            "color": job.config.caption_color,
            "highlightColor": job.config.caption_highlight,
            "fontFamily": job.config.caption_font,
        },
        brand=None,
    )
```

- [ ] **Step 4: run to verify pass** — `.venv/bin/pytest tests/test_recipe.py -v` → PASS. Then `.venv/bin/pytest -q` (sem regressões).

- [ ] **Step 5: commit**
```bash
git add pipeline/job.py pipeline/recipe.py pipeline/stages.py tests/test_recipe.py
git commit -m "feat(recipe): resolve editable captionStyle into edit-recipe"
```

---

## Task 2: backend — endpoints de estilo/brand + estado

**Files:** Modify `api/jobs.py`, `api/routes.py`, `api/models.py`. Test: `api/tests/test_routes.py`.

- [ ] **Step 1: failing test** — add to `api/tests/test_routes.py`:
```python
def test_caption_style_persists(client, sample_mp4):
    _upload(client, sample_mp4, "cs1")
    r = client.put("/api/jobs/cs1/caption-style",
                   json={"fontSize": 72, "bottom": 200, "color": "#ff0000",
                         "highlightColor": "#00ff00", "fontFamily": "Poppins"})
    assert r.status_code == 200
    s = client.get("/api/jobs/cs1").json()
    assert s["captionStyle"]["fontSize"] == 72
    assert s["captionStyle"]["fontFamily"] == "Poppins"
```

- [ ] **Step 2: run to verify fail** — `.venv/bin/pytest api/tests/test_routes.py::test_caption_style_persists -v` → FAIL.

- [ ] **Step 3: implement**

In `api/models.py`, add:
```python
class CaptionStyleParams(BaseModel):
    fontSize: int = 48
    bottom: int = 120
    color: str = ""
    highlightColor: str = ""
    fontFamily: str = ""
```

In `api/jobs.py`, add helpers (padrão dos `update_*` existentes — leem/gravam `job.config.json`):
```python
def update_caption_style(slug: str, jobs_root: Path, style) -> None:
    job = init_job(jobs_root, slug)
    job.config.caption_font_size = style.fontSize
    job.config.caption_bottom = style.bottom
    job.config.caption_color = style.color
    job.config.caption_highlight = style.highlightColor
    job.config.caption_font = style.fontFamily
    write_json(job.dir / "job.config.json", asdict(job.config))


def update_brand_kit(slug: str, jobs_root: Path, kit_slug: str) -> None:
    job = init_job(jobs_root, slug)
    job.config.brand_kit_slug = kit_slug
    write_json(job.dir / "job.config.json", asdict(job.config))
```
(Confirme os imports em `api/jobs.py`: `init_job`, `write_json` de `pipeline.job`, e `asdict` de `dataclasses`. Adicione o que faltar.)

In `api/jobs.py` `get_state`, exponha o estilo/brand atuais no `JobState`. Adicione ao `JobState` (em `api/models.py`) os campos:
```python
    captionStyle: dict | None = None
    brandKitSlug: str = ""
```
e em `get_state`, popular a partir do `job.config`:
```python
    state.captionStyle = {
        "fontSize": job.config.caption_font_size,
        "bottom": job.config.caption_bottom,
        "color": job.config.caption_color,
        "highlightColor": job.config.caption_highlight,
        "fontFamily": job.config.caption_font,
    }
    state.brandKitSlug = job.config.brand_kit_slug
```
(Leia `get_state` para inserir isso onde o `state` já é montado a partir do `job.config`.)

In `api/routes.py`, add endpoints:
```python
from api.models import CaptionStyleParams  # juntar ao import existente de models

@router.put("/jobs/{slug}/caption-style")
def put_caption_style(slug: str, style: CaptionStyleParams):
    jobs_root, *_ = _roots()
    update_caption_style(slug, jobs_root, style)
    return {"ok": True}


@router.put("/jobs/{slug}/brand-kit")
def put_brand_kit(slug: str, body: dict):
    jobs_root, *_ = _roots()
    update_brand_kit(slug, jobs_root, body.get("slug", ""))
    return {"ok": True}
```
(Adicione `update_caption_style, update_brand_kit` ao import `from api.jobs import (...)`.)

- [ ] **Step 4: run to verify pass** — `.venv/bin/pytest api/tests/test_routes.py -v` → PASS. Then `.venv/bin/pytest -q`.

- [ ] **Step 5: commit**
```bash
git add api/jobs.py api/routes.py api/models.py api/tests/test_routes.py
git commit -m "feat(api): persist caption style + brand kit on the job"
```

---

## Task 3: Remotion — font loading + schema + CaptionLayer

**Files:** Create `remotion/src/fonts.ts`; modify `remotion/src/schema.ts`, `remotion/src/components/CaptionLayer.tsx`, `remotion/src/Timeline.tsx`, `remotion/src/Main16x9.tsx`, `remotion/src/Vertical9x16.tsx`. Test: `remotion/src/__tests__/fonts.test.ts`.

- [ ] **Step 1: failing test** — create `remotion/src/__tests__/fonts.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SUPPORTED_FONTS, resolveFont } from "../fonts";

describe("resolveFont", () => {
  it("mantém uma fonte suportada", () => {
    expect(resolveFont("Poppins")).toBe("Poppins");
  });
  it("cai no padrão para fonte desconhecida", () => {
    expect(resolveFont("Comic Sans XYZ")).toBe("Inter");
  });
  it("lista curada não vazia", () => {
    expect(SUPPORTED_FONTS.length).toBeGreaterThan(2);
    expect(SUPPORTED_FONTS).toContain("Inter");
  });
});
```

- [ ] **Step 2: run to verify fail** — `cd remotion && npx vitest run src/__tests__/fonts.test.ts` → FAIL.

- [ ] **Step 3: implement**

Create `remotion/src/fonts.ts`:
```ts
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";

// carrega as fontes na composição
loadInter();
loadPoppins();
loadMontserrat();
loadRoboto();

export const SUPPORTED_FONTS = ["Inter", "Poppins", "Montserrat", "Roboto"] as const;

export function resolveFont(name: string): string {
  return (SUPPORTED_FONTS as readonly string[]).includes(name) ? name : "Inter";
}
```
(Se algum import de `@remotion/google-fonts/<Fonte>` falhar no build, troque por uma fonte que exista no pacote instalado — rode `ls remotion/node_modules/@remotion/google-fonts/` e ajuste a lista para 4 fontes válidas, mantendo "Inter" como fallback.)

In `remotion/src/schema.ts`, add before `zEditRecipe`:
```ts
export const zCaptionStyle = z.object({
  fontSize: z.number(),
  bottom: z.number(),
  color: z.string(),
  highlightColor: z.string(),
  fontFamily: z.string(),
});
```
and add to `zEditRecipe` object: `captionStyle: zCaptionStyle.optional(),` plus `export type TCaptionStyle = z.infer<typeof zCaptionStyle>;`.

Replace `remotion/src/components/CaptionLayer.tsx` to read the style (fallback aos defaults e ao theme):
```tsx
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { resolveFont } from "../fonts";
import { findActive, activeWordIndex } from "../timeline-utils";
import type { TCaption, TCaptionStyle } from "../schema";

export const CaptionLayer: React.FC<{ captions: TCaption[]; style?: TCaptionStyle }> = ({
  captions, style,
}) => {
  const frame = useCurrentFrame();
  const active = findActive(captions, frame);
  if (!active) return null;
  const idx = activeWordIndex(active.words, frame);

  const fontSize = style?.fontSize ?? 48;
  const bottom = style?.bottom ?? 120;
  const color = style?.color || theme.colors.foreground;
  const highlight = style?.highlightColor || theme.colors.accent;
  const fontFamily = resolveFont(style?.fontFamily || theme.fonts.body);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: 0 }}>
      <div style={{
        marginBottom: bottom, maxWidth: "80%", textAlign: "center",
        fontFamily, fontWeight: 800, fontSize, lineHeight: 1.2, color,
        textShadow: "0 4px 16px rgba(0,0,0,0.6)",
      }}>
        {active.words.map((w, i) => (
          <span key={i} style={{
            color: i === idx ? highlight : color,
            transform: i === idx ? "scale(1.08)" : "scale(1)",
            display: "inline-block", marginRight: 12,
          }}>{w.word}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
```

In `remotion/src/Timeline.tsx`, change the `CaptionLayer` usage from `fontSize={captionFontSize} bottom={captionBottom}` to `style={recipe.captionStyle}` (keep the `captionFontSize`/`captionBottom` props on Timeline for back-compat, but they're no longer used by CaptionLayer). Concretely replace the `<CaptionLayer .../>` line with:
```tsx
      <CaptionLayer captions={recipe.captions} style={recipe.captionStyle} />
```
`Main16x9.tsx`/`Vertical9x16.tsx` can keep passing `captionFontSize`/`captionBottom` (unused now) — no change required, but if TypeScript complains about unused props, leave them (they're still declared on Timeline).

- [ ] **Step 4: run to verify pass** — `cd remotion && npx vitest run src/__tests__/fonts.test.ts` → PASS. Then `cd remotion && npx tsc --noEmit` (ou `npm run build` se existir) para checar tipos.

- [ ] **Step 5: commit**
```bash
git add remotion/src/fonts.ts remotion/src/schema.ts remotion/src/components/CaptionLayer.tsx remotion/src/Timeline.tsx remotion/src/__tests__/fonts.test.ts
git commit -m "feat(remotion): caption style from recipe + loaded fonts"
```

---

## Task 4: frontend — controles de estilo + preview

**Files:** Modify `web/src/api.ts`, `web/src/types.ts`, `web/src/components/CaptionOverlay.tsx`, `web/src/steps/TranscriptStep.tsx`. Test: `web/src/__tests__/CaptionOverlay.test.tsx`, `web/src/__tests__/TranscriptStep.test.tsx`.

- [ ] **Step 1: failing test** — add to `web/src/__tests__/TranscriptStep.test.tsx` (mantendo o teste de progresso existente; adicione um novo `it` e o que precisar no mock):

O mock de `../api` precisa expor `putCaptionStyle`, `getJob`. Estenda o `vi.mock` do arquivo para incluir:
```tsx
  getJob: vi.fn(async () => ({ captionStyle: { fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" }, brandKitSlug: "" })),
  putCaptionStyle: vi.fn(async () => {}),
```
e adicione o teste:
```tsx
  it("ajustar o tamanho da legenda chama putCaptionStyle", async () => {
    const api = await import("../api");
    render(<TranscriptStep {...props} />);
    const size = await screen.findByLabelText(/tamanho da legenda/i);
    fireEvent.change(size, { target: { value: "72" } });
    await waitFor(() => expect((api.putCaptionStyle as any)).toHaveBeenCalled());
  });
```

- [ ] **Step 2: run to verify fail** — `cd web && npx vitest run src/__tests__/TranscriptStep.test.tsx` → FAIL.

- [ ] **Step 3: implement**

In `web/src/api.ts` add:
```ts
export async function putCaptionStyle(slug: string, style: any): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/caption-style`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(style),
  }));
}
export async function putBrandKit(slug: string, kitSlug: string): Promise<void> {
  await jsonOrThrow(await fetch(`${BASE}/jobs/${slug}/brand-kit`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: kitSlug }),
  }));
}
```
(`getJob` já existe em api.ts.)

In `web/src/components/CaptionOverlay.tsx`, aceite um `style` opcional e aplique-o (fontSize, cor, destaque, fonte) — hoje ele renderiza sem estilo configurável. Adicione a prop:
```tsx
export const CaptionOverlay: React.FC<{ lines: CaptionLine[]; currentTime: number; style?: { fontSize: number; bottom: number; color: string; highlightColor: string; fontFamily: string } }> = ({ lines, currentTime, style }) => {
```
e no `<p>` do overlay use `fontSize: style?.fontSize`, `color: style?.color || "#fff"`, `marginBottom: style?.bottom`, `fontFamily: style?.fontFamily`, e a palavra ativa com `style?.highlightColor`. Mantenha o teste existente do CaptionOverlay passando (a prop é opcional).

In `web/src/steps/TranscriptStep.tsx`:
- estado do estilo: `const [capStyle, setCapStyle] = useState({ fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" });`
- carregar do job no `useEffect` existente (via `getJob(slug)` → `if (j.captionStyle) setCapStyle(j.captionStyle)`).
- uma função `saveStyle(next)` que faz `setCapStyle(next)` e chama `putCaptionStyle(slug, next)` (debounce simples com `setTimeout`/ref é opcional).
- passar `style={capStyle}` para o `<CaptionOverlay .../>` do preview.
- adicionar controles (abaixo do vídeo/preview, antes da lista de edição):
```tsx
      {lines && (
        <div className="flex flex-wrap gap-4 items-end bg-zinc-900 border border-zinc-800 rounded p-3 text-sm">
          <label className="flex flex-col">Tamanho da legenda
            <input aria-label="tamanho da legenda" type="range" min={24} max={120} value={capStyle.fontSize}
              onChange={(e) => saveStyle({ ...capStyle, fontSize: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col">Posição (do rodapé)
            <input aria-label="posição da legenda" type="range" min={0} max={600} value={capStyle.bottom}
              onChange={(e) => saveStyle({ ...capStyle, bottom: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col">Cor do texto
            <input type="color" value={capStyle.color || "#ffffff"}
              onChange={(e) => saveStyle({ ...capStyle, color: e.target.value })} />
          </label>
          <label className="flex flex-col">Destaque
            <input type="color" value={capStyle.highlightColor || "#22c55e"}
              onChange={(e) => saveStyle({ ...capStyle, highlightColor: e.target.value })} />
          </label>
          <label className="flex flex-col">Fonte
            <select value={capStyle.fontFamily || "Inter"}
              onChange={(e) => saveStyle({ ...capStyle, fontFamily: e.target.value })}
              className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
              {["Inter", "Poppins", "Montserrat", "Roboto"].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        </div>
      )}
```

- [ ] **Step 4: run to verify pass** — `cd web && npx vitest run src/__tests__/TranscriptStep.test.tsx src/__tests__/CaptionOverlay.test.tsx` → PASS. Then `cd web && npm run build`.

- [ ] **Step 5: commit**
```bash
git add web/src/api.ts web/src/components/CaptionOverlay.tsx web/src/steps/TranscriptStep.tsx web/src/__tests__/TranscriptStep.test.tsx
git commit -m "feat(web): caption style controls with live preview"
```

---

## PARTE 2 — Brand kit ligado

## Task 5: brand kit selecionável/criável/editável + defaults do kit

**Files:** Modify `web/src/components/BrandKitModal.tsx`, create `web/src/components/BrandKitPicker.tsx`, modify `web/src/steps/TranscriptStep.tsx`, `web/src/animatedApi.ts` (se faltar `updateBrandKit`), `pipeline/stages.py`. Test: `web/src/__tests__/BrandKitPicker.test.tsx`, `tests/test_recipe.py`.

- [ ] **Step 1: backend — stage_recipe carrega o brand kit.** Failing test em `tests/test_recipe.py`:
```python
def test_stage_recipe_uses_brand_kit(tmp_path, monkeypatch):
    import json as _json
    from pathlib import Path
    from pipeline.job import init_job, write_json
    from pipeline.stages import stage_recipe
    # brand kit no store
    monkeypatch.chdir(tmp_path)
    kit_dir = Path("brand/kits/acme"); kit_dir.mkdir(parents=True)
    (kit_dir / "kit.json").write_text(_json.dumps({
        "version": 1, "slug": "acme", "name": "Acme", "logo": "logo.png",
        "colors": {"bg": "#000", "card": "#111", "border": "#222", "foreground": "#abcdef",
                   "muted": "#333", "accent": "#654321", "accentLight": "#444"},
        "fonts": {"body": "Poppins", "headline": "Inter"},
    }))
    job = init_job(Path("jobs"), "j1")
    job.config.brand_kit_slug = "acme"
    write_json(job.dir / "job.config.json", __import__("dataclasses").asdict(job.config))
    write_json(job.dir / "probe.json", {"width": 1920, "height": 1080, "fps": 30, "duration": 1.0})
    write_json(job.dir / "transcript.json", [{"text": "a", "start": 0.0, "end": 0.5, "words": [{"word": "a", "start": 0.0, "end": 0.5}]}])
    write_json(job.dir / "hook.json", {"title": "T", "subtitle": ""})
    job = init_job(Path("jobs"), "j1")  # recarrega config do disco
    stage_recipe(job)
    recipe = _json.loads((job.dir / "edit-recipe.json").read_text())
    assert recipe["captionStyle"]["color"] == "#abcdef"
    assert recipe["captionStyle"]["fontFamily"] == "Poppins"
```
Run → FAIL (stage_recipe passa `brand=None`).

Implement: em `pipeline/stages.py` `stage_recipe`, antes de `build_recipe`, carregue o kit:
```python
    brand = None
    if job.config.brand_kit_slug:
        from api.brand_kits_store import load_kit
        kit = load_kit(job.config.brand_kit_slug)
        if kit:
            brand = {"colors": kit.colors.model_dump(), "fonts": kit.fonts.model_dump()}
```
e troque `brand=None` por `brand=brand` na chamada. Run → PASS. `.venv/bin/pytest -q`.
Commit:
```bash
git add pipeline/stages.py tests/test_recipe.py
git commit -m "feat(recipe): caption defaults from the selected brand kit"
```

- [ ] **Step 2: frontend — estender BrandKitModal para editar.** Leia `web/src/components/BrandKitModal.tsx` e `web/src/animatedApi.ts`. Adicione uma prop opcional `editing?: BrandKit`; quando presente, pré-preencha os campos com `editing` e, no submit, chame `updateBrandKit(editing.slug, form)` em vez de `createBrandKit(form)`; ajuste `onCreated` para também cobrir edição (renomeie mentalmente para "onSaved"). Garanta que `updateBrandKit` existe em `animatedApi.ts` (o PUT já existe no backend). Não quebre o uso atual no BrandStep animado (a prop é opcional).

- [ ] **Step 3: frontend — BrandKitPicker.** Create `web/src/components/BrandKitPicker.tsx`: lista `listBrandKits()`, mostra os kits como botões selecionáveis (destaque no selecionado), "+ Novo" e "Editar" abrindo o `BrandKitModal` (novo vs `editing`). Props: `{ value: string; onChange: (slug: string) => void }`. Test `web/src/__tests__/BrandKitPicker.test.tsx` (mock de `animatedApi` com 1 kit): renderiza o kit, clicar seleciona (chama `onChange`), "+ Novo" abre o modal.

- [ ] **Step 4: frontend — plugar no TranscriptStep.** Adicione o `BrandKitPicker` na seção "Legendas & Marca", ligado a `brandKitSlug` (carregado via `getJob`); ao trocar, chama `putBrandKit(slug, kit)`. (O estilo continua editável por cima.)

- [ ] **Step 5: verificar** — `cd web && npx vitest run` (tudo verde) e `npm run build`. Commit:
```bash
git add web/src/components/BrandKitModal.tsx web/src/components/BrandKitPicker.tsx web/src/steps/TranscriptStep.tsx web/src/animatedApi.ts web/src/__tests__/BrandKitPicker.test.tsx
git commit -m "feat(web): brand kit picker (select/create/edit) in recorded flow"
```

---

## Task 6: verificação final

- [ ] `.venv/bin/pytest -q` → tudo passa.
- [ ] `cd web && npx vitest run` → tudo passa.
- [ ] `cd remotion && npx vitest run` → tudo passa; `npx tsc --noEmit` sem erros.
- [ ] `cd web && npm run build` → sucesso.
- [ ] Smoke: rebuild + copiar `api/static` + reiniciar uvicorn; num job, no passo Transcrição: escolher/editar brand kit, ajustar tamanho/posição/cor/fonte → preview reflete; renderizar e conferir a legenda queimada com o estilo.
