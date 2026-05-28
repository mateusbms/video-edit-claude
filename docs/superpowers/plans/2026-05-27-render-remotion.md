# Render Remotion (16:9 + 9:16) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consumir o `edit-recipe.json` + `trimmed.mp4` (saídas do Plano 1) e renderizar dois vídeos: **Main16x9** e **Vertical9x16**, com card de abertura/hook, legendas animadas palavra-a-palavra e overlays — usando a marca do usuário.

**Architecture:** Projeto Remotion 4.x. Uma `Timeline` renderiza os segmentos polimórficos (`card`+`clip`; `scene` reservado para v2) em sequência, com camadas de legenda e overlay por cima, posicionadas por frame global. Dimensões/fps/duração são calculadas dinamicamente da recipe via `calculateMetadata`. Os helpers de tempo (duração total, item ativo por frame, palavra ativa) são funções puras cobertas por testes (vitest); os componentes visuais são verificados via `remotion still` e o render final via `ffprobe`.

**Tech Stack:** Remotion 4.x, React 19, TypeScript, zod, @remotion/google-fonts, vitest. Pré-requisito: `node` instalado (`brew install node`).

**Pré-requisitos (do Plano 1):** existe um job em `jobs/<slug>/` com `edit-recipe.json` e `trimmed.mp4`. Existe `brand/brand.json`.

---

## File Structure

- `remotion/package.json`, `remotion/tsconfig.json`, `remotion/remotion.config.ts`
- `remotion/src/index.ts` — `registerRoot`.
- `remotion/src/Root.tsx` — registra `Main16x9` e `Vertical9x16` com `calculateMetadata`.
- `remotion/src/schema.ts` — zod: `EditRecipe` e tipos derivados.
- `remotion/src/timeline-utils.ts` — helpers puros (testados): `segmentDuration`, `totalDuration`, `findActive`, `activeWordIndex`.
- `remotion/src/theme.ts` — tokens da marca (lê `src/brand.json`).
- `remotion/src/Timeline.tsx` — orquestra segmentos + camadas.
- `remotion/src/components/HookCard.tsx`, `SourceClip.tsx`, `CaptionLayer.tsx`, `OverlayLayer.tsx`.
- `remotion/src/Main16x9.tsx`, `remotion/src/Vertical9x16.tsx`.
- `remotion/src/__tests__/timeline-utils.test.ts`.
- `brand/brand.json` — identidade do usuário.
- `scripts/edit-video.sh` — orquestrador (copia artefatos + render por estágio).

---

## Task 1: Instalar Node e marca padrão

**Files:**
- Create: `brand/brand.json`

- [ ] **Step 1: Instalar Node**

Run: `brew install node`
Expected: `node --version` e `npm --version` funcionam.

- [ ] **Step 2: Criar `brand/brand.json` (placeholder a ser substituído pela marca real do usuário)**

```json
{
  "logo": "logo.png",
  "handle": "@suamarca",
  "colors": {
    "bg": "#0e0e10",
    "card": "#1a1a1e",
    "foreground": "#ffffff",
    "muted": "#a1a1aa",
    "accent": "#22c55e"
  },
  "fonts": {
    "heading": "Instrument Serif",
    "body": "Inter"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add brand/brand.json
git commit -m "chore: brand.json padrão (substituir pela marca do usuário)"
```

---

## Task 2: Scaffold do projeto Remotion

**Files:**
- Create: `remotion/package.json`, `remotion/tsconfig.json`, `remotion/remotion.config.ts`, `remotion/src/index.ts`

- [ ] **Step 1: `remotion/package.json`**

