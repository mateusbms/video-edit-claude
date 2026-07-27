# Fase C.1 — Hook editável + preview completo + guia de colisão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dar ao hook controles de posição (arraste)/tamanho/fonte/cor/âncora no passo Hook; deixar o preview do passo Textos completo (vídeo + legendas + hook + textos + faixa da legenda); corrigir o "texto some ao adicionar"; e sinalizar (sem travar) quando um texto encavala a legenda.

**Architecture:** Hook ganha campos de estilo/posição em `hook.json` (defaults = valores fixos de hoje); `build_recipe` usa esses campos e deriva o subtítulo do título. No web, um `OverlayPreview` estendido desenha uma faixa da legenda (`captionZone`), aceita overlays read-only (o hook como contexto no passo Textos), força opacidade cheia no selecionado, e marca colisão (`overlapsCaption`). Funções puras (`captionZone`, `overlapsCaption`, `hookToOverlays`) são testáveis isoladamente. HookStep passa a ter preview ao vivo com o hook arrastável.

**Tech Stack:** Python (FastAPI/pytest, `python3`), React/Vite/Vitest, Remotion (inalterado). Zod pinado 4.3.6 — **não atualizar**.

**Spec:** `docs/superpowers/specs/2026-07-26-overlays-fase-c1-hook-editavel-preview-design.md`.

**Riscos herdados (§8, não confundir com regressão):** zod 4.3.6; `remotion/src/animated/__tests__/AnimatedRoot.test.tsx` já quebrado; fonte fora das 4 suportadas cai para Inter no render.

**Decisões de implementação:**
1. `Hook.color` no backend usa `str = ""` (plano simples; o `<input type=color>` sempre gera hex válido ou ""), coerente com `CaptionStyleParams.color`. Não move `HexOrEmpty`.
2. Campos novos do tipo `Hook` no web são **opcionais** (`x?`, …) para não quebrar o build durante a transição (o HookStep antigo continua compilando até ser reescrito); `hookToOverlays` aplica defaults.
3. Preview do hook usa um frame fixo dentro da janela (≈30) e o selecionado é forçado a opacidade cheia — o hook sempre aparece para posicionar.
4. `hookToOverlays` (web) espelha a geração do backend (título + subtítulo derivado: `y=title_y+0.08`, `fontSize=round(title_fs*0.48)`).

---

## File Structure

**Backend**
- `api/models.py` — `Hook` ganha `x,y,fontSize,fontFamily,color,anchor` (defaults).
- `api/routes.py` — `get_hook`/`put_hook` leem/gravam os novos campos.
- `pipeline/recipe.py` — overlay de hook usa os campos; subtítulo derivado.
- `tests/test_recipe.py`, `api/tests/test_models.py`, `api/tests/test_routes.py`.

**Frontend**
- `web/src/types.ts` — `Hook` ganha campos opcionais.
- `web/src/overlayHook.ts` — **novo** `hookToOverlays`.
- `web/src/overlayGeom.ts` — `captionZone`, `overlapsCaption` (+ `clientToFraction` existente).
- `web/src/components/OverlayPreview.tsx` — `readOnlyOverlays`, `captionZone`, selecionado full-opacity, aviso de colisão.
- `web/src/steps/HookStep.tsx` — preview ao vivo + controles.
- `web/src/steps/OverlaysStep.tsx` — preview completo.
- Testes web: `overlayHook.test.ts`, `overlayGeom.test.ts`, `OverlayPreview.test.tsx`, `HookStep.test.tsx`, `OverlaysStep.test.tsx`.

---

## Task 1: Backend — hook com posição/estilo

**Files:** `api/models.py`, `api/routes.py`, `pipeline/recipe.py`; tests em `api/tests/test_models.py`, `api/tests/test_routes.py`, `tests/test_recipe.py`.

- [ ] **Step 1: Write failing tests**

Em `api/tests/test_models.py`, adicionar:
```python
def test_hook_style_defaults():
    from api.models import Hook
    h = Hook(title="T")
    assert h.x == 0.5 and h.y == 0.16 and h.fontSize == 84
    assert h.fontFamily == "" and h.color == "" and h.anchor == "center"
```

Em `api/tests/test_routes.py`, adicionar (usa `_upload`/`sample_mp4`):
```python
def test_hook_put_get_persists_style(client, sample_mp4):
    _upload(client, sample_mp4, "hk1")
    body = {"title": "T", "subtitle": "", "duration_frames": 90,
            "x": 0.3, "y": 0.6, "fontSize": 100, "fontFamily": "Poppins",
            "color": "#ff0000", "anchor": "left"}
    r = client.put("/api/jobs/hk1/hook", json=body)
    assert r.status_code == 200, r.text
    got = client.get("/api/jobs/hk1/hook").json()
    assert got["x"] == 0.3 and got["y"] == 0.6 and got["fontSize"] == 100
    assert got["fontFamily"] == "Poppins" and got["color"] == "#ff0000" and got["anchor"] == "left"
```

