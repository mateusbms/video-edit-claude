# Texto animado no vídeo — Fases B, C, D (design/spec)

> **Para quem for implementar em outra sessão:** este spec é auto-contido. Comece por
> `superpowers:writing-plans` para gerar o plano de tarefas de cada fase, depois
> `superpowers:subagent-driven-development`. Implemente **B → C → D em ordem**: B cria o
> motor de overlays; C constrói o editor sobre ele; D adiciona a IA sobre o editor.
> Trabalho autorizado em `main` (padrão desta sessão). Commits com
> `Co-Authored-By: Claude Opus 4.8`.

**Objetivo geral:** permitir texto com animação de entrada/saída **dentro** do vídeo gravado
(sobre a imagem), substituindo a tela-card de hook por um overlay sobre o início do vídeo,
com editor manual e sugestões da IA ancoradas nos tempos da transcrição.

**Data:** 2026-07-25
**Autor da sessão anterior:** aprovado pelo usuário nas 4 fases (A já entregue).

---

## 0. Estado atual (o que já existe)

Fase A entregue: legendas com estilo editável (tamanho/posição/cor/destaque/fonte) + brand kit
por projeto no modo gravado.

**Motor de render (Remotion), modo gravado** — composições `Recorded16x9`/`Recorded9x16`
(via `remotion/src/Root.tsx`; `Main16x9.tsx`/`Vertical9x16.tsx` renderizam `Timeline`).
A `Timeline` ([remotion/src/Timeline.tsx](remotion/src/Timeline.tsx)) desenha, sobre um
`AbsoluteFill`:
1. `segments[]` em `<Sequence>` — hoje: um `card` (HookCard, tela cheia) seguido de um `clip`
   (SourceClip, o vídeo `trimmed.mp4`).
2. `<CaptionLayer captions={} style={} />` — legendas.
3. `<OverlayLayer overlays={} />` — **já existe**, hoje só desenha um `lowerThird` fixo no
   canto superior-esquerdo durante o card ([remotion/src/components/OverlayLayer.tsx](remotion/src/components/OverlayLayer.tsx)).

**Modelo de dados da recipe** ([pipeline/recipe.py](pipeline/recipe.py) →
`edit-recipe.json`, validado por [remotion/src/schema.ts](remotion/src/schema.ts)):
- `segments`: `card` (`title`,`subtitle`,`durationInFrames`) + `clip`.
- `captions[]`: linhas com `fromFrame`/`durationInFrames`/`words[]`, **deslocadas por
  `hook_card_frames`** (o offset do card).
- `overlays[]`: hoje `{type, fromFrame, durationInFrames, text}` — schema `zOverlay`.
- `captionStyle`: resolvido de caption_style + brand kit.

**Hook hoje** ([web/src/steps/HookStep.tsx](web/src/steps/HookStep.tsx),
[pipeline/recipe.py:92-98](pipeline/recipe.py)): `hook.json` = `{title, subtitle,
duration_frames}`. `build_recipe` cria o segmento `card` de `hook_card_frames` frames ANTES do
clip e desloca todas as legendas por esse offset. **É exatamente a "tela antes do vídeo" que o
usuário não quer.**

**Config/estado por job** ([pipeline/job.py](pipeline/job.py) `JobConfig`;
[api/models.py](api/models.py) `JobState`): campos escalares persistidos em
`job.config.json`; artefatos derivados em arquivos (`transcript.json`, `hook.json`,
`edit-recipe.json`). Endpoints relevantes em [api/routes.py](api/routes.py): `/recipe`,
`/hook`, `/caption-style`, `/brand-kit`, `/refine`, `/render`, `/still`.

**Sem LLM no backend hoje.** Só ElevenLabs via `httpx`. Fase D introduz o primeiro uso de
Claude no backend.

**Princípio de invalidação** (já usado em `stage_refine`): quando `trimmed.mp4` muda,
apaga-se `transcript.json` e `edit-recipe.json`. Overlays manuais (Fase C) precisam
sobreviver a re-transcrição mas **não** a um refine que mude a timeline — ver §3.5.

---

## 1. O motor de overlays (fundação compartilhada por B, C, D)

Todas as três fases produzem/consomem a **mesma** lista `overlays[]` na recipe. A Fase B
estabelece o formato rico; C edita; D sugere. Definir isto certo agora evita retrabalho.

### 1.1 Formato do overlay (novo `zOverlay`)