```json
{
  "name": "video-edit-remotion",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "remotion studio",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Instalar dependências (versões mais recentes)**

Run:
```bash
cd remotion
npm install remotion @remotion/cli @remotion/google-fonts react react-dom zod
npm install -D typescript vitest @types/react @types/react-dom
```
Expected: instala sem erro; cria `node_modules` e atualiza `package.json`.

- [ ] **Step 3: `remotion/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "lib": ["ESNext", "DOM"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: `remotion/remotion.config.ts`**

```ts
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
```

- [ ] **Step 5: `remotion/src/index.ts`**

```ts
import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);
```

- [ ] **Step 6: Commit**

```bash
cd ..
git add remotion/package.json remotion/package-lock.json remotion/tsconfig.json remotion/remotion.config.ts remotion/src/index.ts
git commit -m "chore: scaffold do projeto Remotion"
```

---

## Task 3: Schema (zod) da recipe

**Files:**
- Create: `remotion/src/schema.ts`

- [ ] **Step 1: Implementar o schema**

`remotion/src/schema.ts`:
```ts
import { z } from "zod";

export const zWord = z.object({
  word: z.string(),
  fromFrame: z.number(),
  durationInFrames: z.number(),
});

export const zCaption = z.object({
  fromFrame: z.number(),
  durationInFrames: z.number(),
  text: z.string(),
  words: z.array(zWord),
});

export const zClipSegment = z.object({
  type: z.literal("clip"),
  source: z.string(),
  inFrame: z.number(),
  outFrame: z.number(),
  reframe: z.object({ focusX: z.number() }),
});

export const zCardSegment = z.object({
  type: z.literal("card"),
  durationInFrames: z.number(),
  title: z.string(),
  subtitle: z.string(),
});

// v2: cena 100% animada — reservada, aceita campos extras
export const zSceneSegment = z
  .object({ type: z.literal("scene"), durationInFrames: z.number() })
  .passthrough();

export const zSegment = z.discriminatedUnion("type", [
  zClipSegment,
  zCardSegment,
  zSceneSegment,
]);

export const zOverlay = z.object({
  type: z.string(),
  fromFrame: z.number(),
  durationInFrames: z.number(),
  text: z.string(),
});

export const zFormat = z.object({ width: z.number(), height: z.number() });

export const zEditRecipe = z.object({
  fps: z.number(),
  source: z.object({
    width: z.number(),
    height: z.number(),
    trimmedFrames: z.number(),
  }),
  segments: z.array(zSegment),
  captions: z.array(zCaption),
  overlays: z.array(zOverlay),
  formats: z.object({ main16x9: zFormat, vertical9x16: zFormat }),
});

export type TEditRecipe = z.infer<typeof zEditRecipe>;
export type TSegment = z.infer<typeof zSegment>;
export type TCaption = z.infer<typeof zCaption>;
export type TOverlay = z.infer<typeof zOverlay>;
```

- [ ] **Step 2: Commit**

```bash
git add remotion/src/schema.ts
git commit -m "feat: schema zod do edit-recipe (segmentos polimórficos)"
```

---

## Task 4: Helpers de tempo (TDD com vitest)

**Files:**
- Create: `remotion/src/timeline-utils.ts`, `remotion/src/__tests__/timeline-utils.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`remotion/src/__tests__/timeline-utils.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  segmentDuration,
  totalDuration,
  findActive,
  activeWordIndex,
} from "../timeline-utils";

describe("segmentDuration", () => {
  it("usa outFrame-inFrame para clip", () => {
    expect(segmentDuration({ type: "clip", inFrame: 0, outFrame: 60, source: "x", reframe: { focusX: 0.5 } })).toBe(60);
  });
  it("usa durationInFrames para card", () => {
    expect(segmentDuration({ type: "card", durationInFrames: 90, title: "t", subtitle: "s" })).toBe(90);
  });
});

describe("totalDuration", () => {
  it("soma todos os segmentos", () => {
    expect(
      totalDuration([
        { type: "card", durationInFrames: 90, title: "t", subtitle: "s" },
        { type: "clip", inFrame: 0, outFrame: 60, source: "x", reframe: { focusX: 0.5 } },
      ])
    ).toBe(150);
  });
});

describe("findActive", () => {
  const items = [
    { fromFrame: 0, durationInFrames: 10 },
    { fromFrame: 10, durationInFrames: 10 },
  ];
  it("acha o item cujo intervalo contém o frame", () => {
    expect(findActive(items, 5)).toBe(items[0]);
    expect(findActive(items, 10)).toBe(items[1]);
  });
  it("retorna null fora de qualquer intervalo", () => {
    expect(findActive(items, 25)).toBeNull();
  });
});