Em `tests/test_recipe.py`, adicionar:
```python
def test_build_recipe_hook_uses_position_and_style():
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=2.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "H", "subtitle": "sub", "duration_frames": 90,
              "x": 0.3, "y": 0.6, "fontSize": 100, "fontFamily": "Poppins",
              "color": "#ff0000", "anchor": "left"},
        max_chars=99, max_gap=5.0,
    )
    title = recipe["overlays"][0]
    assert title["type"] == "hook"
    assert title["x"] == 0.3 and title["y"] == 0.6 and title["fontSize"] == 100
    assert title["fontFamily"] == "Poppins" and title["color"] == "#ff0000" and title["anchor"] == "left"
    sub = recipe["overlays"][1]
    assert sub["text"] == "sub"
    assert sub["x"] == 0.3 and sub["anchor"] == "left"       # herda do título
    assert abs(sub["y"] - 0.68) < 1e-6                        # y_title + 0.08
    assert sub["fontSize"] == 48                              # round(100*0.48)


def test_build_recipe_hook_style_defaults_backward_compat():
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "H", "subtitle": "", "duration_frames": 90},  # sem campos novos
        max_chars=99, max_gap=5.0,
    )
    t = recipe["overlays"][0]
    assert t["x"] == 0.5 and t["y"] == 0.16 and t["fontSize"] == 84 and t["anchor"] == "center"
```

- [ ] **Step 2: Run to verify FAIL**

Run:
```
python3 -m pytest api/tests/test_models.py::test_hook_style_defaults api/tests/test_routes.py::test_hook_put_get_persists_style tests/test_recipe.py -k "hook_uses_position or style_defaults_backward" -v
```
Expected: FAIL (campos inexistentes; overlay ainda usa valores fixos).

- [ ] **Step 3: Implement**

(a) `api/models.py` — na classe `Hook` (hoje `title/subtitle/duration_frames`), adicionar:
```python
    x: float = 0.5
    y: float = 0.16
    fontSize: int = 84
    fontFamily: str = ""
    color: str = ""
    anchor: Literal["center", "left", "right"] = "center"
```
(`Literal` já está importado.)

(b) `api/routes.py` — `get_hook`: ao montar `Hook(...)` a partir do `hook.json`, incluir os novos campos com `.get`:
```python
        return Hook(
            title=d["title"],
            subtitle=d.get("subtitle", ""),
            duration_frames=d.get("duration_frames", 90),
            x=d.get("x", 0.5), y=d.get("y", 0.16),
            fontSize=d.get("fontSize", 84), fontFamily=d.get("fontFamily", ""),
            color=d.get("color", ""), anchor=d.get("anchor", "center"),
        ).model_dump()
```
`put_hook`: gravar o hook inteiro — trocar o dict literal por `hook.model_dump()`:
```python
    write_json(Path(jobs_root) / slug / "hook.json", hook.model_dump())
    update_hook_card_frames(slug, jobs_root, hook.duration_frames)
    return {"ok": True}
```

(c) `pipeline/recipe.py` — no bloco que monta `hook_overlays`, ler os campos e derivar o subtítulo. Substituir o bloco atual (título fixo + subtítulo fixo) por:
```python
    duration_frames = max(1, hook.get("duration_frames") or 90)
    hx = hook.get("x", 0.5)
    hy = hook.get("y", 0.16)
    hfs = hook.get("fontSize", 84)
    hff = hook.get("fontFamily", "")
    hcolor = hook.get("color", "")
    hanchor = hook.get("anchor", "center")
    hook_overlays = [
        {
            "id": "ov_hook", "type": "hook", "text": hook["title"],
            "fromFrame": 0, "durationInFrames": duration_frames,
            "x": hx, "y": hy, "anchor": hanchor,
            "fontSize": hfs, "color": hcolor, "highlightColor": "", "fontFamily": hff,
            "enter": "slide-up", "exit": "fade",
            "enterDurationInFrames": 12, "exitDurationInFrames": 12,
        }
    ]
    subtitle = hook.get("subtitle", "")
    if subtitle:
        hook_overlays.append(
            {
                "id": "ov_hook_sub", "type": "text", "text": subtitle,
                "fromFrame": 6, "durationInFrames": max(1, duration_frames - 6),
                "x": hx, "y": round(hy + 0.08, 6), "anchor": hanchor,
                "fontSize": round(hfs * 0.48), "color": hcolor, "highlightColor": "", "fontFamily": hff,
                "enter": "slide-up", "exit": "fade",
                "enterDurationInFrames": 12, "exitDurationInFrames": 12,
            }
        )
```
(Mantém `manual_overlays = overlays or []` e `"overlays": hook_overlays + manual_overlays`.)

- [ ] **Step 4: Run to verify PASS + full backend**

Run:
```
python3 -m pytest tests/test_recipe.py api/tests/test_models.py api/tests/test_routes.py -q
python3 -m pytest tests/ api/tests/ -q
```
Expected: verde. Testes antigos do hook (ex. `test_build_recipe_hook_overlay_and_no_card`) continuam válidos (defaults iguais aos de antes).

