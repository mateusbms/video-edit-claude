# Fase C.1 — Hook editável + preview completo + guia de colisão (design/spec)

> **Para quem implementar:** spec auto-contido. Comece por `superpowers:writing-plans`,
> depois `superpowers:subagent-driven-development`. Trabalho autorizado em `main`.
> Commits com `Co-Authored-By: Claude Opus 4.8`.

**Data:** 2026-07-26
**Contexto:** Fases A (legendas+brand), B (hook como overlay animado) e C (editor manual de
overlays) já entregues em `main`. Esta é uma iteração de polimento sobre C, motivada por
feedback real do usuário ao testar:
1. O hook não tem controle de posição/tamanho/fonte/cor — é fixo no backend.
2. Não há como perceber/evitar sobreposição do texto com a legenda (hoje é convenção manual).
3. No passo "Textos", o preview mostra só os textos manuais (não mostra legendas nem hook), e
   um texto recém-adicionado aparece invisível (é o frame 0 da animação de entrada).

**Decisões do usuário (fechadas no brainstorming):** hook editável **no próprio passo Hook**;
colisão tratada da forma **mais simples** (aviso visual, sem trava); preview do passo Textos
**completo** (vídeo + legendas + hook + textos + faixa da legenda).

---

## 0. Estado atual (código)

- **Hook overlay** gerado fixo em [pipeline/recipe.py](pipeline/recipe.py) `build_recipe`:
  `{x:0.5, y:0.16, fontSize:84, fontFamily:"", color:"", anchor:"center", enter:"slide-up",
  exit:"fade"}` (título) + subtítulo opcional em `y:0.24, fontSize:40`. `hook.json` guarda só
  `{title, subtitle, duration_frames}` ([api/models.py](api/models.py) `Hook`;
  [api/routes.py](api/routes.py) `get_hook`/`put_hook`).
- **HookStep** ([web/src/steps/HookStep.tsx](web/src/steps/HookStep.tsx)): edita
  title/subtitle/duration; preview é uma `<img>` estática (`stillUrl` frame 20).
- **OverlaysStep** ([web/src/steps/OverlaysStep.tsx](web/src/steps/OverlaysStep.tsx)): preview =
  `<video>` + `<OverlayPreview>` desenhando **só** os overlays manuais. Sem legendas, sem hook,
  sem faixa de legenda. Overlay selecionado usa `overlayProgress` → no frame de entrada tem
  opacity 0 (parece que "sumiu").
- **OverlayPreview** ([web/src/components/OverlayPreview.tsx](web/src/components/OverlayPreview.tsx)):
  desenha overlays ativos, seleção por pointer-down, drag → `onMove` (via
  [web/src/overlayGeom.ts](web/src/overlayGeom.ts) `clientToFraction`), anima por
  `overlayProgress` ([web/src/overlayAnim.ts](web/src/overlayAnim.ts)).
- **CaptionOverlay** ([web/src/components/CaptionOverlay.tsx](web/src/components/CaptionOverlay.tsx)):
  desenha a legenda ativa por `currentTime`, com `scale` (padrão `previewScale = clientWidth/1920`
  de [web/src/steps/TranscriptStep.tsx](web/src/steps/TranscriptStep.tsx)).
- **captionStyle** resolvido tem `{fontSize, bottom, color, highlightColor, fontFamily}`; a
  legenda é ancorada no rodapé com `marginBottom: bottom*scale`.

---

## 1. Hook editável (dados)

Estender o hook para carregar estilo/posição, mantendo retrocompat (defaults iguais aos fixos
de hoje).

- **`api/models.py` `Hook`** ganha campos (todos com default):
  ```python
  x: float = 0.5
  y: float = 0.16
  fontSize: int = 84
  fontFamily: str = ""
  color: HexOrEmpty = ""          # reusar HexOrEmpty da Fase C
  anchor: Literal["center","left","right"] = "center"
  ```
  (Mantém `title`, `subtitle`, `duration_frames`.)
- **`api/routes.py`**: `get_hook` lê os novos campos de `hook.json` com `.get(..., default)`;
  `put_hook` grava todos. Retrocompatível: `hook.json` antigo (sem os campos) usa defaults.
