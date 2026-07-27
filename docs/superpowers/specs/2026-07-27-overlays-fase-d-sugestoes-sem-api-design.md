# Fase D — Sugestões de texto (sem API, geradas pelo Claude da sessão)

**Data:** 2026-07-27
**Depende de:** Fase C / C.1 / C.2 (editor de overlays + timeline + preview no play).
**Muda o plano D original:** NÃO usa a API/SDK da Anthropic nem chave. As sugestões são
geradas pelo Claude **desta sessão** (plano do usuário), gravadas num arquivo, e o app só
apresenta para aceitar/descartar. Zero IA no servidor.

## Princípio

Divisão de trabalho:
- **Geração** = feita pelo Claude no chat, sob demanda ("gera sugestões pro <job>"),
  seguindo a skill `ad-creative` (vendorizada em `.claude/skills/ad-creative/`). Escreve
  `jobs/<slug>/suggestions.json`.
- **App** = lê o arquivo, mostra um painel de sugestões, e ao **Aplicar** cria um texto
  real no **estilo padrão** que o usuário definiu. Nada de rede/IA no backend.

## Fluxo do usuário

1. **Define o estilo padrão** das sugestões (posição, fonte, cor, tamanho) — um mini-painel
   no passo Textos. Persistido em `jobs/<slug>/suggest-defaults.json`.
2. **Pede a geração no chat.** O Claude escreve `suggestions.json`.
3. No editor, **painel "Sugestões (N)"**: cada card = texto + tempo + tipo + fala de origem,
   com **[✓ Aplicar] [✗ Pular]** e um botão **↻ Recarregar**.
   - **Aplicar** → cria um overlay com o texto/tempo da sugestão + o **estilo padrão** atual;
     entra na lista de textos e some das sugestões.
   - **Pular** → some das sugestões (não vira texto).
   - **Recarregar** → relê `suggestions.json` (depois que o Claude gerou).
4. **Calibração individual**: aplicado, é um texto comum — edita posição/tempo/estilo à vontade
   (já existe na Fase C).

## Modelo de dados

### `jobs/<slug>/suggestions.json`
Lista de sugestões (só conteúdo + metadados, **sem estilo** — o estilo vem do padrão no aplicar):
```json
[
  {
    "id": "sug_01",
    "text": "R$ 6–15 mil / ano",
    "fromFrame": 810,
    "durationInFrames": 60,
    "kind": "short",            // "short" | "dense"
    "angle": "urgency",         // ângulo ad-creative (pain/outcome/social/curiosity/...)
    "source": "meio milhão custa de 6 a 15 mil reais por ano"  // fala que originou (grounding)
  }
]
```

### `jobs/<slug>/suggest-defaults.json`
Estilo padrão único aplicado ao aceitar:
```json
{ "x": 0.5, "y": 0.12, "anchor": "center", "fontSize": 64, "fontFamily": "", "color": "" }
```
Defaults se o arquivo não existir: `x=0.5, y=0.12, anchor="center", fontSize=64, fontFamily="", color=""`
(topo, acima da faixa da legenda).

### Overlay criado ao Aplicar
```
{
  id: novo (ov_...),
  type: "text",
  text: sug.text,
  fromFrame: sug.fromFrame,
  durationInFrames: sug.durationInFrames,
  x, y, anchor, fontSize, fontFamily, color: <do suggest-defaults>,
  highlightColor: "",
  enter: "slide-up", exit: "fade",
  enterDurationInFrames: 12, exitDurationInFrames: 12,
}
```

## Backend (`api/`)

Espelha o padrão de overlays. Nada de rede.

- `GET /jobs/{slug}/suggestions` → conteúdo de `suggestions.json` (ou `[]` se não existe).
- `PUT /jobs/{slug}/suggestions` → grava a lista (usado ao Pular/Aplicar para persistir o
  que sobrou). Corpo: lista de sugestões.
- `GET /jobs/{slug}/suggest-defaults` → objeto (ou os defaults acima se não existe).
- `PUT /jobs/{slug}/suggest-defaults` → grava o objeto.
- Modelos pydantic `Suggestion` e `SuggestDefaults` em `api/models.py`.
- `stage_refine` apaga `suggestions.json` junto de overlays/transcript (recorte invalida tempos)
  — manter `suggest-defaults.json` (é preferência de estilo, não depende do vídeo).