- [ ] **Step 5: Commit**
```bash
git add api/models.py api/routes.py pipeline/recipe.py tests/test_recipe.py api/tests/test_models.py api/tests/test_routes.py
git commit -m "feat(hook): position/size/font/color/anchor persisted + derived subtitle (Fase C.1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: web `Hook` fields + `hookToOverlays`

**Files:** `web/src/types.ts`, `web/src/overlayHook.ts` (novo); test `web/src/__tests__/overlayHook.test.ts`.

- [ ] **Step 1: Write failing test** — criar `web/src/__tests__/overlayHook.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hookToOverlays } from "../overlayHook";
import type { Hook } from "../types";

const base: Hook = { title: "H", subtitle: "sub", duration_frames: 90,
  x: 0.3, y: 0.6, fontSize: 100, fontFamily: "Poppins", color: "#ff0000", anchor: "left" };

describe("hookToOverlays", () => {
  it("mapeia título com os campos do hook", () => {
    const [t] = hookToOverlays(base);
    expect(t.id).toBe("ov_hook");
    expect(t.type).toBe("hook");
    expect(t.x).toBe(0.3); expect(t.y).toBe(0.6); expect(t.fontSize).toBe(100);
    expect(t.fontFamily).toBe("Poppins"); expect(t.color).toBe("#ff0000"); expect(t.anchor).toBe("left");
    expect(t.durationInFrames).toBe(90);
  });
  it("deriva o subtítulo do título", () => {
    const ovs = hookToOverlays(base);
    expect(ovs).toHaveLength(2);
    const s = ovs[1];
    expect(s.text).toBe("sub"); expect(s.x).toBe(0.3); expect(s.anchor).toBe("left");
    expect(s.y).toBeCloseTo(0.68, 6); expect(s.fontSize).toBe(48); expect(s.fromFrame).toBe(6);
  });
  it("sem subtítulo -> só o título", () => {
    expect(hookToOverlays({ ...base, subtitle: "" })).toHaveLength(1);
  });
  it("aplica defaults quando campos opcionais ausentes", () => {
    const [t] = hookToOverlays({ title: "H", subtitle: "", duration_frames: 90 });
    expect(t.x).toBe(0.5); expect(t.y).toBe(0.16); expect(t.fontSize).toBe(84); expect(t.anchor).toBe("center");
  });
});
```

- [ ] **Step 2: Verify FAIL** — `cd web && npx vitest run src/__tests__/overlayHook.test.ts` → módulo inexistente.

- [ ] **Step 3: Implement**

(a) `web/src/types.ts` — trocar o tipo `Hook` por (campos novos **opcionais**):
```ts
export type Hook = {
  title: string;
  subtitle: string;
  duration_frames: number;
  x?: number;
  y?: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  anchor?: "center" | "left" | "right";
};
```

(b) criar `web/src/overlayHook.ts`:
```ts
import type { Hook, Overlay } from "./types";

// Espelha a geração do backend (pipeline/recipe.py): título + subtítulo derivado.
export function hookToOverlays(hook: Hook): Overlay[] {
  const x = hook.x ?? 0.5;
  const y = hook.y ?? 0.16;
  const fontSize = hook.fontSize ?? 84;
  const fontFamily = hook.fontFamily ?? "";
  const color = hook.color ?? "";
  const anchor = hook.anchor ?? "center";
  const dur = hook.duration_frames;
  const title: Overlay = {
    id: "ov_hook", type: "hook", text: hook.title,
    fromFrame: 0, durationInFrames: dur,
    x, y, anchor, fontSize, color, highlightColor: "", fontFamily,
    enter: "slide-up", exit: "fade", enterDurationInFrames: 12, exitDurationInFrames: 12,
  };
  const out: Overlay[] = [title];
  if (hook.subtitle) {
    out.push({
      id: "ov_hook_sub", type: "text", text: hook.subtitle,
      fromFrame: 6, durationInFrames: Math.max(1, dur - 6),
      x, y: y + 0.08, anchor, fontSize: Math.round(fontSize * 0.48),
      color, highlightColor: "", fontFamily,
      enter: "slide-up", exit: "fade", enterDurationInFrames: 12, exitDurationInFrames: 12,
    });
  }
  return out;
}
```

- [ ] **Step 4: Verify PASS + typecheck** — `cd web && npx vitest run src/__tests__/overlayHook.test.ts && npm run build 2>&1 | tail -3`. Build precisa passar (o HookStep antigo ainda compila porque os campos são opcionais).

- [ ] **Step 5: Commit**
```bash
git add web/src/types.ts web/src/overlayHook.ts web/src/__tests__/overlayHook.test.ts
git commit -m "feat(web): Hook style fields + hookToOverlays mapping (Fase C.1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `overlayGeom` — `captionZone` + `overlapsCaption`

**Files:** `web/src/overlayGeom.ts`; test `web/src/__tests__/overlayGeom.test.ts` (já existe — adicionar casos).

