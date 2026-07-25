# Fase B — Hook como overlay animado (dentro do vídeo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a tela-card preta de hook por um texto animado (slide-up/fade na entrada, fade na saída) sobreposto ao início do próprio vídeo gravado, estabelecendo o motor de overlays reutilizável pelas Fases C e D.

**Architecture:** A matemática de animação de entrada/saída vive num módulo TS puro e sem dependências (`remotion/src/overlay-utils.ts`, fonte única de verdade — §7.8 do spec). `OverlayLayer` passa a renderizar **todos** os overlays ativos, cada um posicionado por `x/y/anchor` e animado por `overlayProgress`. O backend (`build_recipe`) deixa de emitir o segmento `card` e o offset de legendas, e passa a gerar overlay(s) de hook em `overlays[]`. O `zOverlay` do schema vira rico e retrocompatível (todos os campos novos com `.default(...)`), validado em runtime no render por `zEditRecipe.parse` (Root.tsx:10).

**Tech Stack:** Python (FastAPI/pytest), Remotion (React/TS), Vitest, Zod (pinado 4.3.6 — **não atualizar**).

**Riscos herdados do spec §8 (não confundir com regressão desta fase):**
- Testes Remotion pré-quebrados: `remotion/src/animated/__tests__/AnimatedRoot.test.tsx` e erros de tipo `toBeInTheDocument` no modo animado. **Não são desta fase.**
- Zod pinado 4.3.6 — não rodar `npm update`/`npm i zod@…`.
- Fonte fora das 4 suportadas cai para Inter no render (silencioso, intencional). `theme.fonts.heading` = "Instrument Serif" → `resolveFont` → Inter. Overlay de hook cai para Inter a menos que `fontFamily` seja setado. Comportamento aceito.

**Decisões de implementação (aterradas na leitura do código, coerentes com spec §7):**
1. `zOverlay.id` recebe `.default("")` (o spec §1.1 lista `id: z.string()` sem default, mas overlays legados `lowerThird` não têm `id`; como `TEditRecipe` é o tipo de **saída** do zod e o render faz `zEditRecipe.parse`, um `id` obrigatório quebraria a validação retrocompatível. `id` é campo novo → recebe default, coerente com a decisão §7.1 "defaults nos campos novos").
2. `overlay-utils.ts` é **puro** (sem `import "remotion"`), para poder ser importado pelo preview web na Fase C (§7.8) e testado em node sem contexto de render. O `pop` usa um ease de overshoot simples (não o `spring` do Remotion); o hook usa slide-up/fade, então isso não afeta a entrega B.
3. `fontSize` do overlay é aplicado em px direto no render (igual ao `CaptionLayer` atual, que não escala por formato). A convenção "canvas de referência 1920" (§1.3) importa para o preview web da Fase C, não para o render B.
4. `zCardSegment` **permanece** no schema (retrocompat de recipes em disco + mantém `timeline-utils.test.ts` verde). Só paramos de **emitir** e de **renderizar** o card.
5. `hook_card_frames` permanece na assinatura de `build_recipe` com `default 0` (não quebra chamadas), mas `stage_recipe` deixa de passá-lo. `job.config.hook_card_frames` e `update_hook_card_frames` (api) viram config morta e inofensiva — fora do escopo de B removê-los.

---

## File Structure

- `remotion/src/schema.ts` — MODIFICAR: `zOverlayAnim` novo + `zOverlay` rico.
- `remotion/src/__tests__/schema.test.ts` — CRIAR: defaults do `zOverlay` (retrocompat legado + campos ricos).
- `remotion/src/overlay-utils.ts` — CRIAR: `overlayProgress` (puro).
- `remotion/src/__tests__/overlay-utils.test.ts` — CRIAR: bordas de entrada/meio/saída.
- `remotion/src/components/OverlayLayer.tsx` — REESCREVER: renderiza todos os ativos, x/y/anchor, enter/exit via `overlayProgress`.
- `remotion/src/Timeline.tsx` — MODIFICAR: remover branch/import do `HookCard`.
- `remotion/src/components/HookCard.tsx` — REMOVER.
- `remotion/src/sample-recipe.ts` — MODIFICAR: overlay de amostra no formato rico (satisfazer o tipo de saída).
- `pipeline/recipe.py` — MODIFICAR: `build_recipe` sem card, offset 0, gera overlay(s) de hook; remove `lowerThird`.
- `tests/test_recipe.py` — MODIFICAR: reescrever o teste do card; novos asserts de overlay/subtítulo.
- `pipeline/stages.py` — MODIFICAR: `stage_recipe` deixa de passar `hook_card_frames`.
- `web/src/steps/HookStep.tsx` — MODIFICAR: copy ("sobre o início do vídeo") + frame do still 30→20.

