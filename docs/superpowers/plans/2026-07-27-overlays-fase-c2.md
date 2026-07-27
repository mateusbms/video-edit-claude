# Fase C.2 — Preview no play, feedback de salvar e timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No editor de overlays, fazer o preview animar junto com o play (hook e textos entram/saem), dar feedback ao salvar, deixar a seleção óbvia e adicionar uma timeline de marcadores clicáveis.

**Architecture:** Só o editor web (React/Vitest). `OverlayPreview` ganha uma prop `playing` que decide entre "congelar o selecionado para editar" (pausado) e "animar tudo de verdade" (tocando). Novo componente `OverlayTimeline` desenha barras por overlay e faz seek. `HookStep` passa a derivar o frame do tempo do vídeo; `OverlaysStep` liga tudo (playing, toast de salvo, marcador de seleção, timeline).

**Tech Stack:** React 19, Vite, Vitest + Testing Library (happy-dom).

**Constraints:** Nada de backend/render/schema. Não mexer no `overlayProgress` (a math de animação). Rodar testes com `cd web && npx vitest run <arquivo>`.

---

### Task 1: `OverlayPreview` — prop `playing` (congela pausado, anima tocando)

**Files:**
- Modify: `web/src/components/OverlayPreview.tsx`
- Test: `web/src/__tests__/OverlayPreview.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `web/src/__tests__/OverlayPreview.test.tsx`, dentro de um novo bloco:

```tsx
describe("OverlayPreview — regra de play (Fase C.2)", () => {
  it("tocando: selecionado fora da janela NÃO é desenhado (anima/some)", () => {
    render(
      <OverlayPreview overlays={[ov]} frame={200} scale={1}
        selectedId="ov_a" onSelect={() => {}} onMove={() => {}} playing />,
    );
    expect(screen.queryByText("Oferta")).not.toBeInTheDocument();
  });

  it("pausado: selecionado fora da janela É desenhado (para editar)", () => {
    render(
      <OverlayPreview overlays={[ov]} frame={200} scale={1}
        selectedId="ov_a" onSelect={() => {}} onMove={() => {}} />,
    );
    expect(screen.getByText("Oferta")).toBeInTheDocument();
  });

  it("tocando: selecionado em fade usa a opacidade da animação (não força 1)", () => {
    render(
      <OverlayPreview overlays={[ov]} frame={3} scale={1}
        selectedId="ov_a" onSelect={() => {}} onMove={() => {}} playing />,
    );
    const el = screen.getByText("Oferta");
    expect(Number(el.style.opacity)).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/OverlayPreview.test.tsx`
Expected: FAIL (a prop `playing` ainda não existe; pausado-fora-da-janela hoje não desenha).

- [ ] **Step 3: Implementar a prop e a regra**

Em `web/src/components/OverlayPreview.tsx`, adicionar `playing?: boolean;` ao tipo das props (junto de `captionZone?`), e incluir `playing = false` na desestruturação:

```tsx
}> = ({ overlays, frame, scale, selectedId, onSelect, onMove, readOnlyOverlays = [], captionZone, playing = false }) => {
```

Substituir o bloco dos overlays editáveis (o `overlays.filter(inWindow).map(...)`) por:

```tsx
      {overlays
        .filter((o) => (playing ? inWindow(o) : inWindow(o) || o.id === selectedId))
        .map((ov) => {
          const isSel = ov.id === selectedId;
          const freeze = isSel && !playing; // congela só pausado (para posicionar)
          const p = overlayProgress(frame, ov);
          const opacity = freeze ? 1 : p.opacity;
          const ty = freeze ? 0 : p.translateY;
          const sc = freeze ? 1 : p.scale;
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
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/OverlayPreview.test.tsx`
Expected: PASS (todos, inclusive os antigos — `playing` default `false` preserva o comportamento).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/OverlayPreview.tsx web/src/__tests__/OverlayPreview.test.tsx
git commit -m "feat(overlays): OverlayPreview.playing — congela selecionado pausado, anima no play

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Componente `OverlayTimeline`

**Files:**
- Create: `web/src/components/OverlayTimeline.tsx`
- Test: `web/src/__tests__/OverlayTimeline.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

Criar `web/src/__tests__/OverlayTimeline.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OverlayTimeline } from "../components/OverlayTimeline";
import type { Overlay } from "../types";

afterEach(cleanup);

const ov: Overlay = {
  id: "ov_a", type: "text", text: "Oferta",
  fromFrame: 30, durationInFrames: 60,
  x: 0.5, y: 0.2, anchor: "center", fontSize: 64,
  color: "", highlightColor: "", fontFamily: "",
  enter: "slide-up", exit: "fade", enterDurationInFrames: 12, exitDurationInFrames: 12,
};

const base = {
  overlays: [ov], totalFrames: 300, currentFrame: 0,
  selectedId: null as string | null, onSeekFrame: () => {}, onSelect: () => {},
};

describe("OverlayTimeline", () => {
  it("desenha uma barra por overlay com posição/largura proporcionais", () => {
    render(<OverlayTimeline {...base} />);
    const bar = screen.getByLabelText(/marcador Oferta/i);
    expect(bar.style.left).toBe("10%");   // 30/300
    expect(bar.style.width).toBe("20%");  // 60/300
  });

  it("clicar numa barra seleciona e faz seek pro início", () => {
    const onSelect = vi.fn();
    const onSeekFrame = vi.fn();
    render(<OverlayTimeline {...base} onSelect={onSelect} onSeekFrame={onSeekFrame} />);
    fireEvent.click(screen.getByLabelText(/marcador Oferta/i));
    expect(onSelect).toHaveBeenCalledWith("ov_a");
    expect(onSeekFrame).toHaveBeenCalledWith(30);
  });

  it("barras de contexto não são selecionáveis", () => {
    const onSelect = vi.fn();
    render(<OverlayTimeline {...base} overlays={[]} context={[ov]} onSelect={onSelect} />);
    expect(screen.queryByLabelText(/marcador/i)).not.toBeInTheDocument();
  });

  it("totalFrames=0 não quebra", () => {
    expect(() => render(<OverlayTimeline {...base} totalFrames={0} />)).not.toThrow();
    fireEvent.click(screen.getByLabelText(/marcador Oferta/i)); // não deve lançar
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/OverlayTimeline.test.tsx`
Expected: FAIL ("Failed to resolve import ../components/OverlayTimeline").

- [ ] **Step 3: Implementar o componente**

Criar `web/src/components/OverlayTimeline.tsx`:

```tsx
import type { Overlay } from "../types";

export const OverlayTimeline: React.FC<{
  overlays: Overlay[];
  context?: Overlay[];
  totalFrames: number;
  currentFrame: number;
  selectedId: string | null;
  onSeekFrame: (frame: number) => void;
  onSelect: (id: string) => void;
}> = ({ overlays, context = [], totalFrames, currentFrame, selectedId, onSeekFrame, onSelect }) => {
  const has = totalFrames > 0;
  const leftPct = (f: number) => (has ? `${Math.max(0, Math.min(100, (f / totalFrames) * 100))}%` : "0%");
  const widthPct = (f: number) => (has ? `${Math.max(0, Math.min(100, (f / totalFrames) * 100))}%` : "0%");

  const onRuler = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!has || rect.width <= 0) return;
    const x = (e.clientX - rect.left) / rect.width;
    onSeekFrame(Math.round(Math.max(0, Math.min(1, x)) * totalFrames));
  };

  return (
    <div role="group" aria-label="linha do tempo dos textos" onClick={onRuler}
      className="relative h-16 bg-zinc-900 border border-zinc-800 rounded overflow-hidden cursor-pointer">
      {context.map((ov) => (
        <div key={`ctx-${ov.id}`} aria-hidden
          className="absolute top-1 h-3 rounded bg-zinc-600/50"
          style={{ left: leftPct(ov.fromFrame), width: widthPct(ov.durationInFrames) }} />
      ))}
      {overlays.map((ov) => (
        <button key={ov.id} aria-label={`marcador ${ov.text}`}
          onClick={(e) => { e.stopPropagation(); onSelect(ov.id); onSeekFrame(ov.fromFrame); }}
          className={`absolute bottom-1 h-8 rounded text-left px-1 text-xs truncate ${
            ov.id === selectedId ? "bg-emerald-600 text-white" : "bg-emerald-800/70 text-emerald-100"}`}
          style={{ left: leftPct(ov.fromFrame), width: widthPct(ov.durationInFrames) }}>
          {ov.text}
        </button>
      ))}
      <div aria-hidden className="absolute top-0 bottom-0 w-px bg-white/80"
        style={{ left: leftPct(currentFrame) }} />
    </div>
  );
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/OverlayTimeline.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/OverlayTimeline.tsx web/src/__tests__/OverlayTimeline.test.tsx
git commit -m "feat(overlays): OverlayTimeline — barras por texto com seek e seleção

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `HookStep` — animar junto com o play

**Files:**
- Modify: `web/src/steps/HookStep.tsx`
- Test: `web/src/__tests__/HookStep.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao `describe("HookStep", ...)` em `web/src/__tests__/HookStep.test.tsx`:

```tsx
  it("hook anima com o play: some quando o vídeo passa da janela", async () => {
    mockFetch();
    const { container } = render(<HookStep {...props} />);
    // pausado em t=0 (selecionado) → hook visível
    expect(await screen.findByText("T")).toBeInTheDocument();
    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent.play(video);
    Object.defineProperty(video, "currentTime", { value: 10, configurable: true });
    fireEvent.timeUpdate(video); // frame 300 > janela (90) → some
    expect(screen.queryByText("T")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/HookStep.test.tsx`
Expected: FAIL (hoje o preview usa frame fixo ≈30, então o hook não some com o tempo).

- [ ] **Step 3: Implementar**

Em `web/src/steps/HookStep.tsx`:

Adicionar dois estados junto dos outros (`const [now, setNow] = useState(0);` já existe):

```tsx
  const [fps, setFps] = useState(30);
  const [playing, setPlaying] = useState(false);
```

No `useEffect` de carga (o que já chama `getJob`), setar o fps:

```tsx
    getJob(slug).then((j: any) => {
      if (j?.captionStyle) setCapStyle(j.captionStyle);
      if (j?.probe?.fps) setFps(j.probe.fps);
    }).catch(() => {});
```

Remover a linha `const previewFrame = Math.min(30, Math.max(0, hook.duration_frames - 1));` e, no lugar onde ela era usada, derivar do tempo:

```tsx
  const previewFrame = Math.round(now * fps);
```

No `<video>`, acrescentar os handlers de play/pause:

```tsx
        <video ref={videoRef} src={mediaUrl(slug, "trimmed.mp4")} controls
          onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className="w-full rounded border border-zinc-800" />
```

No `<OverlayPreview>` do hook, passar `playing`:

```tsx
        <OverlayPreview
          overlays={titleOverlay}
          readOnlyOverlays={subOverlay}
          captionZone={zone}
          frame={previewFrame}
          scale={previewScale}
          selectedId="ov_hook"
          playing={playing}
          onSelect={() => {}}
          onMove={(_id, x, y) => set({ x, y })}
        />
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/HookStep.test.tsx`
Expected: PASS (o novo teste + os 3 antigos, incluindo o dirty-guard).

- [ ] **Step 5: Commit**

```bash
git add web/src/steps/HookStep.tsx web/src/__tests__/HookStep.test.tsx
git commit -m "feat(hook): preview do hook anima com o play do vídeo (frame = now*fps)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `OverlaysStep` — play, "✓ salvo", seleção óbvia e timeline

**Files:**
- Modify: `web/src/steps/OverlaysStep.tsx`
- Test: `web/src/__tests__/OverlaysStep.test.tsx`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao `describe("OverlaysStep", ...)` em `web/src/__tests__/OverlaysStep.test.tsx`:

```tsx
  it("mostra ✓ salvo após salvar", async () => {
    render(<OverlaysStep {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /texto/i }));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    expect(await screen.findByText(/salvo/i)).toBeInTheDocument();
  });

  it("marca na lista o texto selecionado", async () => {
    render(<OverlaysStep {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /texto/i }));
    // ao adicionar, o novo texto é auto-selecionado
    expect(await screen.findByLabelText(/item selecionado/i)).toBeInTheDocument();
  });

  it("mostra um marcador na timeline para o texto adicionado", async () => {
    render(<OverlaysStep {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /texto/i }));
    expect(await screen.findByLabelText(/marcador/i)).toBeInTheDocument();
  });
```

Obs.: o mock de `getJob` do arquivo já devolve `probe: { ..., duration: 10 }`; use-o como fonte da duração total.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx`
Expected: FAIL (sem "✓ salvo", sem marcador de seleção, sem timeline).

- [ ] **Step 3: Implementar**

Em `web/src/steps/OverlaysStep.tsx`:

Importar o componente novo (junto dos outros imports):

```tsx
import { OverlayTimeline } from "../components/OverlayTimeline";
```

Adicionar estados (junto dos existentes):

```tsx
  const [playing, setPlaying] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
```

No `useEffect` de carga, ler a duração do probe:

```tsx
    getJob(slug).then((j: any) => {
      if (j?.probe?.fps) setFps(j.probe.fps);
      if (j?.probe?.duration) setDurationSec(j.probe.duration);
      if (j?.captionStyle) setCapStyle(j.captionStyle);
    }).catch(() => {});
```

Limpar o timer no unmount (novo `useEffect`):

```tsx
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);
```

No `save()`, no ramo de sucesso (antes do `return true;`), acionar o toast:

```tsx
      await putOverlays(slug, overlays);
      await runRecipe(slug);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
      return true;
```

No `<video>`, acrescentar handlers de play/pause e duração:

```tsx
        <video
          ref={videoRef}
          src={mediaUrl(slug, "trimmed.mp4")}
          controls
          onTimeUpdate={(e) => setNow((e.target as HTMLVideoElement).currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(e) => setDurationSec((e.target as HTMLVideoElement).duration || durationSec)}
          className="w-full rounded border border-zinc-800"
        />
```

No `<OverlayPreview>`, passar `playing={playing}`.

Logo abaixo do `</div>` que fecha o container do vídeo (`<div className="relative">…`), inserir a timeline:

```tsx
      <OverlayTimeline
        overlays={overlays}
        context={hookOverlays}
        totalFrames={Math.round(durationSec * fps)}
        currentFrame={frame}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onSeekFrame={(f) => { const v = videoRef.current; if (v) v.currentTime = f / fps; }}
      />
```

Adicionar o toast "✓ salvo" ao lado dos botões Adicionar/Salvar. Trocar o bloco:

```tsx
      <div className="flex gap-2">
        <button onClick={addOverlay} className="px-3 py-2 bg-emerald-600 rounded font-medium">+ Texto</button>
        <button onClick={save} disabled={saving} className="px-3 py-2 bg-zinc-800 rounded disabled:opacity-40">
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
```

por:

```tsx
      <div className="flex items-center gap-2">
        <button onClick={addOverlay} className="px-3 py-2 bg-emerald-600 rounded font-medium">+ Texto</button>
        <button onClick={save} disabled={saving} className="px-3 py-2 bg-zinc-800 rounded disabled:opacity-40">
          {saving ? "Salvando..." : "Salvar"}
        </button>
        {saved && <span className="text-emerald-400 text-sm">✓ salvo</span>}
      </div>
```

Marcar o item selecionado na lista. Trocar o `<li>` da lista por:

```tsx
        {overlays.map((o) => {
          const isSel = o.id === selectedId;
          return (
            <li key={o.id}
              className={`flex items-center gap-2 px-2 py-1 rounded border-l-2 ${
                isSel ? "bg-zinc-800 border-emerald-500" : "border-transparent"}`}>
              {isSel && <span aria-label="item selecionado" className="text-emerald-400">▸</span>}
              <button className="flex-1 text-left" onClick={() => setSelectedId(o.id)}>
                <input
                  aria-label={`texto do overlay ${o.id}`}
                  value={o.text}
                  onChange={(e) => patch(o.id, { text: e.target.value })}
                  className="bg-transparent w-full outline-none border-b border-transparent focus:border-emerald-500"
                />
              </button>
              <span className="text-xs text-zinc-500">{(o.fromFrame / fps).toFixed(1)}s</span>
              <button aria-label={`remover ${o.id}`} onClick={() => removeOverlay(o.id)} className="text-red-400 px-2">remover</button>
            </li>
          );
        })}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd web && npx vitest run src/__tests__/OverlaysStep.test.tsx`
Expected: PASS (os 5 antigos + os 3 novos).

- [ ] **Step 5: Rodar a suíte inteira do web**

Run: `cd web && npx vitest run`
Expected: PASS (tudo verde).

- [ ] **Step 6: Commit**

```bash
git add web/src/steps/OverlaysStep.tsx web/src/__tests__/OverlaysStep.test.tsx
git commit -m "feat(overlays): play anima o preview, toast de salvo, seleção clara e timeline

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

- **Cobertura da spec:** regra `playing` (Task 1) ✓; timeline (Task 2) ✓; hook no play (Task 3) ✓; feedback de salvar + seleção óbvia + timeline ligada + play state no Textos (Task 4) ✓. Re-selecionar texto antigo já funcionava e continua (clique na lista/preview → `setSelectedId`).
- **Tipos:** `OverlayTimeline` usa as mesmas props em spec/plano/testes (`onSeekFrame`, `onSelect`, `context`, `totalFrames`, `currentFrame`). `OverlayPreview` recebe `playing?: boolean`.
- **Sem placeholders:** todo passo tem código completo e comando com resultado esperado.
- **Fora de escopo respeitado:** nenhum toque em render/backend/schema/`overlayProgress`.