- [ ] **Step 1: Write failing tests** — adicionar em `web/src/__tests__/overlayGeom.test.ts`:
```ts
import { captionZone, overlapsCaption } from "../overlayGeom";

describe("captionZone", () => {
  it("faixa perto do rodapé para estilo típico", () => {
    const z = captionZone({ bottom: 120, fontSize: 48 }); // refHeight 1080
    expect(z.bottom).toBeCloseTo(1 - 120 / 1080, 6);           // ~0.8889
    expect(z.top).toBeCloseTo(1 - (120 + 48 * 1.6) / 1080, 6); // ~0.8178
    expect(z.top).toBeLessThan(z.bottom);
  });
  it("clampa em [0,1]", () => {
    const z = captionZone({ bottom: 5000, fontSize: 48 });
    expect(z.top).toBe(0);
    expect(z.bottom).toBe(0);
  });
});

describe("overlapsCaption", () => {
  const zone = { top: 0.8, bottom: 0.9 };
  it("y dentro da faixa colide", () => {
    expect(overlapsCaption({ y: 0.85 }, zone)).toBe(true);
  });
  it("y fora não colide", () => {
    expect(overlapsCaption({ y: 0.2 }, zone)).toBe(false);
  });
});
```

- [ ] **Step 2: Verify FAIL** — `cd web && npx vitest run src/__tests__/overlayGeom.test.ts` → `captionZone`/`overlapsCaption` não exportados.

- [ ] **Step 3: Implement** — adicionar em `web/src/overlayGeom.ts` (após `clientToFraction`):
```ts
// Zona (fração da altura) onde a legenda fica, para desenhar como guia de colisão.
// Aproximação: legenda ancorada no rodapé, altura ~1.6x o fontSize. refHeight 1080 (16x9).
export function captionZone(
  style: { bottom: number; fontSize: number },
  refHeight = 1080,
): { top: number; bottom: number } {
  const hPx = style.fontSize * 1.6;
  const bottom = clamp01(1 - style.bottom / refHeight);
  const top = clamp01(1 - (style.bottom + hPx) / refHeight);
  return { top, bottom };
}

// true se o centro vertical do overlay cai dentro da faixa da legenda.
export function overlapsCaption(o: { y: number }, zone: { top: number; bottom: number }): boolean {
  return o.y >= zone.top && o.y <= zone.bottom;
}
```

- [ ] **Step 4: Verify PASS** — `cd web && npx vitest run src/__tests__/overlayGeom.test.ts`.

- [ ] **Step 5: Commit**
```bash
git add web/src/overlayGeom.ts web/src/__tests__/overlayGeom.test.ts
git commit -m "feat(web): captionZone + overlapsCaption helpers (Fase C.1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `OverlayPreview` estendido

**Files:** `web/src/components/OverlayPreview.tsx` (reescrever); test `web/src/__tests__/OverlayPreview.test.tsx` (adicionar casos).

- [ ] **Step 1: Write failing tests** — adicionar em `web/src/__tests__/OverlayPreview.test.tsx` (mantém os testes existentes):
```ts
import { captionZone } from "../overlayGeom";

describe("OverlayPreview — extensões Fase C.1", () => {
  it("desenha overlays read-only (contexto) sem permitir seleção", () => {
    const onSelect = vi.fn();
    render(
      <OverlayPreview overlays={[]} readOnlyOverlays={[ov]} frame={20} scale={1}
        selectedId={null} onSelect={onSelect} onMove={() => {}} />,
    );
    const el = screen.getByText("Oferta");
    expect(el).toBeInTheDocument();
    fireEvent.pointerDown(el);
    expect(onSelect).not.toHaveBeenCalled(); // read-only não seleciona
  });

  it("marca colisão quando o overlay cai na faixa da legenda", () => {
    const zone = { top: 0.7, bottom: 0.95 };
    render(
      <OverlayPreview overlays={[{ ...ov, y: 0.8 }]} frame={20} scale={1}
        selectedId={null} onSelect={() => {}} onMove={() => {}} captionZone={zone} />,
    );
    expect(screen.getByLabelText(/aviso de colis/i)).toBeInTheDocument();
  });

  it("não marca colisão fora da faixa", () => {
    const zone = { top: 0.7, bottom: 0.95 };
    render(
      <OverlayPreview overlays={[{ ...ov, y: 0.2 }]} frame={20} scale={1}
        selectedId={null} onSelect={() => {}} onMove={() => {}} captionZone={zone} />,
    );
    expect(screen.queryByLabelText(/aviso de colis/i)).not.toBeInTheDocument();
  });
});
```
(`ov` e imports `describe/it/expect/vi/render/screen/fireEvent/cleanup` já existem no arquivo.)

- [ ] **Step 2: Verify FAIL** — `cd web && npx vitest run src/__tests__/OverlayPreview.test.tsx` → props novas ignoradas, sem aviso/read-only.

- [ ] **Step 3: Implement** — reescrever `web/src/components/OverlayPreview.tsx`:
```tsx
import { useRef } from "react";
import type { Overlay } from "../types";
import { overlayProgress } from "../overlayAnim";
import { clientToFraction, overlapsCaption } from "../overlayGeom";