Substituir o `zOverlay` atual (só `text`) por um objeto rico, **retrocompatível** (campos
novos opcionais com default). Schema em [remotion/src/schema.ts](remotion/src/schema.ts):

```ts
export const zOverlayAnim = z.enum(["fade", "slide-up", "slide-down", "pop", "none"]);

export const zOverlay = z.object({
  id: z.string(),                 // estável, para edição/react keys (ex. "ov_ab12cd")
  type: z.string().default("text"),   // "text" | "lowerThird" (legado) | "hook"
  text: z.string(),
  fromFrame: z.number(),
  durationInFrames: z.number(),
  // posição em fração do frame [0..1], canto/âncora central do bloco
  x: z.number().default(0.5),
  y: z.number().default(0.18),
  anchor: z.enum(["center", "left", "right"]).default("center"),
  fontSize: z.number().default(64),
  color: z.string().default(""),        // "" => usa brand.foreground
  highlightColor: z.string().default(""),
  fontFamily: z.string().default(""),   // "" => usa brand.fonts.headline
  enter: zOverlayAnim.default("slide-up"),
  exit: zOverlayAnim.default("fade"),
  enterDurationInFrames: z.number().default(12),
  exitDurationInFrames: z.number().default(12),
});
```

**Retrocompat:** o `lowerThird` legado tem só `{type,fromFrame,durationInFrames,text}`. Como
todos os campos novos têm `.default(...)`, recipes antigas continuam validando. Mas como a
Fase B **remove** a geração do `lowerThird` (§2), na prática só recipes já em disco o teriam;
aceitar mesmo assim.

### 1.2 Componente de render (`OverlayLayer` reescrito)

Reescrever [remotion/src/components/OverlayLayer.tsx](remotion/src/components/OverlayLayer.tsx)
para renderizar **todos** os overlays ativos (hoje usa `findActive` que devolve só um — trocar
por filtro de todos os ativos), cada um posicionado por `x/y/anchor`, com animação de entrada
E saída:

- Entrada: nos primeiros `enterDurationInFrames` do overlay, interpola conforme `enter`.
- Saída: nos últimos `exitDurationInFrames`, interpola conforme `exit`.
- `fade`: opacity 0→1 / 1→0. `slide-up`: translateY(+40→0) + fade. `slide-down`:
  translateY(−40→0)+fade. `pop`: `spring` scale 0.7→1 (usar `theme.spring`). `none`: hard cut.
- Posição: `AbsoluteFill` sem padding; bloco posicionado via
  `left: x*100%`, `top: y*100%`, `transform: translate(-50%, -50%)` ajustado por `anchor`
  (left → `translate(0,-50%)`, right → `translate(-100%,-50%)`).
- Cores/fonte: `color || brand.foreground`, `resolveFont(fontFamily || brand.fonts.headline)`.
  `OverlayLayer` precisa receber o `brand`/tema — hoje usa `theme` importado; passar
  `captionStyle`-like defaults ou o `theme` já resolvido. Manter simples: usar `theme` (já
  populado do brand kit no build da composição) + overrides do overlay.

Extrair a matemática de entrada/saída para `remotion/src/overlay-utils.ts` (testável sem
render): `overlayProgress(frame, overlay) => {opacity, translateY, scale}`. **TDD isto.**

### 1.3 Fração vs pixels

Overlays guardam posição/tamanho em **frações do frame** (`x`,`y` ∈ [0,1]) e `fontSize` em
px de um canvas de referência de **largura 1920** (mesma convenção da legenda na Fase A). Assim
o mesmo overlay serve 16×9 e 9×16 e o preview do editor (Fase C) escala por
`clientWidth/1920`, reusando o padrão do `previewScale` de
[web/src/steps/TranscriptStep.tsx:31-39](web/src/steps/TranscriptStep.tsx).

---

## 2. Fase B — Hook como overlay animado (dentro do vídeo)

**Meta:** o título do hook aparece como texto animado **sobre o início do vídeo**, não como
tela-card antes dele. Remover o segmento `card` e o offset de legendas.

### 2.1 Mudanças no backend (`pipeline/recipe.py`, `build_recipe`)

- **Remover** o segmento `card` de `segments[]`. `segments` passa a ser só o `clip`
  (`inFrame:0`, `outFrame:trimmed_frames`). `source.trimmedFrames` inalterado.