- **`pipeline/recipe.py` `build_recipe`**: o overlay de hook (título) usa
  `hook.get("x",0.5)`, `hook.get("y",0.16)`, `hook.get("fontSize",84)`,
  `hook.get("fontFamily","")`, `hook.get("color","")`, `hook.get("anchor","center")` em vez dos
  literais. O **subtítulo** continua **derivado**: mesmo `x`/`anchor` do título,
  `y = title_y + 0.08`, `fontSize = round(title_fontSize*0.48)` (≈40 quando título=84), cor/fonte
  herdadas. Assim o usuário controla um bloco (o título) e o subtítulo acompanha — YAGNI de
  controles separados.
- Nenhuma mudança em `zOverlay`/`OverlayLayer` (já aceitam esses campos desde a Fase B).

**Teste:** `Hook` aplica defaults; `build_recipe` reflete `x/y/fontSize/fontFamily/color/anchor`
do hook no overlay de hook; subtítulo derivado acompanha a posição/estilo do título.

---

## 2. `OverlayPreview` estendido (fundação visual compartilhada)

Estender o componente para servir aos dois passos (Hook e Textos) sem duplicar lógica de desenho.

Novas props (todas opcionais, retrocompatíveis):
- `readOnlyOverlays?: Overlay[]` — desenhados como contexto (ex.: o hook no passo Textos, ou as
  legendas via `CaptionOverlay` separado). Não recebem seleção nem drag (`pointer-events-none`).
- `captionZone?: { top: number; bottom: number }` — frações [0,1] da altura; desenha uma **faixa
  translúcida** (ex. `background: rgba(234,179,8,0.15)`, borda tracejada) marcando onde a legenda
  fica. Serve de guia de colisão.

Comportamentos novos:
- **Selecionado sempre visível:** para o overlay cujo `id === selectedId`, ignorar a opacidade de
  `overlayProgress` e desenhar com `opacity: 1` (corrige "texto some ao adicionar"). Os demais
  ativos continuam animando normalmente. `translateY`/`scale` do selecionado podem seguir a
  animação ou ser zerados — **decisão: zerar transform do selecionado** (posição estável para
  arrastar/posicionar). A animação real é validada no render/`/still`.
- **Aviso de colisão:** função pura `overlapsCaption(overlay, captionZone): boolean` (novo
  módulo `web/src/overlayGeom.ts`, ao lado de `clientToFraction`, **testável**). Regra simples:
  o `y` (centro) do overlay cai dentro de `[captionZone.top, captionZone.bottom]`. Se sim, o
  bloco recebe contorno de aviso (ex. `outline: 2px solid #eab308`) e um selo "⚠" (title/aria).

**Teste:** desenha `readOnlyOverlays` sem permitir seleção; desenha a faixa quando `captionZone`
dado; selecionado renderiza em opacidade cheia; `overlapsCaption` verdadeiro dentro da faixa e
falso fora.

---

## 3. Zona da legenda (cálculo, simples)

Função pura `captionZone(captionStyle, refHeight=1080): { top, bottom }` em
`web/src/overlayGeom.ts`:
- `bottomPx = captionStyle.bottom` (px em espaço de render); `hPx ≈ captionStyle.fontSize * 1.6`
  (altura aproximada de 1–2 linhas).
- `bottom = 1 - bottomPx/refHeight` (borda inferior da faixa, medida do topo);
  `top = 1 - (bottomPx + hPx)/refHeight`. Clampar em [0,1].
- Usa `refHeight = 1080` (referência 16×9, mesma convenção de `fontSize`/`previewScale`). É uma
  aproximação para orientar o olho — não precisa ser exata (§8 do spec original: fidelidade real
  sempre no `/still`).

**Teste:** valores plausíveis (ex. bottom=120, fontSize=48 @1080 → faixa perto do rodapé,
`bottom≈0.889`, `top≈0.82`); clamp quando `bottom` grande.

---

## 4. HookStep reformulado (preview ao vivo + controles)

Trocar o preview `<img>` estático por vídeo ao vivo com o hook arrastável:
- `<video src=trimmed.mp4>` + `previewScale` (ResizeObserver, padrão do TranscriptStep) + `now`
  (timeUpdate).
- `<CaptionOverlay lines={transcript} currentTime={now} style={captionStyle} scale={previewScale} />`
  (read-only, para ver a legenda) — busca `getTranscript` + `getJob().captionStyle`.
- `<OverlayPreview>` com **o hook como overlay editável** (arrastável → atualiza `x`,`y` do hook),
  `captionZone` (faixa da legenda). O hook é convertido em `Overlay` por um helper
  `hookToOverlays(hook)` (web) — mesmo mapeamento do backend (título + subtítulo derivado).