type Zone = { top: number; bottom: number };

export const OverlayPreview: React.FC<{
  overlays: Overlay[];
  frame: number;
  scale: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  readOnlyOverlays?: Overlay[];
  captionZone?: Zone;
}> = ({ overlays, frame, scale, selectedId, onSelect, onMove, readOnlyOverlays = [], captionZone }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragId = useRef<string | null>(null);

  const inWindow = (o: Overlay) => frame >= o.fromFrame && frame < o.fromFrame + o.durationInFrames;

  const onPointerDownBlock = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    onSelect(id);
    dragId.current = id;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragId.current || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const { x, y } = clientToFraction(e.clientX, e.clientY, rect);
    onMove(dragId.current, x, y);
  };
  const endDrag = () => { dragId.current = null; };

  const anchorTx = (ov: Overlay) =>
    ov.anchor === "left" ? "translate(0, -50%)"
    : ov.anchor === "right" ? "translate(-100%, -50%)"
    : "translate(-50%, -50%)";
  const textAlign = (ov: Overlay): "left" | "right" | "center" =>
    ov.anchor === "left" ? "left" : ov.anchor === "right" ? "right" : "center";

  const styleFor = (ov: Overlay, opacity: number, ty: number, sc: number, outline?: string): React.CSSProperties => ({
    left: `${ov.x * 100}%`,
    top: `${ov.y * 100}%`,
    transform: `${anchorTx(ov)} translateY(${ty * scale}px) scale(${sc})`,
    opacity,
    color: ov.color || "#ffffff",
    fontFamily: ov.fontFamily || undefined,
    fontWeight: 800,
    fontSize: ov.fontSize * scale,
    lineHeight: 1.15,
    textAlign: textAlign(ov),
    maxWidth: "80%",
    whiteSpace: "pre-wrap",
    textShadow: "0 4px 24px rgba(0,0,0,0.7)",
    outline,
    outlineOffset: 4,
  });

  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none"
      onPointerMove={onPointerMove} onPointerUp={endDrag}>
      {captionZone && (
        <div aria-hidden className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: `${captionZone.top * 100}%`,
            height: `${(captionZone.bottom - captionZone.top) * 100}%`,
            background: "rgba(234,179,8,0.12)",
            border: "1px dashed rgba(234,179,8,0.5)",
          }} />
      )}

      {readOnlyOverlays.filter(inWindow).map((ov) => {
        const p = overlayProgress(frame, ov);
        return (
          <div key={`ro-${ov.id}`} className="absolute pointer-events-none select-none"
            style={styleFor(ov, p.opacity * 0.85, p.translateY, p.scale)}>
            {ov.text}
          </div>
        );
      })}

      {overlays.filter(inWindow).map((ov) => {
        const isSel = ov.id === selectedId;
        const p = overlayProgress(frame, ov);
        const opacity = isSel ? 1 : p.opacity;   // selecionado sempre visível p/ editar
        const ty = isSel ? 0 : p.translateY;
        const sc = isSel ? 1 : p.scale;
        const colliding = !!captionZone && overlapsCaption(ov, captionZone);
        const outline = colliding ? "2px solid #eab308" : isSel ? "2px solid #22c55e" : undefined;
        return (
          <div key={ov.id} onPointerDown={(e) => onPointerDownBlock(e, ov.id)}
            className="absolute pointer-events-auto cursor-move select-none"
            style={styleFor(ov, opacity, ty, sc, outline)}
            title={colliding ? "pode encavalar a legenda" : undefined}>
            {ov.text}
            {colliding && <span aria-label="aviso de colisão" className="ml-1">⚠</span>}
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 4: Verify PASS + typecheck** — `cd web && npx vitest run src/__tests__/OverlayPreview.test.tsx && npm run build 2>&1 | tail -3`. Os testes antigos do OverlayPreview continuam verdes.

- [ ] **Step 5: Commit**
```bash
git add web/src/components/OverlayPreview.tsx web/src/__tests__/OverlayPreview.test.tsx
git commit -m "feat(web): OverlayPreview caption band, read-only overlays, selected full-opacity, collision flag (Fase C.1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: HookStep — preview ao vivo + controles

**Files:** `web/src/steps/HookStep.tsx` (reescrever); test `web/src/__tests__/HookStep.test.tsx` (novo).

- [ ] **Step 1: Write failing test** — criar `web/src/__tests__/HookStep.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { HookStep } from "../steps/HookStep";

afterEach(cleanup);

function mockFetch(overrides?: (url: string, init?: any) => any) {
  const calls: any[] = [];
  const f = vi.fn(async (url: string, init?: any) => {
    calls.push({ url, init });
    const o = overrides?.(url, init);
    if (o) return o;
    if (url.endsWith("/hook") && (!init || !init.method || init.method === "GET"))
      return { ok: true, json: async () => ({ title: "T", subtitle: "", duration_frames: 90 }) } as any;
    if (url.endsWith("/transcript"))
      return { ok: true, json: async () => [] } as any;
    if (url.match(/\/jobs\/[^/]+$/) && (!init || !init.method))
      return { ok: true, json: async () => ({ slug: "s1", captionStyle: { fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" }, probe: { fps: 30 } }) } as any;
    return { ok: true, json: async () => ({ ok: true }) } as any;
  });
  vi.stubGlobal("fetch", f);
  return calls;
}

const props = { slug: "s1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("HookStep", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mostra os controles de estilo do hook", async () => {
    mockFetch();
    render(<HookStep {...props} />);
    expect(await screen.findByLabelText(/tamanho do hook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fonte do hook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ancora do hook/i)).toBeInTheDocument();
  });

  it("mudar o tamanho persiste via PUT /hook (debounce)", async () => {
    const calls = mockFetch();
    render(<HookStep {...props} />);
    const range = await screen.findByLabelText(/tamanho do hook/i);
    fireEvent.change(range, { target: { value: "120" } });
    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === "PUT" && c.url.endsWith("/hook"));
      expect(put).toBeTruthy();
      expect(JSON.parse(put.init.body).fontSize).toBe(120);
    }, { timeout: 2000 });
  });
});
```

- [ ] **Step 2: Verify FAIL** — `cd web && npx vitest run src/__tests__/HookStep.test.tsx` → controles inexistentes (HookStep atual só tem título/subtítulo/duração + img).

- [ ] **Step 3: Implement** — reescrever `web/src/steps/HookStep.tsx`:
```tsx
import { useEffect, useRef, useState } from "react";
import { getHook, putHook, runRecipe, getTranscript, getJob, mediaUrl } from "../api";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { OverlayPreview } from "../components/OverlayPreview";
import { hookToOverlays } from "../overlayHook";
import { captionZone } from "../overlayGeom";
import type { Hook, CaptionLine } from "../types";
import type { StepProps } from "../App";

const FONTS = ["Inter", "Poppins", "Montserrat", "Roboto"];
const DEF: Hook = {
  title: "", subtitle: "", duration_frames: 90,
  x: 0.5, y: 0.16, fontSize: 84, fontFamily: "", color: "", anchor: "center",
};

export const HookStep: React.FC<StepProps> = ({ slug, next, back }) => {
  const [hook, setHook] = useState<Hook>(DEF);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [capStyle, setCapStyle] = useState({ fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" });
  const [now, setNow] = useState(0);
  const [previewScale, setPreviewScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    getHook(slug).then((h: any) => setHook({ ...DEF, ...h })).catch(() => {});
    getTranscript(slug).then(setLines).catch(() => {});
    getJob(slug).then((j: any) => { if (j?.captionStyle) setCapStyle(j.captionStyle); }).catch(() => {});
  }, [slug]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => setPreviewScale(v.clientWidth > 0 ? v.clientWidth / 1920 : 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(v);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      try { await putHook(slug, hook); await runRecipe(slug); }
      catch (e: any) { setErr(e.message); }
    }, 700);
    return () => clearTimeout(t);
  }, [hook, slug]);

  const set = (p: Partial<Hook>) => setHook((h) => ({ ...h, ...p }));

  const overlays = hookToOverlays(hook);
  const titleOverlay = overlays.slice(0, 1);
  const subOverlay = overlays.slice(1);
  const zone = captionZone(capStyle);
  // frame fixo dentro da janela para o hook aparecer no preview (título é selecionado => opaco)
  const previewFrame = Math.min(30, Math.max(0, hook.duration_frames - 1));

  const goNext = async () => {
    setBusy(true);
    try { await putHook(slug, hook); await runRecipe(slug); next(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">4. Hook (abertura)</h2>
      <p className="text-sm text-zinc-400">
        O texto aparece animado sobre o início do vídeo. Arraste para posicionar; a faixa amarela mostra onde a legenda fica.
      </p>

      <label className="block">
        <span className="text-sm text-zinc-400">Título</span>
        <input className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={hook.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-sm text-zinc-400">Subtítulo</span>
        <input className="mt-1 block w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2"
          value={hook.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
      </label>

      <div className="relative">
        <video ref={videoRef} src={mediaUrl(slug, "trimmed.mp4")} controls
          onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)}
          className="w-full rounded border border-zinc-800" />
        <CaptionOverlay lines={lines} currentTime={now} style={capStyle} scale={previewScale} />
        <OverlayPreview
          overlays={titleOverlay}
          readOnlyOverlays={subOverlay}
          captionZone={zone}
          frame={previewFrame}
          scale={previewScale}
          selectedId="ov_hook"
          onSelect={() => {}}
          onMove={(_id, x, y) => set({ x, y })}
        />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">Duração (frames)
          <input type="number" className="bg-zinc-800 rounded px-2 py-1"
            value={hook.duration_frames} onChange={(e) => set({ duration_frames: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1">Tamanho
          <input aria-label="tamanho do hook" type="range" min={32} max={160}
            value={hook.fontSize ?? 84} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-1">Cor
          <input aria-label="cor do hook" type="color" value={hook.color || "#ffffff"}
            onChange={(e) => set({ color: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">Fonte
          <select aria-label="fonte do hook" value={hook.fontFamily || "Inter"}
            onChange={(e) => set({ fontFamily: e.target.value })} className="bg-zinc-800 rounded px-2 py-1">
            {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Âncora
          <select aria-label="ancora do hook" value={hook.anchor ?? "center"}
            onChange={(e) => set({ anchor: e.target.value as Hook["anchor"] })} className="bg-zinc-800 rounded px-2 py-1">
            {["center", "left", "right"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </div>

      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="pt-4 flex justify-between">
        <button onClick={back} className="px-4 py-2 bg-zinc-800 rounded">← Voltar</button>
        <button onClick={goNext} disabled={busy}
          className="px-4 py-2 bg-emerald-600 rounded font-medium disabled:opacity-40">
          {busy ? "Salvando..." : "Próximo →"}
        </button>
      </div>
    </section>
  );
};
```

- [ ] **Step 4: Verify PASS + full web suite + build** — `cd web && npx vitest run src/__tests__/HookStep.test.tsx && npx vitest run 2>&1 | tail -4 && npm run build 2>&1 | tail -3`.

- [ ] **Step 5: Commit**
```bash
git add web/src/steps/HookStep.tsx web/src/__tests__/HookStep.test.tsx
git commit -m "feat(web): HookStep live preview + position/size/font/color/anchor controls (Fase C.1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: OverlaysStep — preview completo

**Files:** `web/src/steps/OverlaysStep.tsx`; test `web/src/__tests__/OverlaysStep.test.tsx` (adicionar caso).

- [ ] **Step 1: Write failing test** — adicionar em `web/src/__tests__/OverlaysStep.test.tsx`. Primeiro, no `mockFetch` do arquivo, garantir respostas para `/transcript` e `/hook` (adicionar dois `if` antes do `return` final):
```ts
    if (url.endsWith("/transcript")) return { ok: true, json: async () => [] } as any;
    if (url.endsWith("/hook") && (!init || !init.method)) return { ok: true, json: async () => ({ title: "HOOK", subtitle: "", duration_frames: 90 }) } as any;
```
Depois adicionar o teste:
```tsx
  it("mostra o hook (contexto) no preview", async () => {
    render(<OverlaysStep {...props} />);
    expect(await screen.findByText("HOOK")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Verify FAIL** — `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx` → "HOOK" não aparece (preview não desenha o hook).

- [ ] **Step 3: Implement** — em `web/src/steps/OverlaysStep.tsx`:

(a) imports — adicionar:
```tsx
import { getOverlays, putOverlays, runRecipe, mediaUrl, getJob, getTranscript, getHook } from "../api";
import { OverlayPreview } from "../components/OverlayPreview";
import { CaptionOverlay } from "../components/CaptionOverlay";
import { applyStartSec, applyEndSec } from "../overlayTime";
import { hookToOverlays } from "../overlayHook";
import { captionZone } from "../overlayGeom";
import type { Overlay, OverlayAnim, Hook, CaptionLine } from "../types";
```

(b) estado novo (após `const [err, ...]`):
```tsx
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [capStyle, setCapStyle] = useState({ fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" });
  const [hook, setHook] = useState<Hook | null>(null);
```

(c) no `useEffect` de carga, adicionar:
```tsx
    getTranscript(slug).then(setLines).catch(() => {});
    getHook(slug).then(setHook).catch(() => {});
```
e no `getJob(...)` existente, além de `fps`, capturar o estilo:
```tsx
    getJob(slug).then((j: any) => {
      if (j?.probe?.fps) setFps(j.probe.fps);
      if (j?.captionStyle) setCapStyle(j.captionStyle);
    }).catch(() => {});
```

(d) derivar contexto antes do `return`:
```tsx
  const zone = captionZone(capStyle);
  const hookOverlays = hook ? hookToOverlays(hook) : [];
```

(e) no bloco de preview, adicionar `<CaptionOverlay>` e passar `readOnlyOverlays`/`captionZone` ao `OverlayPreview`:
```tsx
        <CaptionOverlay lines={lines} currentTime={now} style={capStyle} scale={previewScale} />
        <OverlayPreview
          overlays={overlays}
          readOnlyOverlays={hookOverlays}
          captionZone={zone}
          frame={frame}
          scale={previewScale}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={(id, x, y) => patch(id, { x, y })}
        />
```

- [ ] **Step 4: Verify PASS + full web suite + build** — `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx && npx vitest run 2>&1 | tail -4 && npm run build 2>&1 | tail -3`.

- [ ] **Step 5: Commit**
```bash
git add web/src/steps/OverlaysStep.tsx web/src/__tests__/OverlaysStep.test.tsx
git commit -m "feat(web): OverlaysStep full preview (captions + hook context + caption band) (Fase C.1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Verificação + entregável (render `/still` + deploy)

**Files:** nenhum. Inline. Ver memória [[render-still-proof-workflow]].

- [ ] **Step 1: Suítes completas**
```
python3 -m pytest tests/ api/tests/ -q
cd web && npx vitest run 2>&1 | tail -6
(cd remotion && npx vitest run 2>&1 | grep -E "Test Files|Tests |FAIL")
```
Expected: Python e web 100% verdes; Remotion só `AnimatedRoot` (baseline).

- [ ] **Step 2: Servidor + configurar hook customizado num job real**
```
cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude"
lsof -ti :8000 | xargs kill 2>/dev/null; sleep 1
set -a; . ./.env 2>/dev/null; set +a
nohup python3 -m uvicorn api.app:app --host 0.0.0.0 --port 8000 > /tmp/uvicorn.log 2>&1 & sleep 4
SLUG="A1%20Exame"
# hook numa posição/tamanho/fonte/cor customizados (ex. canto sup. esquerdo, Poppins)
curl -s -X PUT "localhost:8000/api/jobs/$SLUG/hook" -H "Content-Type: application/json" -d '{"title":"CHECK-UP DA CARTEIRA","subtitle":"em 60s","duration_frames":90,"x":0.28,"y":0.14,"fontSize":72,"fontFamily":"Poppins","color":"#ffdd00","anchor":"left"}' -w "\n[hook:%{http_code}]\n"
curl -s -X POST "localhost:8000/api/jobs/$SLUG/recipe" -w "[recipe:%{http_code}]\n"
python3 -c "import json;r=json.load(open('jobs/A1 Exame/edit-recipe.json'));h=[o for o in r['overlays'] if o['type']=='hook'][0];print('hook:',h['x'],h['y'],h['fontSize'],h['fontFamily'],h['color'],h['anchor'])"
```
Expected: `hook:200`, `recipe:200`; overlay de hook reflete `0.28 0.14 72 Poppins #ffdd00 left`.

- [ ] **Step 3: Still + inspeção**
```
OUT="<scratchpad-da-sessão>"
curl -s "localhost:8000/api/jobs/A1%20Exame/still?frame=20&format=main16x9" --output "$OUT/c1-hook.png"
```
Ler `c1-hook.png` (Read tool) e confirmar: o hook aparece **na posição/tamanho/cor/fonte customizados** (à esquerda, amarelo), sobre o vídeo. (A fonte cai para Inter se "Poppins" não estiver nas suportadas do render — é o comportamento §8; confirmar posição/cor/tamanho, que são o foco.)

- [ ] **Step 4: (Opcional) restaurar hook padrão do job** para não deixar o job de demo alterado, se desejado (`PUT /hook` com o título original e sem overrides).

- [ ] **Step 5: Deploy** — build → api/static, push main, restart uvicorn:
```bash
cd "/Users/mateusborges/Documents/Cursor/Video Editing - Claude/video-edit-claude" && lsof -ti :8000 | xargs kill 2>/dev/null; sleep 1 && (cd web && npm run build 2>&1 | tail -1) && rm -rf api/static && mkdir -p api/static && cp -r web/dist/. api/static/ && echo "static: $(ls api/static/assets/*.js | xargs -n1 basename)" && git push origin main 2>&1 | tail -2
lsof -ti :8000 | xargs kill 2>/dev/null; sleep 1; set -a; . ./.env 2>/dev/null; set +a; nohup python3 -m uvicorn api.app:app --host 0.0.0.0 --port 8000 > /tmp/uvicorn.log 2>&1 & sleep 4; curl -s -o /dev/null -w "root:%{http_code}\n" localhost:8000/
```

- [ ] **Step 6: Reportar** (via `superpowers:verification-before-completion`) e sugerir teste manual: passo Hook (arrastar + controles + faixa da legenda) e passo Textos (preview com legenda + hook + colisão sinalizada).

---

## Self-Review (checklist do autor)

**Cobertura do spec:**
- §1 hook dados (model/routes/recipe + subtítulo derivado) → Task 1. ✓
- §2 OverlayPreview (read-only, faixa, selecionado opaco, colisão) → Task 4. ✓
- §3 captionZone → Task 3. ✓
- §4 HookStep preview + controles → Task 5. ✓
- §5 OverlaysStep preview completo → Task 6. ✓
- §9 entregável render/still + deploy → Task 7. ✓

**Consistência de tipos/nomes:** `hookToOverlays` (Task 2) usado em Tasks 5,6; `captionZone`/`overlapsCaption` (Task 3) usados em Task 4; campos do `Hook` iguais entre `api/models.py` (Task 1), `types.ts` (Task 2), `build_recipe` (Task 1) e `hookToOverlays` (Task 2). Subtítulo derivado idêntico em `build_recipe` e `hookToOverlays` (`y+0.08`, `round(fs*0.48)`, `fromFrame 6`).

**Sem placeholders:** todo passo traz código real.

**Ordem de build segura:** campos novos do `Hook` (web) são opcionais → cada commit compila mesmo antes do HookStep ser reescrito (Task 5).
