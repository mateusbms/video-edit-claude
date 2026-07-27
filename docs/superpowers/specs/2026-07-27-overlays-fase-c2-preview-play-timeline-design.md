# Fase C.2 — Preview que toca a animação, feedback de salvar e timeline de marcadores

**Data:** 2026-07-27
**Depende de:** Fase C / C.1 (editor de overlays + hook editável).
**Escopo:** só o editor web. Nada de render/backend muda.

## Problema (feedback do usuário)

1. **Hook não anima no preview.** O preview do hook está preso num frame fixo
   (`previewFrame ≈ 30` em `HookStep.tsx`), desacoplado do play do vídeo. Resultado:
   o hook nunca entra nem sai, e mudar `duration_frames` não reflete visualmente.
2. **Textos "somem" / difícil de ver.** No passo Textos o preview segue o play
   (`frame = now × fps`), mas cada texto só aparece na sua janela exata e não há
   nenhuma pista de *onde* ele vive — dá a sensação de que não aparece ao dar play.
3. **Sem feedback ao salvar** e seleção pouco óbvia. Salvar não confirma nada;
   re-selecionar um texto pra editar já funciona, mas não é claro.

## Decisões de design (aprovadas)

- **Preview animado = "colar no play do vídeo".** O hook passa a animar no tempo
  real do próprio player (como os textos já fazem). Sem scrubber separado.
- **Fluxo de adicionar = "melhorar a lista atual".** Mantém edição inline na lista;
  acrescenta confirmação de salvo, auto-seleção e destaque do selecionado.
- **Timeline com marcadores = sim.** Faixa abaixo do vídeo com uma barra por texto
  (e o hook como contexto). Clicar pula o vídeo pro início e seleciona.

## Comportamento

### 1. Regra de animação no `OverlayPreview`

Nova prop `playing: boolean` (default `false`).

- **`playing === true`** (vídeo tocando): TODO overlay anima de verdade pelo
  `overlayProgress(frame, ov)` — inclusive o selecionado. Overlays fora da janela
  (`inWindow`) não são desenhados (é o que faz entrar/sair).
- **`playing === false`** (pausado): mantém a ergonomia de edição —
  - o overlay **selecionado** é desenhado **sempre** (mesmo fora da janela),
    em opacidade cheia e transform neutro (`ty=0, sc=1`), pra poder posicionar/editar;
  - os demais seguem `inWindow` + `overlayProgress` como hoje.

Isso resolve o "texto some ao adicionar" (pausado+selecionado sempre visível) sem
quebrar a visualização da animação (tocando anima tudo).

### 2. `HookStep` — animar no play

- Ler `fps` do job (`getJob().probe.fps`, default 30). Hoje não lê.
- Remover `previewFrame` fixo; passar `frame = Math.round(now * fps)` ao preview do
  hook e `playing` conforme o estado do player.
- Rastrear play/pause do `<video>` via `onPlay`/`onPause` → estado `playing`.
- Dar play nos primeiros segundos anima o hook (entra→segura→sai). Mudar
  `duration_frames` muda a janela e reflete no play.

### 3. `OverlaysStep` — feedback + play state + timeline

- Rastrear `playing` (onPlay/onPause) e repassar ao `OverlayPreview`.
- **"✓ salvo":** após `save()` com sucesso, mostrar um aviso "✓ salvo" que some
  sozinho em ~2s (estado `savedAt`/timeout). Erro continua como hoje.
- **Seleção óbvia:** item selecionado da lista ganha marcador `▸` e borda esquerda
  destacada (além do `bg-zinc-800` atual).
- **Timeline** (novo componente) abaixo do vídeo.

### 4. Novo componente `OverlayTimeline`

Arquivo: `web/src/components/OverlayTimeline.tsx`.

Props:
```ts
{
  overlays: Overlay[];        // barras editáveis (clicáveis + selecionáveis)
  context?: Overlay[];        // ex.: hook — barra de contexto, não selecionável
  totalFrames: number;        // duração do vídeo em frames (probe.duration * fps)
  currentFrame: number;       // cursor (linha vertical)
  selectedId: string | null;
  onSeekFrame: (frame: number) => void;  // clicar numa barra/faixa → seek
  onSelect: (id: string) => void;        // clicar numa barra → seleciona
}
```

Render/comportamento:
- Cada overlay = uma barra horizontal posicionada por
  `left = fromFrame/totalFrames`, `width = durationInFrames/totalFrames` (em %).
- `context` desenhado com estilo esmaecido (não recebe clique de seleção).
- Cursor: linha vertical em `currentFrame/totalFrames`.
- Clicar numa barra → `onSelect(id)` + `onSeekFrame(fromFrame)`.
- Clicar na régua (fora de barras) → `onSeekFrame` proporcional ao x do clique.
- `totalFrames <= 0` → não quebra (guarda; nada desenhado).

Seek: o passo converte frame→segundos (`frame/fps`) e faz `video.currentTime = s`.

## Testes (TDD)

- **OverlayPreview** (novos):
  - `playing=true` + selecionado fora da janela → não desenha (anima/some).
  - `playing=false` + selecionado fora da janela → desenha em opacidade cheia.
  - `playing=true` + selecionado dentro da janela em fade → usa opacidade do
    `overlayProgress` (não força 1).
- **OverlayTimeline** (novos): barra por overlay com left/width proporcionais;
  clicar chama `onSelect`+`onSeekFrame(fromFrame)`; `context` não dispara `onSelect`;
  `totalFrames=0` não quebra.
- **OverlaysStep**: "✓ salvo" aparece após salvar; marcador de selecionado no item.
- **HookStep**: preview recebe frame derivado do tempo do vídeo (não mais fixo);
  regressão do dirty-guard continua verde.

## Fora de escopo

- Scrubber/preview isolado do hook (usuário escolheu "colar no play").
- Qualquer mudança em render, `recipe.py`, schema ou backend.
- Arrastar as bordas das barras na timeline pra mudar duração (YAGNI agora;
  a edição de tempo continua nos campos Início/Fim).