- Controles novos abaixo do vídeo: **Tamanho** (range), **Fonte** (select das 4), **Cor**
  (color), **Âncora** (select). Posição é o arraste. Título/subtítulo/duração continuam.
- Salvar: debounce → `putHook` (com os novos campos) + `runRecipe` (padrão atual). Remover a
  dependência do `stillUrl`.

**Nota:** a duração em frames continua; ao arrastar/editar, o preview reflete na hora (estado
local), sem esperar o backend.

**Teste (web):** HookStep monta o preview; arrastar o hook chama `putHook` (debounce) com `x/y`
novos; mudar tamanho/fonte/cor/âncora atualiza o estado e persiste.

---

## 5. OverlaysStep — preview completo

- Buscar também `getTranscript` (legendas) + `getJob().captionStyle` + `getHook` (para desenhar o
  hook read-only).
- Preview passa a compor: `<video>` + `<CaptionOverlay>` (legendas) + `<OverlayPreview>` com
  `overlays` (manuais, editáveis), `readOnlyOverlays = hookToOverlays(hook)` (hook como contexto),
  `captionZone`. Selecionado em opacidade cheia (corrige o bug relatado).
- Sem mudanças de persistência (continua `putOverlays` + `runRecipe`).

**Teste (web):** OverlaysStep renderiza legenda + hook read-only + texto manual no preview;
adicionar um texto e ele aparece imediatamente (opacidade cheia por ser o selecionado).

---

## 6. Arquivos tocados (mapa)

**Backend**
- `api/models.py` — `Hook` ganha `x,y,fontSize,fontFamily,color,anchor`.
- `api/routes.py` — `get_hook`/`put_hook` leem/gravam os novos campos.
- `pipeline/recipe.py` — overlay de hook usa os campos; subtítulo derivado.
- `tests/test_recipe.py`, `api/tests/test_models.py`, `api/tests/test_routes.py` — testes.

**Frontend**
- `web/src/types.ts` — `Hook` ganha os campos; helper de tipo se necessário.
- `web/src/overlayGeom.ts` — `captionZone`, `overlapsCaption` (+ `clientToFraction` já existe).
- `web/src/overlayHook.ts` — **novo** `hookToOverlays(hook): Overlay[]` (mapeamento título+subtítulo).
- `web/src/components/OverlayPreview.tsx` — `readOnlyOverlays`, `captionZone`, selecionado
  full-opacity, aviso de colisão.
- `web/src/steps/HookStep.tsx` — preview ao vivo + controles.
- `web/src/steps/OverlaysStep.tsx` — preview completo.
- Testes web: `overlayGeom.test.ts` (novos casos), `OverlayPreview.test.tsx`, `HookStep.test.tsx`
  (novo), `OverlaysStep.test.tsx`.

---

## 7. Decisões (não reabrir sem motivo)

1. Hook editável **no passo Hook** (não unificado no Textos).
2. Controles do hook agem no **título**; **subtítulo derivado** (sem controles próprios).
3. Colisão = **aviso visual** (faixa + contorno/⚠), **sem trava** automática.
4. Preview do editor mostra o **selecionado em opacidade cheia** (transform zerado); animação real
   validada no `/still`.
5. Zona da legenda é **aproximada** (refHeight 1080), só como guia visual.
6. `hookToOverlays` duplica no web o mapeamento do backend (título+subtítulo). Risco de drift
   pequeno e aceito; a verdade do render vem do backend/`/still`.

## 8. Riscos / atenção

- **Zod pinado 4.3.6** — não atualizar.
- Testes Remotion pré-quebrados (`AnimatedRoot.test.tsx`) — não são desta fase.
- `hookToOverlays` (web) vs geração no `build_recipe` (py): manter os dois em sincronia se a
  posição/tamanho do subtítulo mudar.
- Fonte fora das 4 suportadas cai para Inter no render (intencional).
- Preview usa refHeight 1080 (16×9); no 9×16 tamanhos/faixa são só aproximação — validar no render.

## 9. Entregável

Renderizar (via `/still`, 2–3 frames) provando: (a) hook numa posição/tamanho/fonte customizados;
(b) um texto manual posicionado fora da faixa da legenda; (c) no editor, a faixa da legenda
aparece e um bloco dentro dela é sinalizado. Build → `api/static`, push `main`, reiniciar uvicorn.
