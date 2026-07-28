# Fase E — Melhorias de UX no editor de textos/hook

**Data:** 2026-07-27
**Depende de:** Fases B–D (overlays, timeline, sugestões).
**Escopo:** editor web + paridade no render (Remotion) + campos no backend. 5 melhorias pedidas.

## Resumo das decisões (aprovadas)

1. **Aviso de sobreposição no tempo** entre dois textos.
2. **Ajuste fácil do tempo** (nudge −/+), sem mudar padrão de animação.
3. **Defaults configuráveis** de entrada/saída/permanência.
4. **Separar posição de quebra**: arrastar só move; **slider "Largura"** (`maxWidthPct`) controla o wrap. Vale texto e hook.
5. **Guias de alinhamento + snap**: centro do vídeo (X/Y) e centro de outros textos/hook. (bordas = follow-up.)

## Modelo de dados

- `Overlay` e `Hook` ganham **`maxWidthPct: number`** (default 80). Renderizado como
  `maxWidth: "{v}%"` no preview (OverlayPreview) E no render (OverlayLayer + hook), pra bater.
- `SuggestDefaults` (o "estilo padrão") ganha **`enter`, `exit`, `durationInFrames`,
  `maxWidthPct`**. Defaults: `enter="slide-up"`, `exit="fade"`, `durationInFrames=75` (2,5s),
  `maxWidthPct=80`. Usados por `newOverlay` (texto novo) e `suggestionToOverlay` (aplicar sugestão).
- Backend acompanha: `OverlayParams.maxWidthPct` (int, default 80), `Hook.maxWidthPct`,
  `SuggestDefaults` com os 4 campos novos. Schema Remotion `OverlayParams` idem.

## #1 — Aviso de sobreposição no tempo

- Helper puro `overlapsInTime(a, b)` em `web/src/overlayGeom.ts`: `a.fromFrame < b.fromFrame +
  b.durationInFrames && b.fromFrame < a.fromFrame + a.durationInFrames`.
- Em `OverlaysStep`, calcular o conjunto de ids que se sobrepõem no tempo com QUALQUER outro
  (`overlappingIds: Set<string>`).
- Sinais visuais (sem trava):
  - **Preview**: `OverlayPreview` recebe `timeOverlapIds?: Set<string>`; desenha ⚠ + contorno
    âmbar no bloco (reaproveita o padrão do aviso de legenda).
  - **Lista**: item com ⚠ ao lado do tempo.
  - **Timeline**: barra do overlay em tom de alerta quando no conjunto.

## #2 — Nudge do início

- No painel do texto selecionado, ao lado de "Início (s)": botões **−** e **+** que deslocam a
  janela inteira (`fromFrame`) em ±3 frames (~0,1s a 30fps), mantendo `durationInFrames`.
  Clamp `fromFrame ≥ 0`. Helper reutiliza `patch`. `aria-label`: "recuar início" / "avançar início".

## #3 — Defaults de entrada/saída/permanência (configuráveis)

- O painel "Estilo padrão" (já existe pras sugestões) ganha selects **Entrada** e **Saída**
  (`OverlayAnim`) e um controle **Permanência (s)** (mapeia pra `durationInFrames = round(s*fps)`).
- `newOverlay(fromFrame, id, defs)` e `suggestionToOverlay(s, defs, id)` passam a herdar
  `enter/exit/durationInFrames/maxWidthPct` de `defs`.
- Persistidos via `PUT /suggest-defaults` (debounce já existe).

## #4 — Largura do texto (posição ≠ quebra)

- Arrastar já só move (deixar explícito na copy do passo). Sem quebra manual.
- Novo controle **"Largura"** (range 20–100) no painel do texto selecionado E no passo Hook,
  ligado a `maxWidthPct`.
- `OverlayPreview.styleFor`: `maxWidth: "{ov.maxWidthPct ?? 80}%"`.
- Render: `OverlayLayer` e o bloco do hook usam `maxWidth: "{maxWidthPct}%"` (paridade).
- `overlayHook.hookToOverlays` propaga `maxWidthPct` do hook pros overlays derivados.
- `recipe.py` (backend) inclui `maxWidthPct` nos overlays do hook e mantém dos manuais.

## #5 — Guias de alinhamento + snap

- Helper puro `snapPosition(x, y, targetsX, targetsY, threshold=0.012)` em `overlayGeom.ts`:
  se `|x - t| < threshold` pro `t` mais próximo em `targetsX`, retorna `x=t` e `guideX=t`
  (senão `guideX=null`); idem Y. Retorna `{ x, y, guideX, guideY }`.
- `OverlayPreview`:
  - targets = `[0.5]` (centro do vídeo) + `x`/`y` dos demais overlays editáveis (exceto o
    arrastado) + dos `readOnlyOverlays` (hook).
  - No `onPointerMove`, aplica `snapPosition` antes de `onMove`, e guarda `guides` em estado
    interno; desenha **linha vertical** em `guideX` (altura cheia) e **horizontal** em `guideY`
    (largura cheia), cor ciano, só durante o arraste. Limpa no `pointerUp`.
- Como HookStep e OverlaysStep usam o mesmo `OverlayPreview`, os dois passos ganham as guias.

## Paridade de animação/estilo

- `maxWidthPct` no preview e no render deve casar (ambos `maxWidth: %` sobre a largura). O teste
  de paridade `overlayAnimParity` continua cobrindo só `overlayProgress` (inalterado).

## Testes (TDD)

- **overlayGeom**: `overlapsInTime` (cruzam / encostam / disjuntos); `snapPosition` (snap X só,
  Y só, ambos, nenhum; escolhe alvo mais próximo).
- **OverlayPreview**: com `timeOverlapIds` desenha ⚠ no bloco; `maxWidthPct` vira `maxWidth`;
  durante arraste perto do centro aparece a linha-guia (via snapPosition).
- **suggestions/overlay defaults**: `suggestionToOverlay` herda enter/exit/dur/maxWidthPct de defs;
  `newOverlay` idem.
- **OverlaysStep**: nudge −/+ muda o início; slider largura muda `maxWidthPct`; ⚠ na lista quando
  dois textos se cruzam no tempo; painel de defaults tem Entrada/Saída/Permanência.
- **Backend**: `OverlayParams`/`Hook`/`SuggestDefaults` aceitam os campos novos (roundtrip);
  `recipe.py` inclui `maxWidthPct` nos overlays do hook.
- **Remotion**: (type-check) `TOverlay` tem `maxWidthPct`; `OverlayLayer` usa.

## Fora de escopo

- Snap nas **bordas** dos outros textos (só centros por ora).
- Quebra de linha manual (multilinha) — escolhido o slider de largura.
- Guias/alinhamento entre texto e faixa da legenda (já há o aviso de colisão).