describe("activeWordIndex", () => {
  const words = [
    { word: "a", fromFrame: 0, durationInFrames: 5 },
    { word: "b", fromFrame: 5, durationInFrames: 5 },
  ];
  it("retorna o índice da palavra ativa", () => {
    expect(activeWordIndex(words, 3)).toBe(0);
    expect(activeWordIndex(words, 7)).toBe(1);
  });
  it("retorna -1 antes da primeira palavra", () => {
    expect(activeWordIndex(words, -1)).toBe(-1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd remotion && npx vitest run`
Expected: FAIL — `../timeline-utils` não existe.

- [ ] **Step 3: Implementar timeline-utils.ts**

`remotion/src/timeline-utils.ts`:
```ts
import type { TSegment } from "./schema";

export function segmentDuration(seg: TSegment): number {
  if (seg.type === "clip") return seg.outFrame - seg.inFrame;
  return seg.durationInFrames;
}

export function totalDuration(segments: TSegment[]): number {
  return segments.reduce((acc, s) => acc + segmentDuration(s), 0);
}

type Timed = { fromFrame: number; durationInFrames: number };

export function findActive<T extends Timed>(items: T[], frame: number): T | null {
  for (const item of items) {
    if (frame >= item.fromFrame && frame < item.fromFrame + item.durationInFrames) {
      return item;
    }
  }
  return null;
}

export function activeWordIndex(words: Timed[], frame: number): number {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (frame >= w.fromFrame && frame < w.fromFrame + w.durationInFrames) return i;
  }
  // se já passou da última palavra mas ainda na linha, destaca a última
  if (words.length && frame >= words[words.length - 1].fromFrame) return words.length - 1;
  return -1;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd remotion && npx vitest run`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
cd ..
git add remotion/src/timeline-utils.ts remotion/src/__tests__/timeline-utils.test.ts
git commit -m "feat: helpers de tempo da timeline (TDD)"
```

---

## Task 5: Tema da marca

**Files:**
- Create: `remotion/src/theme.ts`, `remotion/src/brand.json` (cópia do `brand/brand.json`)

- [ ] **Step 1: Copiar a marca para dentro do projeto Remotion**

Run: `cp brand/brand.json remotion/src/brand.json`
(O orquestrador da Task 11 refaz essa cópia a cada render.)

- [ ] **Step 2: Implementar theme.ts**

`remotion/src/theme.ts`:
```ts
import brand from "./brand.json";

export const theme = {
  logo: brand.logo,
  handle: brand.handle,
  colors: brand.colors,
  fonts: brand.fonts,
  spring: { damping: 12, stiffness: 150, mass: 0.8, overshootClamping: false },
} as const;
```

- [ ] **Step 3: Verificar typecheck**

Run: `cd remotion && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
cd ..
git add remotion/src/theme.ts remotion/src/brand.json
git commit -m "feat: tema da marca lido de brand.json"
```

---

## Task 6: HookCard

**Files:**
- Create: `remotion/src/components/HookCard.tsx`

- [ ] **Step 1: Implementar HookCard**

`remotion/src/components/HookCard.tsx`:
```tsx
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

export const HookCard: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame: frame - 4, fps, config: theme.spring });
  const titleY = interpolate(titleSpring, [0, 1], [30, 0]);
  const subOpacity = interpolate(frame, [16, 28], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.colors.bg,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
        textAlign: "center",
      }}
    >
      <h1
        style={{
          fontFamily: theme.fonts.heading,
          fontSize: 96,
          color: theme.colors.foreground,
          margin: 0,
          transform: `translateY(${titleY}px)`,
          opacity: titleSpring,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          fontFamily: theme.fonts.body,
          fontSize: 34,
          color: theme.colors.muted,
          marginTop: 24,
          opacity: subOpacity,
        }}
      >
        {subtitle}
      </p>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add remotion/src/components/HookCard.tsx
git commit -m "feat: HookCard (abertura animada com spring)"
```

---

## Task 7: SourceClip (vídeo real + reenquadre vertical)

**Files:**
- Create: `remotion/src/components/SourceClip.tsx`

- [ ] **Step 1: Implementar SourceClip**

`remotion/src/components/SourceClip.tsx`:
```tsx
import { AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig } from "remotion";
import type { TSegment } from "../schema";

type ClipSeg = Extract<TSegment, { type: "clip" }>;

export const SourceClip: React.FC<{ seg: ClipSeg; sourceWidth: number; sourceHeight: number }> = ({
  seg,
  sourceWidth,
  sourceHeight,
}) => {
  const { width, height } = useVideoConfig();

  // escala para "cobrir" o frame de saída
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const scaledW = sourceWidth * scale;
  const scaledH = sourceHeight * scale;

  // foco horizontal: focusX em [0,1] sobre a largura escalada
  const maxOffsetX = Math.max(0, scaledW - width);
  const offsetX = -(maxOffsetX * seg.reframe.focusX);
  const offsetY = -(Math.max(0, scaledH - height) / 2);

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#000" }}>
      <OffthreadVideo
        src={staticFile(seg.source)}
        trimBefore={seg.inFrame}
        trimAfter={seg.outFrame}
        style={{
          position: "absolute",
          width: scaledW,
          height: scaledH,
          left: offsetX,
          top: offsetY,
        }}
      />
    </AbsoluteFill>
  );
};
```

> Nota: `trimBefore`/`trimAfter` são da API atual do Remotion 4. Se a versão instalada reclamar, troque por `startFrom`/`endAt`.

- [ ] **Step 2: Commit**

```bash
git add remotion/src/components/SourceClip.tsx
git commit -m "feat: SourceClip com reenquadre (cover + foco horizontal)"
```

---

## Task 8: CaptionLayer (legendas palavra-a-palavra)

**Files:**
- Create: `remotion/src/components/CaptionLayer.tsx`

- [ ] **Step 1: Implementar CaptionLayer**

`remotion/src/components/CaptionLayer.tsx`:
```tsx
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { findActive, activeWordIndex } from "../timeline-utils";
import type { TCaption } from "../schema";

export const CaptionLayer: React.FC<{ captions: TCaption[]; fontSize: number; bottom: number }> = ({
  captions,
  fontSize,
  bottom,
}) => {
  const frame = useCurrentFrame();
  const active = findActive(captions, frame);
  if (!active) return null;
  const idx = activeWordIndex(active.words, frame);

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: 0 }}>
      <div
        style={{
          marginBottom: bottom,
          maxWidth: "80%",
          textAlign: "center",
          fontFamily: theme.fonts.body,
          fontWeight: 800,
          fontSize,
          lineHeight: 1.2,
          color: theme.colors.foreground,
          textShadow: "0 4px 16px rgba(0,0,0,0.6)",
        }}
      >
        {active.words.map((w, i) => (
          <span
            key={i}
            style={{
              color: i === idx ? theme.colors.accent : theme.colors.foreground,
              transform: i === idx ? "scale(1.08)" : "scale(1)",
              display: "inline-block",
              marginRight: 12,
              transition: "none",
            }}
          >
            {w.word}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add remotion/src/components/CaptionLayer.tsx
git commit -m "feat: CaptionLayer com destaque da palavra ativa"
```

---

## Task 9: OverlayLayer (lower-third)

**Files:**
- Create: `remotion/src/components/OverlayLayer.tsx`

- [ ] **Step 1: Implementar OverlayLayer**

`remotion/src/components/OverlayLayer.tsx`:
```tsx
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { findActive } from "../timeline-utils";
import type { TOverlay } from "../schema";

export const OverlayLayer: React.FC<{ overlays: TOverlay[] }> = ({ overlays }) => {
  const frame = useCurrentFrame();
  const active = findActive(overlays, frame);
  if (!active) return null;

  const local = frame - active.fromFrame;
  const opacity = interpolate(local, [0, 8], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", padding: 60 }}>
      <div
        style={{
          opacity,
          backgroundColor: theme.colors.card,
          color: theme.colors.foreground,
          fontFamily: theme.fonts.body,
          fontWeight: 600,
          fontSize: 28,
          padding: "14px 28px",
          borderRadius: 12,
          borderLeft: `4px solid ${theme.colors.accent}`,
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add remotion/src/components/OverlayLayer.tsx
git commit -m "feat: OverlayLayer (lower-third)"
```

---

## Task 10: Timeline + composições + Root

**Files:**
- Create: `remotion/src/Timeline.tsx`, `remotion/src/Main16x9.tsx`, `remotion/src/Vertical9x16.tsx`, `remotion/src/Root.tsx`, `remotion/src/sample-recipe.ts`

- [ ] **Step 1: `remotion/src/Timeline.tsx`**

```tsx
import { AbsoluteFill, Sequence } from "remotion";
import { theme } from "./theme";
import { segmentDuration } from "./timeline-utils";
import { HookCard } from "./components/HookCard";
import { SourceClip } from "./components/SourceClip";
import { CaptionLayer } from "./components/CaptionLayer";
import { OverlayLayer } from "./components/OverlayLayer";
import type { TEditRecipe } from "./schema";

export const Timeline: React.FC<{ recipe: TEditRecipe; captionFontSize: number; captionBottom: number }> = ({
  recipe,
  captionFontSize,
  captionBottom,
}) => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.colors.bg }}>
      {recipe.segments.map((seg, i) => {
        const dur = segmentDuration(seg);
        const from = offset;
        offset += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            {seg.type === "card" ? (
              <HookCard title={seg.title} subtitle={seg.subtitle} />
            ) : seg.type === "clip" ? (
              <SourceClip
                seg={seg}
                sourceWidth={recipe.source.width}
                sourceHeight={recipe.source.height}
              />
            ) : null /* scene: v2 */}
          </Sequence>
        );
      })}
      <CaptionLayer captions={recipe.captions} fontSize={captionFontSize} bottom={captionBottom} />
      <OverlayLayer overlays={recipe.overlays} />
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: `remotion/src/Main16x9.tsx`**

```tsx
import { Timeline } from "./Timeline";
import type { TEditRecipe } from "./schema";

export const Main16x9: React.FC<TEditRecipe> = (recipe) => {
  return <Timeline recipe={recipe} captionFontSize={48} captionBottom={120} />;
};
```

- [ ] **Step 3: `remotion/src/Vertical9x16.tsx`**

```tsx
import { Timeline } from "./Timeline";
import type { TEditRecipe } from "./schema";

export const Vertical9x16: React.FC<TEditRecipe> = (recipe) => {
  return <Timeline recipe={recipe} captionFontSize={64} captionBottom={320} />;
};
```

- [ ] **Step 4: `remotion/src/sample-recipe.ts` (defaultProps para o Studio)**

```ts
import type { TEditRecipe } from "./schema";

export const sampleRecipe: TEditRecipe = {
  fps: 30,
  source: { width: 1280, height: 720, trimmedFrames: 180 },
  segments: [
    { type: "card", durationInFrames: 90, title: "O segredo", subtitle: "em 60s" },
    { type: "clip", source: "trimmed.mp4", inFrame: 0, outFrame: 180, reframe: { focusX: 0.5 } },
  ],
  captions: [
    {
      fromFrame: 90,
      durationInFrames: 30,
      text: "ola pessoal",
      words: [
        { word: "ola", fromFrame: 90, durationInFrames: 15 },
        { word: "pessoal", fromFrame: 105, durationInFrames: 15 },
      ],
    },
  ],
  overlays: [{ type: "lowerThird", fromFrame: 0, durationInFrames: 90, text: "O segredo" }],
  formats: { main16x9: { width: 1920, height: 1080 }, vertical9x16: { width: 1080, height: 1920 } },
};
```

- [ ] **Step 5: `remotion/src/Root.tsx`**

```tsx
import { Composition } from "remotion";
import { Main16x9 } from "./Main16x9";
import { Vertical9x16 } from "./Vertical9x16";
import { zEditRecipe, type TEditRecipe } from "./schema";
import { totalDuration } from "./timeline-utils";
import { sampleRecipe } from "./sample-recipe";

const calc = (format: "main16x9" | "vertical9x16") => ({ props }: { props: TEditRecipe }) => {
  const recipe = zEditRecipe.parse(props);
  const f = recipe.formats[format];
  return {
    durationInFrames: Math.max(1, totalDuration(recipe.segments)),
    fps: recipe.fps,
    width: f.width,
    height: f.height,
  };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Main16x9"
        component={Main16x9}
        defaultProps={sampleRecipe}
        schema={zEditRecipe}
        calculateMetadata={calc("main16x9")}
        durationInFrames={1}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Vertical9x16"
        component={Vertical9x16}
        defaultProps={sampleRecipe}
        schema={zEditRecipe}
        calculateMetadata={calc("vertical9x16")}
        durationInFrames={1}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
```

- [ ] **Step 6: Typecheck**

Run: `cd remotion && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Verificar que as composições carregam**

Run: `cd remotion && npx remotion compositions`
Expected: lista `Main16x9` e `Vertical9x16`.

- [ ] **Step 8: Commit**

```bash
cd ..
git add remotion/src/Timeline.tsx remotion/src/Main16x9.tsx remotion/src/Vertical9x16.tsx remotion/src/Root.tsx remotion/src/sample-recipe.ts
git commit -m "feat: Timeline, composições 16:9/9:16 e Root com calculateMetadata"
```

---

## Task 11: Orquestrador end-to-end (`scripts/edit-video.sh`)

**Files:**
- Create: `scripts/edit-video.sh`

- [ ] **Step 1: Implementar o orquestrador**

`scripts/edit-video.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

# Uso:
#   scripts/edit-video.sh <stage> <slug> [src]
# stages: ingest | cut | transcribe | recipe | render
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="${1:?stage obrigatório}"
SLUG="${2:?slug obrigatório}"
SRC="${3:-}"
PY="$ROOT/.venv/bin/python"
JOB="$ROOT/jobs/$SLUG"

case "$STAGE" in
  ingest|cut|transcribe|recipe)
    if [ "$STAGE" = "ingest" ]; then
      "$PY" -m pipeline.cli ingest --slug "$SLUG" --src "$SRC"
    else
      "$PY" -m pipeline.cli "$STAGE" --slug "$SLUG"
    fi
    ;;
  render)
    # publicar artefatos para o Remotion
    cp "$ROOT/brand/brand.json" "$ROOT/remotion/src/brand.json"
    mkdir -p "$ROOT/remotion/public"
    cp "$JOB/trimmed.mp4" "$ROOT/remotion/public/trimmed.mp4"
    mkdir -p "$ROOT/output"
    cd "$ROOT/remotion"
    npx remotion render Main16x9 "$ROOT/output/$SLUG-16x9.mp4" --props="$JOB/edit-recipe.json"
    npx remotion render Vertical9x16 "$ROOT/output/$SLUG-9x16.mp4" --props="$JOB/edit-recipe.json"
    echo "render ok -> output/$SLUG-16x9.mp4 e output/$SLUG-9x16.mp4"
    ;;
  *)
    echo "stage inválido: $STAGE" >&2; exit 1;;
esac
```

- [ ] **Step 2: Tornar executável**

Run: `chmod +x scripts/edit-video.sh`

- [ ] **Step 3: Commit**

```bash
git add scripts/edit-video.sh
git commit -m "feat: orquestrador edit-video.sh (estágios + render)"
```

---

## Task 12: Verificação visual e render final (fixture do Plano 1)

**Files:** nenhum novo (verificação).

- [ ] **Step 1: Garantir artefatos do job de amostra**

Pré-requisito: Plano 1 Task 9 deixou `jobs/sample/` com `trimmed.mp4` e `edit-recipe.json`. Se não, rode os estágios:
```bash
scripts/edit-video.sh ingest sample jobs/sample/source.mp4
scripts/edit-video.sh cut sample
scripts/edit-video.sh transcribe sample
printf '{"title":"Teste de hook","subtitle":"amostra"}' > jobs/sample/hook.json
scripts/edit-video.sh recipe sample
```

- [ ] **Step 2: Still do HookCard (frame 30) e de uma legenda (frame 100)**

Run:
```bash
cd remotion
cp ../brand/brand.json src/brand.json
mkdir -p public && cp ../jobs/sample/trimmed.mp4 public/trimmed.mp4
npx remotion still Main16x9 ../output/still-hook.png --frame=30 --props=../jobs/sample/edit-recipe.json
npx remotion still Main16x9 ../output/still-caption.png --frame=100 --props=../jobs/sample/edit-recipe.json
```
Expected: dois PNGs em `output/`. Inspecionar: o hook deve mostrar título/subtítulo; o frame de legenda deve mostrar o vídeo + palavra destacada (se houver legenda nesse frame — depende da transcrição da amostra).

- [ ] **Step 3: Verificação visual (designer/visual-verdict ou olho humano)**

Abrir os PNGs e confirmar: marca aplicada, sem texto cortado, legenda na safe-zone. Ajustar `captionFontSize`/`captionBottom`/cores se necessário e re-rodar o still.

- [ ] **Step 4: Render final dos dois formatos**

Run: `scripts/edit-video.sh render sample`
Expected: `output/sample-16x9.mp4` e `output/sample-9x16.mp4`.

- [ ] **Step 5: Validar os renders com ffprobe**

Run:
```bash
ffprobe -v quiet -print_format json -show_format -show_streams output/sample-16x9.mp4 | grep -E 'width|height|duration'
ffprobe -v quiet -print_format json -show_format -show_streams output/sample-9x16.mp4 | grep -E 'width|height|duration'
```
Expected: 16x9 = 1920×1080; 9x16 = 1080×1920; ambos com áudio e duração = (hook_card_frames + trimmed_frames)/fps.

- [ ] **Step 6: Rodar a suíte de testes do Remotion**

Run: `cd remotion && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd ..
git add -A
git commit -m "test: verificação visual + render final end-to-end (16:9 e 9:16)"
```

---

## Self-Review (resultado)

- **Cobertura do spec:** Estágio 4 do spec (compor & renderizar) coberto pelas Tasks 6–12. Componentes do spec presentes: `HookCard` (Task 6), `SourceClip` (Task 7), `CaptionLayer` (Task 8 — equivale a `Captions`), `OverlayLayer` (Task 9 — equivale a `Overlays`), `theme.ts` (Task 5), `Timeline` + composições (Task 10). Os dois formatos (16:9 + 9:16 center-crop com foco) saem do mesmo projeto. Checkpoint de preview = Task 12 Step 2–3 (`remotion still`). Validação final via ffprobe = Task 12 Step 5.
- **Desvios registrados:** (1) legendas próprias em vez de `@remotion/captions` (estabilidade de API); (2) `@remotion/transitions` não é usado na v1 — transições entre cortes ficam para um incremento (os cortes de pausa já são "hard cuts" do `trimmed.mp4`; transições animadas exigiriam segmentar o clip, o que é melhor tratar quando houver múltiplos `clip`/`scene`). Isso **reduz** o escopo do "tratamento completo" do spec na v1 — sinalizar ao usuário (ver nota abaixo).
- **Placeholders:** nenhum — todo passo tem código/comando concreto.
- **Consistência de tipos:** chaves do `edit-recipe.json` casam com `pipeline/recipe.py` do Plano 1 (`segments` com `type`, `captions[].words[].fromFrame/durationInFrames`, `formats.main16x9/vertical9x16`). `TEditRecipe` (zod) é a fonte de verdade no lado TS; `Main16x9`/`Vertical9x16` recebem a recipe inteira como props, coerente com `calculateMetadata` que faz `zEditRecipe.parse(props)`.
- **Nota para o usuário:** o spec pedia "tratamento completo" incluindo transições e overlays ricos. A v1 entrega: card de hook, legendas animadas e lower-third. Transições animadas entre cortes e overlays de motion-graphics mais elaborados (badges, números animados) ficam como **incremento pós-v1**, pois dependem de mais estrutura na recipe (eventos de overlay tipados além de `lowerThird`). Vale confirmar se isso é aceitável para a primeira versão ou se algum desses deve entrar já.