- **`hook_card_frames` → 0 no cálculo das legendas.** Hoje cada caption soma `hook_card_frames`.
  Com o card removido, o offset é 0: as legendas voltam a começar em `t=0` do clip. **Manter o
  parâmetro `hook_card_frames` na assinatura** (default 0) para não quebrar chamadas/testes,
  mas o `stage_recipe` deixa de passá-lo (ou passa 0).
- **Gerar o overlay de hook** em `overlays[]` a partir de `hook.json`:
  ```python
  hook_overlay = {
      "id": "ov_hook",
      "type": "hook",
      "text": hook["title"],
      "fromFrame": 0,
      "durationInFrames": hook.get("duration_frames", 90),
      "x": 0.5, "y": 0.16, "anchor": "center",
      "fontSize": 84, "color": "", "highlightColor": "",
      "fontFamily": "",
      "enter": "slide-up", "exit": "fade",
      "enterDurationInFrames": 12, "exitDurationInFrames": 12,
  }
  ```
  O `subtitle` do hook: renderizar como segunda linha do mesmo overlay (o componente hook pode
  quebrar `text` em título+subtítulo) OU um segundo overlay logo abaixo. **Decisão: segundo
  overlay** `y:0.24`, `fontSize:40`, `type:"text"`, mesmo `fromFrame`/`durationInFrames`,
  entrada com pequeno atraso (`fromFrame + 6`) — mais simples de editar depois na Fase C.
  Se `subtitle` vazio, não emitir o segundo overlay.
- **`overlays[]` agora é a lista completa** (hook + eventuais overlays manuais/IA persistidos —
  ver §3.5 sobre de onde vêm os manuais). Na Fase B, só os de hook.
- **Remover** o `lowerThird` fixo antigo.

`hook_card_frames` como conceito de "card" desaparece do produto, mas o campo
`hook.duration_frames` passa a significar "duração do overlay de hook".

### 2.2 Mudanças no Remotion

- `Timeline.tsx`: `segments` sem `card` → só renderiza o clip. `HookCard.tsx` fica órfão
  (deixar o arquivo, não referenciar; ou remover — **remover** e apagar sua importação).
- `OverlayLayer.tsx`: reescrito conforme §1.2 (já cobre `type:"hook"` como um overlay de texto
  grande centralizado no topo).
- Como não há mais `card`, o vídeo começa no frame 0 e o hook sobrepõe os primeiros ~90 frames.

### 2.3 Mudanças no frontend (`HookStep.tsx`)

- O passo Hook continua editando `title`/`subtitle`/`duration_frames`, mas o texto de ajuda
  muda: "aparece sobre o início do vídeo". A prévia (`stillUrl` no frame 30) agora mostra o
  vídeo com o texto por cima — nenhuma mudança de código na prévia além de talvez escolher um
  frame onde o overlay esteja visível (frame 20).

### 2.4 Testes (TDD)

- `tests/test_recipe.py`:
  - `segments` não contém `type=="card"`; contém exatamente um `clip`.
  - `captions[0]["fromFrame"]` == `seconds_to_frames(start, fps)` (sem offset de card).
  - `overlays` contém um item `type=="hook"` com `text==hook.title`, `fromFrame==0`.
  - subtítulo vazio ⇒ nenhum overlay de subtítulo; subtítulo preenchido ⇒ overlay extra.
  - **Atualizar** `test_build_recipe_offsets_captions_by_hook_card` — esse teste codifica o
    comportamento ANTIGO (card + offset). Reescrever para o novo contrato (é uma mudança de
    comportamento intencional, não uma regressão).
- Remotion: `remotion/src/__tests__/overlay-utils.test.ts` — `overlayProgress` nas bordas
  (frame 0 = opacity 0, meio = 1, últimos frames = fade-out).

### 2.5 Entregável B

Renderizar um job real e confirmar visualmente (via `/still` em 2-3 frames) que o texto do
hook aparece sobre o vídeo com fade/slide e some, e que o vídeo já não tem tela-card preta no
começo.

---

## 3. Fase C — Editor manual de overlays

**Meta:** o usuário adiciona/edita blocos de texto sobre a timeline do vídeo: escolhe o
intervalo (in/out), posição (arrastar no preview), texto, tamanho, cor, animação de
entrada/saída. Depende de B (motor + formato rico).

### 3.1 Onde na UI