---

## Task 1: Schema `zOverlay` rico + `zOverlayAnim`

**Files:**
- Modify: `remotion/src/schema.ts:42-47` (o `zOverlay` atual)
- Test: `remotion/src/__tests__/schema.test.ts` (criar)

- [ ] **Step 1: Write the failing test**

Criar `remotion/src/__tests__/schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { zOverlay } from "../schema";

describe("zOverlay defaults (retrocompat)", () => {
  it("aplica defaults a um overlay legado (só type/text/frames)", () => {
    const o = zOverlay.parse({
      type: "lowerThird",
      text: "x",
      fromFrame: 0,
      durationInFrames: 90,
    });
    expect(o.id).toBe("");
    expect(o.x).toBe(0.5);
    expect(o.y).toBe(0.18);
    expect(o.anchor).toBe("center");
    expect(o.fontSize).toBe(64);
    expect(o.color).toBe("");
    expect(o.enter).toBe("slide-up");
    expect(o.exit).toBe("fade");
    expect(o.enterDurationInFrames).toBe(12);
    expect(o.exitDurationInFrames).toBe(12);
  });

  it("preserva campos ricos fornecidos", () => {
    const o = zOverlay.parse({
      id: "ov_hook",
      type: "hook",
      text: "T",
      fromFrame: 0,
      durationInFrames: 90,
      x: 0.5,
      y: 0.16,
      fontSize: 84,
      enter: "pop",
      exit: "none",
    });
    expect(o.id).toBe("ov_hook");
    expect(o.type).toBe("hook");
    expect(o.fontSize).toBe(84);
    expect(o.enter).toBe("pop");
    expect(o.exit).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd remotion && npx vitest run src/__tests__/schema.test.ts`
Expected: FAIL — hoje `zOverlay.parse({type:"lowerThird",...})` não tem `id`/`x`/`enter`, então `o.x` é `undefined` e o assert falha.

- [ ] **Step 3: Write minimal implementation**

Em `remotion/src/schema.ts`, substituir o bloco atual (linhas 42-47):

```ts
export const zOverlay = z.object({
  type: z.string(),
  fromFrame: z.number(),
  durationInFrames: z.number(),
  text: z.string(),
});
```

por:

```ts
export const zOverlayAnim = z.enum(["fade", "slide-up", "slide-down", "pop", "none"]);

export const zOverlay = z.object({
  id: z.string().default(""), // estável p/ edição/react keys; "" só em overlays legados
  type: z.string().default("text"), // "text" | "hook" | "lowerThird" (legado)
  text: z.string(),
  fromFrame: z.number(),
  durationInFrames: z.number(),
  x: z.number().default(0.5),
  y: z.number().default(0.18),
  anchor: z.enum(["center", "left", "right"]).default("center"),
  fontSize: z.number().default(64),
  color: z.string().default(""), // "" => usa theme.colors.foreground
  highlightColor: z.string().default(""),
  fontFamily: z.string().default(""), // "" => usa theme.fonts.heading
  enter: zOverlayAnim.default("slide-up"),
  exit: zOverlayAnim.default("fade"),
  enterDurationInFrames: z.number().default(12),
  exitDurationInFrames: z.number().default(12),
});
```

`TOverlay` (linha 76 `export type TOverlay = z.infer<typeof zOverlay>;`) continua válido — nenhuma mudança nessa linha.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd remotion && npx vitest run src/__tests__/schema.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add remotion/src/schema.ts remotion/src/__tests__/schema.test.ts
git commit -m "feat(overlay): rich zOverlay schema with anim fields (Fase B)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `overlay-utils.ts` — `overlayProgress` (motor de animação, puro/TDD)

**Files:**
- Create: `remotion/src/overlay-utils.ts`
- Test: `remotion/src/__tests__/overlay-utils.test.ts`

