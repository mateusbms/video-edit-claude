# Fase E — UX do editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps `- [ ]`.

**Goal:** 5 melhorias no editor de textos/hook: aviso de sobreposição no tempo (#1), nudge de
tempo (#2), defaults configuráveis de entrada/saída/permanência (#3), slider de largura separando
posição de quebra (#4), guias de alinhamento + snap (#5). Com paridade no render.

**Architecture:** helpers puros em `overlayGeom.ts`; campo `maxWidthPct` no modelo (web+backend+
remotion) honrado no preview e no render; wiring no `OverlaysStep`/`HookStep`; guias no
`OverlayPreview` (compartilhado pelos dois passos).

**Tech:** React/Vitest (web), pytest (backend), type-check remotion. `python3`.

**Constraints:** Não mexer em `overlayProgress`/`overlayAnim` (paridade). `maxWidthPct` deve casar
preview↔render. zod pinado. Rodar `cd web && npx vitest run` e `python3 -m pytest`.

---

### Task 1: Helpers puros `overlapsInTime` + `snapPosition`

**Files:** Modify `web/src/overlayGeom.ts`; Test `web/src/__tests__/overlayGeom.test.ts` (criar se não existir).

- [ ] **Step 1 — testes:**
```ts
import { describe, it, expect } from "vitest";
import { overlapsInTime, snapPosition } from "../overlayGeom";

const seg = (fromFrame: number, durationInFrames: number) => ({ fromFrame, durationInFrames });

describe("overlapsInTime", () => {
  it("cruzam", () => expect(overlapsInTime(seg(0, 60), seg(30, 60))).toBe(true));
  it("disjuntos", () => expect(overlapsInTime(seg(0, 60), seg(60, 60))).toBe(false));
  it("um dentro do outro", () => expect(overlapsInTime(seg(0, 120), seg(30, 10))).toBe(true));
});

describe("snapPosition", () => {
  const tx = [0.5], ty = [0.5];
  it("snap no centro X", () => {
    const r = snapPosition(0.505, 0.2, tx, ty, 0.012);
    expect(r.x).toBe(0.5); expect(r.guideX).toBe(0.5); expect(r.guideY).toBeNull();
  });
  it("snap em X e Y", () => {
    const r = snapPosition(0.5, 0.5, tx, ty, 0.012);
    expect(r.guideX).toBe(0.5); expect(r.guideY).toBe(0.5);
  });
  it("sem snap fora do limiar", () => {
    const r = snapPosition(0.2, 0.2, tx, ty, 0.012);
    expect(r.x).toBe(0.2); expect(r.guideX).toBeNull();
  });
  it("escolhe alvo mais próximo", () => {
    const r = snapPosition(0.31, 0.2, [0.3, 0.7], ty, 0.02);
    expect(r.x).toBe(0.3);
  });
});
```
- [ ] **Step 2:** `cd web && npx vitest run src/__tests__/overlayGeom.test.ts` → FAIL.
- [ ] **Step 3 — implementar** em `web/src/overlayGeom.ts`:
```ts
export function overlapsInTime(
  a: { fromFrame: number; durationInFrames: number },
  b: { fromFrame: number; durationInFrames: number },
): boolean {
  return a.fromFrame < b.fromFrame + b.durationInFrames &&
         b.fromFrame < a.fromFrame + a.durationInFrames;
}

export function snapPosition(
  x: number, y: number, targetsX: number[], targetsY: number[], threshold = 0.012,
): { x: number; y: number; guideX: number | null; guideY: number | null } {
  const nearest = (v: number, ts: number[]) => {
    let best: number | null = null, bestD = threshold;
    for (const t of ts) {
      const d = Math.abs(v - t);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  };
  const gx = nearest(x, targetsX);
  const gy = nearest(y, targetsY);
  return { x: gx ?? x, y: gy ?? y, guideX: gx, guideY: gy };
}
```
- [ ] **Step 4:** rodar → PASS. **Step 5:** commit `feat(overlays): overlapsInTime + snapPosition (helpers puros)`.

---

### Task 2: `maxWidthPct` no overlay (modelo + preview + render)

**Files:** `web/src/types.ts`, `web/src/components/OverlayPreview.tsx`, `api/models.py`,
`remotion/src/schema.ts`, `remotion/src/components/OverlayLayer.tsx`; Test `OverlayPreview.test.tsx`,
`api/tests/test_routes.py`.

- [ ] **Step 1 — teste web (OverlayPreview):** overlay com `maxWidthPct: 50` → o bloco tem
  `style.maxWidth === "50%"`. (Adicionar ao `OverlayPreview.test.tsx`, usando o `ov` existente com
  `maxWidthPct: 50`.) E teste backend: `OverlayParams` aceita `maxWidthPct` (incluir no PUT
  /overlays roundtrip existente ou novo).
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3 — implementar:**
  - `web/src/types.ts`: `Overlay` ganha `maxWidthPct: number;` (obrigatório) — e onde overlays são
    construídos garantir default 80. (Ver Task 3/4 para `newOverlay`/`suggestionToOverlay`.)
  - `OverlayPreview.styleFor`: trocar `maxWidth: "80%"` por `maxWidth: \`${ov.maxWidthPct ?? 80}%\``.
  - `api/models.py` `OverlayParams`: `maxWidthPct: int = 80`.
  - `remotion/src/schema.ts` OverlayParams zod: `maxWidthPct: z.number().default(80)`.
  - `remotion/src/components/OverlayLayer.tsx`: `maxWidth: \`${ov.maxWidthPct ?? 80}%\``.
  - Ajustar fixtures/objetos `Overlay` nos testes existentes que quebrem por falta do campo
    (adicionar `maxWidthPct: 80`).
- [ ] **Step 4:** `cd web && npx vitest run` + `python3 -m pytest api/tests/test_routes.py -q` +
  `cd remotion && npx tsc --noEmit` (ignorar erros pré-existentes de AnimatedRoot/toBeInTheDocument).
- [ ] **Step 5:** commit `feat(overlays): maxWidthPct por overlay (preview + render + backend)`.

---

### Task 3: `OverlaysStep` — aviso #1, nudge #2, slider largura #4

**Files:** `web/src/steps/OverlaysStep.tsx`, `web/src/components/OverlayPreview.tsx`,
`web/src/components/OverlayTimeline.tsx`; Test `OverlaysStep.test.tsx`, `OverlayPreview.test.tsx`.

- [ ] Aviso #1: `OverlayPreview` recebe `timeOverlapIds?: Set<string>`; para overlay nesse conjunto,
  desenha ⚠ (`aria-label="aviso de sobreposição"`) + contorno âmbar (reaproveitar padrão do aviso
  de legenda). `OverlaysStep` calcula `overlappingIds` via `overlapsInTime` (par a par) e passa ao
  preview, à lista (⚠ no item) e à timeline (barra em tom de alerta via nova prop
  `warnIds?: Set<string>`).
- [ ] Nudge #2: no painel do selecionado, botões −/+ (`aria-label` "recuar início"/"avançar início")
  que fazem `patch(id, { fromFrame: Math.max(0, selected.fromFrame ± 3) })`.
- [ ] Largura #4: slider "Largura" (`aria-label="largura"`, range 20–100) → `patch(id,{maxWidthPct})`.
- [ ] Copy do passo: deixar claro "Arraste para mover; use Largura para a quebra de linha."
- [ ] Testes: (a) dois textos que se cruzam no tempo → ⚠ aparece (`findByLabelText(/sobreposição/i)`);
  (b) clicar "+ início" aumenta o tempo mostrado; (c) mudar o slider largura persiste `maxWidthPct`.
- [ ] Rodar suíte web → PASS. Commit `feat(overlays): aviso de sobreposição no tempo + nudge + slider de largura`.

---

### Task 4: Defaults configuráveis de entrada/saída/permanência (#3)

**Files:** `api/models.py` (SuggestDefaults), `web/src/suggestions.ts`, `web/src/steps/OverlaysStep.tsx`
(`newOverlay` + painel de defaults), `web/src/api.ts` (nada novo); Test `suggestions.test.ts`,
`OverlaysStep.test.tsx`, `api/tests/test_routes.py`.

- [ ] Backend `SuggestDefaults`: `enter: OverlayAnim = "slide-up"`, `exit: OverlayAnim = "fade"`,
  `durationInFrames: int = 75`, `maxWidthPct: int = 80` (reusar o `OverlayAnim` já definido).
- [ ] `web/src/suggestions.ts`: `SuggestDefaults` ganha os 4 campos; `suggestionToOverlay` passa a
  usar `d.enter/d.exit/d.durationInFrames/d.maxWidthPct` (em vez de hardcode), mantendo
  enter/exitDurationInFrames em 12.
- [ ] `OverlaysStep`: `defs` inicial ganha os 4 campos; `newOverlay(fromFrame, id, defs)` herda
  `enter/exit/durationInFrames/maxWidthPct` de `defs` (novo parâmetro). Painel "Estilo padrão" ganha
  selects **Entrada**/**Saída** (`aria-label` "entrada padrão"/"saída padrão") e **Permanência (s)**
  (`aria-label="permanência padrão"`, `durationInFrames = round(s*fps)`), com `patchDefs`.
- [ ] Testes: `suggestionToOverlay` herda os 4 (atualizar o teste existente com defs completos);
  painel tem "entrada padrão"; backend roundtrip com os campos novos.
- [ ] Rodar → PASS. Commit `feat(overlays): defaults configuráveis de entrada/saída/permanência`.

---

### Task 5: Guias de alinhamento + snap no `OverlayPreview` (#5)

**Files:** `web/src/components/OverlayPreview.tsx`; Test `OverlayPreview.test.tsx`.

- [ ] `OverlayPreview` monta targets = `[0.5]` + `x` e `y` dos demais overlays editáveis (exceto o
  arrastado) + dos `readOnlyOverlays`. No `onPointerMove`, usa `snapPosition(x,y,targetsX,targetsY)`
  antes de `onMove`; guarda `{guideX, guideY}` em estado; desenha linha **vertical** (guideX, altura
  cheia) e **horizontal** (guideY, largura cheia), cor `#22d3ee`, `pointer-events:none`, só durante o
  arraste; limpa no `endDrag`.
- [ ] Teste: iniciar arraste e mover pra `clientX/Y` que caiam perto do centro → aparece a linha-guia
  (elemento com `aria-label="guia de alinhamento"`), e `onMove` recebe o valor snapado (0.5).
  (Usar `getBoundingClientRect` mockado como no teste de drag existente, ou verificar via
  `snapPosition` já testado + presença do elemento guia.)
- [ ] Rodar → PASS. Commit `feat(overlays): guias de alinhamento + snap ao centro e a outros textos`.

---

### Task 6: Paridade do Hook — `maxWidthPct` no hook (#4) e guias herdadas (#5)

**Files:** `web/src/types.ts` (Hook), `api/models.py` (Hook), `web/src/steps/HookStep.tsx`,
`web/src/overlayHook.ts`, `pipeline/recipe.py`; Test `overlayHook.test.ts`, `HookStep.test.tsx`,
`tests/test_stages.py`.

- [ ] `Hook` (web + backend) ganha `maxWidthPct` (default 80). `overlayHook.hookToOverlays` propaga
  pros overlays derivados (título + subtítulo). `recipe.py` inclui `maxWidthPct` nos overlays do hook
  (default `hook.get("maxWidthPct", 80)`).
- [ ] `HookStep`: slider "Largura" (`aria-label="largura do hook"`, 20–100) ligado a `maxWidthPct`;
  DEF ganha `maxWidthPct: 80`. (As guias já funcionam: HookStep usa `OverlayPreview`.)
- [ ] Testes: `hookToOverlays` propaga `maxWidthPct`; HookStep mostra "largura do hook"; `recipe.py`
  inclui o campo (estender teste de recipe do hook).
- [ ] Rodar web + backend → PASS. Commit `feat(hook): maxWidthPct no hook (paridade com textos)`.

---

## Self-Review

- Cobre a spec: helpers (T1) → #1/#5 base; maxWidthPct texto (T2) + hook (T6) → #4; wiring
  aviso/nudge/largura (T3) → #1/#2/#4; defaults (T4) → #3; guias (T5) → #5.
- Paridade preview↔render garantida em T2/T6 (OverlayLayer + hook usam maxWidthPct).
- `overlayProgress` intocado. Tipos `maxWidthPct`/SuggestDefaults consistentes entre web/backend/
  remotion. Sem placeholders nos passos mecânicos; partes interativas (guias) têm contrato + teste.