Novo passo **"5. Textos"** entre Hook e Render (ou uma aba dentro do passo de legendas —
**decisão: passo próprio**, para não sobrecarregar a tela de transcrição já densa). Componente
`web/src/steps/OverlaysStep.tsx`. Registrar no wizard (`App.tsx` / `Stepper.tsx`).

### 3.2 Persistência (backend)

- Novo artefato `overlays.json` no diretório do job: lista de overlays **manuais** (schema =
  §1.1, sem os de hook — o hook continua derivado de `hook.json`).
- Endpoints em [api/routes.py](api/routes.py):
  - `GET /jobs/{slug}/overlays` → devolve `overlays.json` (ou `[]`).
  - `PUT /jobs/{slug}/overlays` → grava a lista (valida com um `OverlayParams` pydantic novo em
    [api/models.py](api/models.py), espelhando `zOverlay`; hex opcional via `Hex`).
- `stage_recipe`/`build_recipe`: passar `manual_overlays` e concatenar
  `overlays = [hook_overlays...] + [manual_overlays...]`. Ordem não importa para render
  (todos filtrados por frame), mas manter hook primeiro.
- `build_recipe` ganha parâmetro `overlays: list[dict] | None = None` (os manuais);
  `stage_recipe` lê `overlays.json` se existir.

### 3.3 UI do editor (`OverlaysStep.tsx`)

Layout: à esquerda o **preview do vídeo** (`<video src=trimmed.mp4>`) com os overlays ativos
desenhados por cima (reusar/adaptar um `OverlayPreview` React análogo ao `CaptionOverlay`, com
`previewScale = clientWidth/1920`); à direita/abaixo a **lista de overlays** + form do
selecionado.

Interações:
- **Adicionar**: botão "+ Texto" cria overlay com `fromFrame` = frame atual do player,
  `durationInFrames` = 60, texto placeholder, no centro-topo.
- **Selecionar**: clicar num item da lista ou no bloco no preview.
- **Mover**: arrastar o bloco no preview → atualiza `x`,`y` (converter px→fração).
- **Tempo**: dois campos "início (s)" / "fim (s)" OU botões "marcar início/fim no tempo atual"
  (reusar o padrão de marcação in/out do fine-cut de `CutsStep.tsx`). Converter s↔frame com
  `fps` do probe.
- **Propriedades**: texto, tamanho (range), cor, cor de destaque, fonte (select das 4 fontes
  suportadas — `["Inter","Poppins","Montserrat","Roboto"]`), animação de entrada e de saída
  (selects com as opções de `zOverlayAnim`), durações de entrada/saída.
- **Remover**: botão por item.
- **Salvar**: debounce → `PUT /overlays` (padrão de `HookStep`/`TranscriptStep`). Após salvar,
  opcionalmente re-rodar `/recipe` para a prévia via `/still` refletir.

`id` gerado no cliente (ex. `ov_${Date.now().toString(36)}` — mas atenção: sem `Date.now`
determinístico em testes; em runtime do browser é ok. Nos testes de unidade, injetar ids).

### 3.4 Preview de animação no editor

Reusar `overlayProgress` (§1.2) no componente React de preview para que o bloco anime conforme
o `currentTime` do player (entrada/saída visíveis ao arrastar a linha do tempo). Fonte única de
verdade da matemática de animação entre Remotion e o preview web = `overlay-utils`
(TS compartilhado; se o web não importar do pacote remotion, duplicar a função pequena com um
teste que garanta paridade, ou mover para um util compartilhado). **Decisão: mover
`overlayProgress` para um módulo TS simples importável pelos dois** (ex.
`remotion/src/overlay-utils.ts` importado pelo web via path relativo, já que é monorepo local;
se o build do web não alcançar, duplicar com teste-espelho).

### 3.5 Invalidação e sobrevivência