- [ ] **Step 1: Write the failing test**

Criar `remotion/src/__tests__/overlay-utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { overlayProgress, type OverlayTiming } from "../overlay-utils";

const base: OverlayTiming = {
  fromFrame: 0,
  durationInFrames: 90,
  enter: "slide-up",
  exit: "fade",
  enterDurationInFrames: 12,
  exitDurationInFrames: 12,
};

describe("overlayProgress", () => {
  it("no frame de entrada (local=0) começa invisível", () => {
    const p = overlayProgress(0, base);
    expect(p.opacity).toBe(0);
    expect(p.translateY).toBeCloseTo(40, 5); // slide-up parte de +40px
  });

  it("no meio está totalmente visível e sem deslocamento", () => {
    const p = overlayProgress(45, base);
    expect(p.opacity).toBe(1);
    expect(p.translateY).toBeCloseTo(0, 5);
    expect(p.scale).toBeCloseTo(1, 5);
  });

  it("nos últimos frames faz fade-out", () => {
    const near = overlayProgress(89, base); // 1 frame antes do fim
    expect(near.opacity).toBeGreaterThan(0);
    expect(near.opacity).toBeLessThan(0.2);
    const end = overlayProgress(90, base); // fim exato
    expect(end.opacity).toBe(0);
  });

  it("respeita enter/exit 'none' (hard cut, sempre visível no range)", () => {
    const p = overlayProgress(0, { ...base, enter: "none", exit: "none" });
    expect(p.opacity).toBe(1);
    expect(p.translateY).toBe(0);
  });

  it("slide-down entra de cima (translateY negativo no início)", () => {
    const p = overlayProgress(0, { ...base, enter: "slide-down" });
    expect(p.translateY).toBeCloseTo(-40, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd remotion && npx vitest run src/__tests__/overlay-utils.test.ts`
Expected: FAIL — módulo `../overlay-utils` não existe ("Failed to resolve import").

- [ ] **Step 3: Write minimal implementation**

Criar `remotion/src/overlay-utils.ts`:

```ts
export type OverlayAnim = "fade" | "slide-up" | "slide-down" | "pop" | "none";

export interface OverlayTiming {
  fromFrame: number;
  durationInFrames: number;
  enter: OverlayAnim;
  exit: OverlayAnim;
  enterDurationInFrames: number;
  exitDurationInFrames: number;
}

export interface OverlayTransform {
  opacity: number;
  translateY: number;
  scale: number;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// Fonte única de verdade da animação de overlay (Remotion + preview web da Fase C).
// Puro de propósito: sem import "remotion", para rodar em node e no bundle web.
export function overlayProgress(frame: number, o: OverlayTiming): OverlayTransform {
  const local = frame - o.fromFrame;
  const dur = o.durationInFrames;

  // entrada: 0 -> 1 nos primeiros enterDurationInFrames frames
  const enterP =
    o.enterDurationInFrames > 0 ? clamp01(local / o.enterDurationInFrames) : 1;
  // saída: 1 -> 0 nos últimos exitDurationInFrames frames
  const exitP =
    o.exitDurationInFrames > 0 ? clamp01((dur - local) / o.exitDurationInFrames) : 1;

  let opacity = 1;
  let translateY = 0;
  let scale = 1;

  // ENTRADA
  switch (o.enter) {
    case "fade":
      opacity = Math.min(opacity, enterP);
      break;
    case "slide-up":
      opacity = Math.min(opacity, enterP);
      translateY += (1 - enterP) * 40;
      break;
    case "slide-down":
      opacity = Math.min(opacity, enterP);
      translateY += (1 - enterP) * -40;
      break;
    case "pop": {
      opacity = Math.min(opacity, enterP);
      const eased = 1 - Math.pow(1 - enterP, 3); // ease-out cúbico
      scale = 0.7 + eased * 0.3;
      break;
    }
    case "none":
    default:
      break;
  }

  // SAÍDA
  switch (o.exit) {
    case "fade":
      opacity = Math.min(opacity, exitP);
      break;
    case "slide-up":
      opacity = Math.min(opacity, exitP);
      translateY += (1 - exitP) * -40;
      break;
    case "slide-down":
      opacity = Math.min(opacity, exitP);
      translateY += (1 - exitP) * 40;
      break;
    case "pop":
      opacity = Math.min(opacity, exitP);
      scale = Math.min(scale, 0.7 + exitP * 0.3);
      break;
    case "none":
    default:
      break;
  }

  return { opacity, translateY, scale };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd remotion && npx vitest run src/__tests__/overlay-utils.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add remotion/src/overlay-utils.ts remotion/src/__tests__/overlay-utils.test.ts
git commit -m "feat(overlay): overlayProgress animation engine (pure, shared) (Fase B)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Reescrever `OverlayLayer.tsx` (render de todos os overlays)

**Files:**
- Modify (rewrite): `remotion/src/components/OverlayLayer.tsx`

Nota: componente de render; a matemática já é coberta por `overlay-utils.test.ts`. Verificação aqui é por typecheck/build; a prova visual é a Task 8 (`/still`).

- [ ] **Step 1: Rewrite the component**

Substituir todo o conteúdo de `remotion/src/components/OverlayLayer.tsx` por:

```tsx
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { resolveFont } from "../fonts";
import { overlayProgress } from "../overlay-utils";
import type { TOverlay } from "../schema";