## Frontend (`web/`)

Tudo no passo Textos (`OverlaysStep.tsx`), reusando o que já existe.

### Painel "Estilo das sugestões"
Controles: posição (x/y via arraste no preview OU presets Topo/Centro/Baixo + campos),
fonte (dropdown `FONTS`), cor, tamanho. Ao mudar → `PUT /suggest-defaults` (debounce).

### Painel "Sugestões (N)"
- Carrega via `GET /suggestions`. Vazio → mostra dica: "Peça no chat: 'gera sugestões pro
  <slug>'. Depois clique ↻ Recarregar."
- Cada card: `text`, `(fromFrame/fps).toFixed(1)+"s"`, badge do `kind`, e o `source` em cinza.
- **Aplicar** (`aria-label="aplicar sugestão <id>"`): monta o overlay (helper puro
  `suggestionToOverlay(sug, defaults, newId)`), adiciona a `overlays`, remove de `suggestions`,
  seleciona o novo, e persiste ambos (`PUT /overlays` já existe no Salvar; `PUT /suggestions`).
- **Pular** (`aria-label="pular sugestão <id>"`): remove de `suggestions` + `PUT /suggestions`.
- **↻ Recarregar** (`aria-label="recarregar sugestões"`): re-GET `/suggestions`.

### Novo helper `web/src/suggestions.ts`
```ts
export type Suggestion = {
  id: string; text: string; fromFrame: number; durationInFrames: number;
  kind: "short" | "dense"; angle: string; source: string;
};
export type SuggestDefaults = {
  x: number; y: number; anchor: "center" | "left" | "right";
  fontSize: number; fontFamily: string; color: string;
};
export function suggestionToOverlay(s: Suggestion, d: SuggestDefaults, id: string): Overlay;
```
`suggestionToOverlay` é pura e testável (aplica o estilo padrão + defaults de animação).

## Como o Claude gera (procedimento, não código)

Ao pedido "gera sugestões pro <slug>":
1. Ler `jobs/<slug>/transcript.json` (grounding), `hook.json`, brand kit e
   `suggest-defaults.json` (contexto).
2. Seguir `ad-creative`: definir 3–5 **ângulos**; para cada beat relevante da fala, 1–2 textos
   **curtos** e/ou **densos**, específicos, com número quando houver, **rastreando a fala**
   (`source`) e **sem inventar** claim/número.
3. Posicionar tempos (`fromFrame ≈ start*fps`, `durationInFrames` curto ~45–75). Evitar
   encavalar a legenda (o estilo padrão já nasce no topo).
4. Escrever `jobs/<slug>/suggestions.json` com ids `sug_01..`.

Isso vive como nota em `docs/` e na memória — é o "run" que o usuário dispara.

## Testes (TDD)

- **Backend** (`api/tests/test_routes.py`): GET vazio → `[]` / defaults; PUT+GET roundtrip para
  suggestions e suggest-defaults; `stage_refine` remove `suggestions.json` e mantém
  `suggest-defaults.json`.
- **suggestionToOverlay** (`web/src/__tests__/suggestions.test.ts`): aplica x/y/anchor/fontSize/
  fontFamily/color do defaults; copia text/fromFrame/durationInFrames; injeta enter/exit padrão;
  usa o id passado.
- **OverlaysStep**: painel de sugestões lista itens do GET; **Aplicar** move para a lista de
  textos com o estilo padrão (novo overlay com a fonte/cor/posição do defaults) e some das
  sugestões; **Pular** remove; estado vazio mostra a dica de gerar no chat.

## Fora de escopo

- Qualquer chamada à API/SDK da Anthropic ou chave.
- Botão no app que gera sozinho (claude CLI headless).
- Grounding avançado da `ad-creative` (corpus de reviews/comments/winning-ads) — aqui a única
  fonte é a transcrição do próprio vídeo.
- Geração multi-idioma, tradução, ou reescrita da fala.