- `overlays.json` é **independente** de `trimmed.mp4`? Não totalmente: os `fromFrame`/`out` dos
  overlays manuais referem-se à timeline do vídeo trimado. Um **refine** (que re-corta
  `trimmed.mp4`) muda o mapeamento de tempo → os overlays manuais podem ficar fora de lugar.
  **Decisão (YAGNI):** ao refazer corte em `stage_refine`, **apagar `overlays.json`** junto de
  `transcript.json`/`edit-recipe.json`, e avisar na UI do fine-cut ("recortar remove textos
  manuais"). Reancorar automaticamente é escopo demais.
- Overlays manuais **sobrevivem** a re-transcrição (transcrição não mexe em `overlays.json`).

### 3.6 Testes (TDD)

- Backend: `GET/PUT /overlays` round-trip; validação rejeita hex inválido; `build_recipe`
  concatena hook + manuais; `stage_refine` apaga `overlays.json`.
- Remotion/utils: `overlayProgress` já coberto em B; adicionar conversão px↔fração se extraída.
- Web: `OverlaysStep` — adicionar cria item; editar campo atualiza estado; remover tira da
  lista; salvar chama `putOverlays` com o payload certo (mock de fetch, padrão dos testes web
  existentes com `test-setup.ts`).

### 3.7 Entregável C

Adicionar 2 textos manuais em tempos diferentes, posições diferentes, animações diferentes;
salvar; renderizar; confirmar por `/still` que aparecem/animam nos frames certos.

---

## 4. Fase D — Sugestões da IA para overlays

**Meta:** Claude sugere overlays (texto curto + intervalo ancorado nas palavras da transcrição
+ animação), o usuário aceita/edita/descarta; aceitos entram em `overlays.json` (Fase C).
Depende de C (o editor é onde as sugestões pousam).

### 4.1 Backend — cliente Claude

- Novo módulo `pipeline/suggest_overlays.py` (ou `api/suggest.py`). Usar o SDK `anthropic`
  (adicionar a `requirements.txt`) OU `httpx` direto contra a Messages API (o projeto já usa
  `httpx` para ElevenLabs — **decisão: `anthropic` SDK** por robustez de tool-use/JSON).
  Modelo: `claude-sonnet-5` (rápido/barato o suficiente; qualidade boa para copy curta).
- Chave: env `ANTHROPIC_API_KEY` (adicionar a `.env.example`). Se ausente, endpoint responde
  503 com mensagem clara (padrão do TTS quando falta chave). Considerar um `SUGGEST_MODE=mock`
  espelhando `TTS_MODE=mock` para testar o pipeline sem chamar a API (retorna sugestões
  fixas). **Incluir o mock — o TTS já provou o valor disso para dev local.**
- Input do prompt: a transcrição (`transcript.json` — palavras com `start`/`end`), o título do
  hook, e o brand (tom). Pedir saída **estruturada** (tool-use / JSON schema) = lista de
  `{text, startWord, endWord|start, end, enter, exit, reason}`. Converter `start`/`end` (s) →
  `fromFrame`/`durationInFrames` com `fps`, e completar defaults do §1.1 no backend (posição
  default alternando topo/base para não sobrepor legendas).
- Regras de negócio no backend (não confiar só no modelo): limitar a N sugestões (ex. 5),
  clampar intervalos a `[0, trimmed_duration]`, garantir `durationInFrames>=15`, evitar
  sobreposição com a faixa de legenda (default `y<=0.3` topo).

### 4.2 Endpoint

- `POST /jobs/{slug}/suggest-overlays` → roda o modelo, devolve `{suggestions: [overlay...]}`
  (mesmo formato `zOverlay`, com `id` gerado e um campo extra `reason` para exibir). **Não**
  grava nada — sugestão é efêmera até o usuário aceitar. Pode ser SSE (padrão dos outros
  endpoints longos) ou request simples (poucos segundos) — **decisão: request simples** com
  spinner; é uma chamada, não um pipeline.

### 4.3 Frontend (dentro de `OverlaysStep`)

- Botão "✨ Sugerir textos (IA)" → chama o endpoint, mostra as sugestões numa lista separada
  ("Sugestões") com o `reason`, cada uma com "Aceitar" (move para a lista de overlays manuais,
  vira editável) e "Descartar". "Aceitar todas".
- Sugestão aceita = overlay normal da Fase C (editável, salvo em `overlays.json`).

### 4.4 Testes (TDD)

- Backend com `SUGGEST_MODE=mock`: endpoint devolve sugestões no formato certo; conversão
  s→frame correta; clamp de intervalos; limite de N; `id` presente. **Não** chamar a API real
  nos testes.
- Conversão palavra→tempo: se o modelo devolver `startWord`/`endWord`, mapear para os
  `start`/`end` das palavras da transcrição.
- Web: botão dispara fetch (mock); aceitar move de "sugestões" para "overlays" e persiste.

### 4.5 Entregável D

Com `SUGGEST_MODE=mock` e depois com chave real: gerar sugestões de um job real, aceitar 1-2,
renderizar, confirmar que entraram como overlays animados corretos.

---

## 5. Ordem de implementação e dependências

```
B (motor + formato rico + hook overlay)  ──►  C (editor manual)  ──►  D (sugestões IA)
```

- **B** é pré-requisito duro de C e D (define `zOverlay` rico, `OverlayLayer`, `overlay-utils`).
- **C** é pré-requisito de D (as sugestões pousam no editor e em `overlays.json`).
- Cada fase: projetada→plano (`writing-plans`)→construída (`subagent-driven-development`)→
  revisada (`code-reviewer`)→entregue com render real, antes da próxima. Checkpoint com o
  usuário entre fases (padrão da Fase A).

## 6. Arquivos tocados (mapa)

**Fase B**
- `remotion/src/schema.ts` — novo `zOverlay` rico + `zOverlayAnim`.
- `remotion/src/components/OverlayLayer.tsx` — reescrito (todos ativos, x/y, enter/exit).
- `remotion/src/overlay-utils.ts` — **novo**, `overlayProgress` (+ teste).
- `remotion/src/Timeline.tsx` — remove `card`; `remotion/src/components/HookCard.tsx` removido.
- `pipeline/recipe.py` — `build_recipe`: sem card, offset 0, gera overlay(s) de hook.
- `pipeline/stages.py` — `stage_recipe` deixa de passar `hook_card_frames` (ou passa 0).
- `tests/test_recipe.py` — reescrever teste do card; novos asserts de overlay.
- `web/src/steps/HookStep.tsx` — copy/ajuste de prévia.

**Fase C**
- `api/models.py` — `OverlayParams`.
- `api/routes.py` — `GET/PUT /overlays`.
- `pipeline/stages.py` — `stage_recipe` lê `overlays.json`; `stage_refine` apaga `overlays.json`.
- `pipeline/recipe.py` — `build_recipe(overlays=...)` concatena.
- `web/src/steps/OverlaysStep.tsx` — **novo** editor.
- `web/src/components/OverlayPreview.tsx` — **novo** (desenho + drag).
- `web/src/api.ts` — `getOverlays`/`putOverlays`.
- `web/src/App.tsx`/`Stepper.tsx` — novo passo "Textos".
- Testes web + backend.

**Fase D**
- `requirements.txt` — `anthropic`; `.env.example` — `ANTHROPIC_API_KEY`, `SUGGEST_MODE`.
- `pipeline/suggest_overlays.py` — **novo** (com modo mock).
- `api/routes.py` — `POST /suggest-overlays`.
- `web/src/steps/OverlaysStep.tsx` — botão + painel de sugestões.
- `web/src/api.ts` — `suggestOverlays`.
- Testes (mock).

## 7. Decisões já tomadas (não reabrir sem motivo)

1. Formato de overlay **rico e retrocompatível** desde a Fase B (defaults nos campos novos).
2. Posição em **frações** [0,1]; `fontSize` em px de canvas 1920 (igual à legenda).
3. Hook subtítulo = **segundo overlay** (não linha embutida).
4. `overlays.json` **separado** de `hook.json`; hook derivado, manuais persistidos.
5. Refine (recorte) **apaga** overlays manuais (YAGNI, sem reancoragem automática) + aviso na UI.
6. Editor manual = **passo próprio** no wizard, não aba da transcrição.
7. Sugestões IA = **`anthropic` SDK**, `claude-sonnet-5`, com **`SUGGEST_MODE=mock`**, saída
   estruturada, regras de clamp/limite no backend, sugestão **efêmera** até aceite.
8. `overlayProgress` = fonte única de animação entre Remotion e preview web.

## 8. Riscos / pontos de atenção

- **Zod pinado 4.3.6** — não atualizar ao mexer no schema (regressão de render conhecida).
- **Testes Remotion pré-existentes quebrados** (`AnimatedRoot.test.tsx`, tipos
  `toBeInTheDocument` no modo animado) — não são destas fases; não confundir com regressão.
- Fonte fora das 4 suportadas cai para Inter no render (comportamento intencional, silencioso).
- Preview web vs render Remotion: paridade só é garantida se a matemática de animação for
  compartilhada (§3.4) — validar sempre com `/still` real, não só no preview.
- Sobreposição overlay×legenda: manter overlays default no topo (`y<=0.3`), legenda no rodapé.
```