export const OverlayLayer: React.FC<{ overlays: TOverlay[] }> = ({ overlays }) => {
  const frame = useCurrentFrame();
  const active = overlays.filter(
    (o) => frame >= o.fromFrame && frame < o.fromFrame + o.durationInFrames
  );
  if (active.length === 0) return null;

  return (
    <AbsoluteFill>
      {active.map((ov, i) => {
        const { opacity, translateY, scale } = overlayProgress(frame, ov);
        const color = ov.color || theme.colors.foreground;
        const fontFamily = resolveFont(ov.fontFamily || theme.fonts.heading);
        const anchorTx =
          ov.anchor === "left"
            ? "translate(0, -50%)"
            : ov.anchor === "right"
              ? "translate(-100%, -50%)"
              : "translate(-50%, -50%)";
        const textAlign: "left" | "right" | "center" =
          ov.anchor === "left" ? "left" : ov.anchor === "right" ? "right" : "center";
        return (
          <div
            key={ov.id || i}
            style={{
              position: "absolute",
              left: `${ov.x * 100}%`,
              top: `${ov.y * 100}%`,
              transform: `${anchorTx} translateY(${translateY}px) scale(${scale})`,
              opacity,
              color,
              fontFamily,
              fontWeight: 800,
              fontSize: ov.fontSize,
              lineHeight: 1.15,
              textAlign,
              maxWidth: "80%",
              whiteSpace: "pre-wrap",
              textShadow: "0 4px 24px rgba(0,0,0,0.7)",
            }}
          >
            {ov.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
```

Isto remove o uso de `findActive` (que devolvia só um) e do bloco fixo `lowerThird` no canto.

- [ ] **Step 2: Verify the whole remotion suite still parses/passes**

Run: `cd remotion && npx vitest run`
Expected: PASS para `schema.test.ts`, `overlay-utils.test.ts`, `timeline-utils.test.ts`, `fonts.test.ts`. Os testes `animated/__tests__/AnimatedRoot.test.tsx` e erros de tipo `toBeInTheDocument` **já falhavam antes** (spec §8) — confirmar que a lista de falhas é a mesma de antes desta fase e não inclui nada de `OverlayLayer`/`overlay-utils`/`schema`.

- [ ] **Step 3: Commit**

```bash
git add remotion/src/components/OverlayLayer.tsx
git commit -m "feat(overlay): OverlayLayer renders all active overlays with enter/exit (Fase B)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Remover o card do Timeline e o `HookCard`; ajustar `sample-recipe`

**Files:**
- Modify: `remotion/src/Timeline.tsx` (linhas 4 e 24-26)
- Delete: `remotion/src/components/HookCard.tsx`
- Modify: `remotion/src/sample-recipe.ts:21` (overlay de amostra)

- [ ] **Step 1: Update `Timeline.tsx`**

Remover a linha 4 `import { HookCard } from "./components/HookCard";`.

Substituir o bloco de render do segmento (linhas 24-32) — hoje:

```tsx
            {seg.type === "card" ? (
              <HookCard title={seg.title} subtitle={seg.subtitle} />
            ) : seg.type === "clip" ? (
              <SourceClip
                seg={seg}
                sourceWidth={recipe.source.width}
                sourceHeight={recipe.source.height}
              />
            ) : null /* scene: v2 */}
```

por (sem o branch de `card`; `card` legado renderiza `null`):

```tsx
            {seg.type === "clip" ? (
              <SourceClip
                seg={seg}
                sourceWidth={recipe.source.width}
                sourceHeight={recipe.source.height}
              />
            ) : null /* card removido (Fase B); scene: v2 */}
```

- [ ] **Step 2: Delete `HookCard.tsx`**

```bash
git rm remotion/src/components/HookCard.tsx
```

- [ ] **Step 3: Update `sample-recipe.ts` overlay to rich format**

Em `remotion/src/sample-recipe.ts`, substituir a linha 21:

```ts
  overlays: [{ type: "lowerThird", fromFrame: 0, durationInFrames: 90, text: "O segredo" }],
```

por:

```ts
  overlays: [
    {
      id: "ov_sample",
      type: "hook",
      text: "O segredo",
      fromFrame: 0,
      durationInFrames: 90,
      x: 0.5,
      y: 0.16,
      anchor: "center",
      fontSize: 84,
      color: "",
      highlightColor: "",
      fontFamily: "",
      enter: "slide-up",
      exit: "fade",
      enterDurationInFrames: 12,
      exitDurationInFrames: 12,
    },
  ],
```

(O `sampleRecipe` mantém o segmento `card` — ele exercita a retrocompat de `zCardSegment`, que continua no schema.)

- [ ] **Step 4: Verify remotion suite + no dangling HookCard refs**

Run: `cd remotion && grep -rn "HookCard" src/ ; npx vitest run`
Expected: `grep` sem resultados; suíte no mesmo estado da Task 3 (só as falhas pré-existentes de `animated/`).

- [ ] **Step 5: Commit**

```bash
git add remotion/src/Timeline.tsx remotion/src/sample-recipe.ts
git commit -m "refactor(remotion): remove hook card segment + HookCard; sample uses rich overlay (Fase B)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `build_recipe` — sem card, offset 0, overlay(s) de hook (TDD)

**Files:**
- Modify: `pipeline/recipe.py` (assinatura linha 39; caption offset 56-61; return 87-121)
- Test: `tests/test_recipe.py` (reescrever `test_build_recipe_offsets_captions_by_hook_card`; adicionar 2 testes)

- [ ] **Step 1: Rewrite the failing test + add subtitle tests**

Em `tests/test_recipe.py`, **substituir** `test_build_recipe_offsets_captions_by_hook_card` (linhas 33-56) por:

```python
def test_build_recipe_hook_overlay_and_no_card():
    words = [_w("ola", 0.0, 0.5), _w("pessoal", 0.5, 1.0)]
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=2.0,
        words=words,
        hook={"title": "O segredo", "subtitle": "em 60s", "duration_frames": 90},
        max_chars=99, max_gap=5.0,
    )
    assert recipe["fps"] == 30
    assert recipe["source"]["trimmedFrames"] == 60
    # sem card: apenas um segmento clip
    assert all(s["type"] != "card" for s in recipe["segments"])
    assert len(recipe["segments"]) == 1
    assert recipe["segments"][0]["type"] == "clip"
    assert recipe["segments"][0]["inFrame"] == 0
    assert recipe["segments"][0]["outFrame"] == 60
    # legendas SEM offset de card: 0s -> frame 0
    assert recipe["captions"][0]["fromFrame"] == 0
    assert recipe["captions"][0]["text"] == "ola pessoal"
    # overlay de hook
    hook_ov = recipe["overlays"][0]
    assert hook_ov["type"] == "hook"
    assert hook_ov["text"] == "O segredo"
    assert hook_ov["fromFrame"] == 0
    assert hook_ov["durationInFrames"] == 90
    assert hook_ov["id"] == "ov_hook"
    # subtítulo preenchido -> segundo overlay
    subs = [o for o in recipe["overlays"][1:] if o["text"] == "em 60s"]
    assert len(subs) == 1
    assert subs[0]["type"] == "text"
    assert recipe["formats"]["vertical9x16"]["width"] == 1080


def test_build_recipe_no_subtitle_overlay_when_empty():
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "T", "subtitle": "", "duration_frames": 60},
        max_chars=99, max_gap=5.0,
    )
    assert len(recipe["overlays"]) == 1
    assert recipe["overlays"][0]["type"] == "hook"
    assert recipe["overlays"][0]["durationInFrames"] == 60


def test_build_recipe_no_lowerthird():
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "T", "subtitle": "s", "duration_frames": 60},
        max_chars=99, max_gap=5.0,
    )
    assert all(o["type"] != "lowerThird" for o in recipe["overlays"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude" && python -m pytest tests/test_recipe.py -k "hook_overlay or no_subtitle or no_lowerthird" -v`
Expected: FAIL — hoje `segments[0]` é `card`, `overlays[0]` é `lowerThird`, e `captions[0].fromFrame` teria offset. (`test_build_recipe_hook_overlay_and_no_card` não passa `hook_card_frames` → hoje falha por argumento obrigatório ausente, o que também confirma a necessidade do default 0 no Step 3.)

- [ ] **Step 3: Update `build_recipe`**

Em `pipeline/recipe.py`:

(a) Assinatura — mudar a linha 39 de `hook_card_frames: int,` para:

```python
    hook_card_frames: int = 0,
```

(As linhas 56-61 que somam `+ hook_card_frames` podem ficar: com default 0 e `stage_recipe` passando 0, o offset é nulo. Mantê-las preserva o parâmetro sem efeito no produto.)

(b) Antes do `return` (após o bloco `resolved_caption_style`, ~linha 85), inserir a geração dos overlays de hook:

```python
    duration_frames = hook.get("duration_frames", 90)
    hook_overlays = [
        {
            "id": "ov_hook",
            "type": "hook",
            "text": hook["title"],
            "fromFrame": 0,
            "durationInFrames": duration_frames,
            "x": 0.5, "y": 0.16, "anchor": "center",
            "fontSize": 84, "color": "", "highlightColor": "", "fontFamily": "",
            "enter": "slide-up", "exit": "fade",
            "enterDurationInFrames": 12, "exitDurationInFrames": 12,
        }
    ]
    subtitle = hook.get("subtitle", "")
    if subtitle:
        hook_overlays.append(
            {
                "id": "ov_hook_sub",
                "type": "text",
                "text": subtitle,
                "fromFrame": 6,
                "durationInFrames": max(1, duration_frames - 6),
                "x": 0.5, "y": 0.24, "anchor": "center",
                "fontSize": 40, "color": "", "highlightColor": "", "fontFamily": "",
                "enter": "slide-up", "exit": "fade",
                "enterDurationInFrames": 12, "exitDurationInFrames": 12,
            }
        )
```

(c) No `return` (linhas 87-121), trocar o `segments` para conter só o `clip` e o `overlays` para os de hook:

```python
        "segments": [
            {
                "type": "clip",
                "source": "trimmed.mp4",
                "inFrame": 0,
                "outFrame": trimmed_frames,
                "reframe": {"focusX": 0.5},
            },
        ],
        "captions": captions,
        "captionStyle": resolved_caption_style,
        "overlays": hook_overlays,
```

(remover o dict `{"type": "card", ...}` de `segments` e o dict `{"type": "lowerThird", ...}` de `overlays`.)

- [ ] **Step 4: Run the new tests + full recipe suite**

Run: `cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude" && python -m pytest tests/test_recipe.py -v`
Expected: PASS — os 3 novos testes + os pré-existentes (`test_build_recipe_injects_caption_style_defaults`, `_bottom_zero_is_preserved`, `_caption_style_overrides_brand`, `test_stage_recipe_uses_brand_kit`) continuam verdes (eles não asseguram card; passam `hook_card_frames=0` ou nada).

- [ ] **Step 5: Commit**

```bash
git add pipeline/recipe.py tests/test_recipe.py
git commit -m "feat(recipe): hook as animated overlay, drop card segment + caption offset (Fase B)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `stage_recipe` deixa de passar `hook_card_frames`

**Files:**
- Modify: `pipeline/stages.py:89`

- [ ] **Step 1: Update the call**

Em `pipeline/stages.py`, na chamada `build_recipe(...)` dentro de `stage_recipe` (linha 89), remover o argumento `hook_card_frames=job.config.hook_card_frames,`. A linha:

```python
        hook=hook, hook_card_frames=job.config.hook_card_frames,
```

passa a ser:

```python
        hook=hook,
```

(`build_recipe` usa o default 0 → nenhum offset de card.)

- [ ] **Step 2: Run the pipeline-level test**

Run: `cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude" && python -m pytest tests/test_recipe.py::test_stage_recipe_uses_brand_kit -v`
Expected: PASS — `stage_recipe` gera recipe sem card, com overlay de hook, mantendo o brand kit no `captionStyle`.

- [ ] **Step 3: Run the full backend suite (recipe + api) para pegar fallout**

Run: `cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude" && python -m pytest tests/ api/tests/ -q`
Expected: PASS. Se `api/tests/test_routes.py::test_recipe_after_cut_transcript_hook` fizer algum assert sobre `segments`/`overlays` que assuma card, atualizar para o novo contrato (não há assert de card hoje — confirmado por grep; este passo é a rede de segurança).

- [ ] **Step 4: Commit**

```bash
git add pipeline/stages.py
git commit -m "feat(recipe): stage_recipe stops offsetting by hook_card_frames (Fase B)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `HookStep.tsx` — copy e frame da prévia

**Files:**
- Modify: `web/src/steps/HookStep.tsx` (label linha 46; still linha 55; texto de ajuda linha 53)

- [ ] **Step 1: Update copy + still frame**

Em `web/src/steps/HookStep.tsx`:

(a) Trocar o label da linha 46 de `Duração do card (frames)` para `Duração do texto (frames)`.

(b) Trocar o texto de ajuda da prévia (linha 53) de:

```tsx
        <p className="text-sm text-zinc-400 mb-2">Prévia (atualiza ~1s após parar de digitar):</p>
```

para:

```tsx
        <p className="text-sm text-zinc-400 mb-2">O texto aparece animado sobre o início do vídeo. Prévia (atualiza ~1s após parar de digitar):</p>
```

(c) Trocar o frame do still (linha 55) de `stillUrl(slug, 30, "main16x9")` para `stillUrl(slug, 20, "main16x9")` (frame onde o overlay já entrou e o vídeo está por baixo).

- [ ] **Step 2: Build the web bundle to typecheck**

Run: `cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude/web" && npm run build 2>&1 | tail -5`
Expected: build OK (sem erros de tipo). `HookStep.tsx` não importa nada do remotion, então a mudança de schema não o afeta.

- [ ] **Step 3: Run web tests (garantir que nada quebrou)**

Run: `cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude/web" && npx vitest run 2>&1 | tail -5`
Expected: PASS (nenhum teste web cobre esse copy; confirmar verde no baseline).

- [ ] **Step 4: Commit**

```bash
git add web/src/steps/HookStep.tsx
git commit -m "feat(web): hook step copy 'texto sobre o vídeo' + preview frame 20 (Fase B)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Verificação e entregável B (build + render real + prova por `/still`)

**Files:** nenhum (verificação). Executar inline (não subagent).

- [ ] **Step 1: Suítes completas verdes (baseline confirmado)**

Run:
```bash
cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude"
python -m pytest tests/ api/tests/ -q
cd remotion && npx vitest run 2>&1 | tail -15
```
Expected: Python 100% verde. Remotion: só as falhas pré-existentes de `animated/__tests__/AnimatedRoot.test.tsx` e tipos `toBeInTheDocument` (spec §8) — **nada** de `overlay-utils`/`schema`/`OverlayLayer`/`timeline-utils`/`fonts`. Registrar a lista de falhas e confirmar que bate com o baseline anterior à fase.

- [ ] **Step 2: Build web → api/static e push (comando de build do projeto)**

Run (comando de build registrado na memória do projeto):
```bash
cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude" && lsof -ti :8000 | xargs kill 2>/dev/null; sleep 1 && (cd web && npm run build 2>&1 | tail -1) && rm -rf api/static && mkdir -p api/static && cp -r web/dist/. api/static/ && echo "static: $(ls api/static/assets/*.js | xargs -n1 basename)" && git push origin main 2>&1 | tail -2
```
Expected: build OK, `api/static` atualizado, push para `main` sem erro.

- [ ] **Step 3: Subir o servidor com `.env` e escolher um job real com `trimmed.mp4` + `hook.json`**

```bash
cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude" && set -a && . ./.env 2>/dev/null; set +a && (uvicorn api.main:app --host 0.0.0.0 --port 8000 &) && sleep 2 && curl -s localhost:8000/jobs | python -m json.tool | head -40
```
Escolher um `slug` que já tenha passado por cut+transcribe+hook (has_transcript + has_hook). Se nenhum existir, criar um rapidamente pelo fluxo web/endpoints (ingest→cut→transcribe→hook) — mas o esperado é reusar um job existente.

- [ ] **Step 4: Rodar a recipe e provar por `/still` (2-3 frames) que o texto aparece e some sobre o vídeo**

```bash
SLUG=<slug-escolhido>
cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude"
curl -s -X POST localhost:8000/jobs/$SLUG/recipe | head -c 300; echo
# frame 5: overlay entrando (opacity baixa, slide) sobre o VÍDEO (não card preto)
curl -s "localhost:8000/jobs/$SLUG/still?frame=5&format=main16x9"  --output scratchpad/b-f5.png
# frame 20: overlay totalmente visível sobre o vídeo
curl -s "localhost:8000/jobs/$SLUG/still?frame=20&format=main16x9" --output scratchpad/b-f20.png
# frame ~85: overlay em fade-out; frame 120: vídeo sem overlay
curl -s "localhost:8000/jobs/$SLUG/still?frame=85&format=main16x9"  --output scratchpad/b-f85.png
curl -s "localhost:8000/jobs/$SLUG/still?frame=120&format=main16x9" --output scratchpad/b-f120.png
```
(Substituir `scratchpad/` pelo diretório de scratchpad da sessão.)

- [ ] **Step 5: Inspecionar os PNGs (Read tool) e confirmar visualmente**

Ler `b-f5.png`, `b-f20.png`, `b-f85.png`, `b-f120.png` e verificar:
1. Em **todos**, o **vídeo** aparece por baixo desde o frame 0 (não há mais tela-card preta antes do vídeo).
2. `b-f20.png`: o texto do hook está visível e nítido sobre o vídeo.
3. `b-f5.png` vs `b-f20.png`: o texto entra (menos opaco / deslocado no 5, cheio no 20).
4. `b-f120.png`: sem overlay de hook (já sumiu por fade), só o vídeo.

Se qualquer item falhar (ex.: tela preta no início, texto não some), **parar e depurar** com `superpowers:systematic-debugging` antes de declarar a fase concluída.

- [ ] **Step 6: Registrar a prova e concluir**

Reportar ao usuário os 4 frames como evidência (via `superpowers:verification-before-completion`): descrever o que cada frame mostra, confirmar "sem tela preta / texto aparece e some". Deixar o servidor rodando na :8000.

---

## Self-Review (checklist do autor do plano)

**Cobertura do spec (§2 Fase B):**
- §2.1 remover card + offset 0 → Tasks 5, 6. ✓
- §2.1 gerar overlay de hook + subtítulo como 2º overlay → Task 5. ✓
- §2.1 remover lowerThird → Task 5 (`test_build_recipe_no_lowerthird`). ✓
- §2.2 Timeline sem card + HookCard removido → Task 4. ✓
- §2.2 OverlayLayer reescrito → Task 3. ✓
- §1.1 zOverlay rico + zOverlayAnim → Task 1. ✓
- §1.2/§7.8 overlay-utils com overlayProgress (bordas) → Task 2. ✓
- §2.3 HookStep copy + frame de prévia → Task 7. ✓
- §2.4 testes: card reescrito, overlay asserts, subtítulo vazio/preenchido, overlayProgress bordas → Tasks 1,2,5. ✓
- §2.5 entregável: render real + `/still` 2-3 frames → Task 8. ✓

**Consistência de tipos/nomes:** `overlayProgress`/`OverlayTiming`/`OverlayTransform` idênticos em Task 2 (def), Task 3 (uso). Campos do overlay (`id,type,text,fromFrame,durationInFrames,x,y,anchor,fontSize,color,highlightColor,fontFamily,enter,exit,enterDurationInFrames,exitDurationInFrames`) idênticos entre schema (Task 1), backend (Task 5), sample (Task 4). ✓

**Sem placeholders:** todos os passos de código mostram o código real. ✓
