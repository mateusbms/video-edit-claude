# Pipeline de Edição de Vídeo Automatizada — Design

**Data:** 2026-05-27
**Status:** Aprovado para escrita de plano

## Objetivo

Receber uma filmagem crua (talking-head, PT-BR) e produzir automaticamente:

- uma versão **16:9** polida (estilo YouTube/horizontal), e
- **recortes 9:16** (Reels/TikTok/Shorts)

com **corte de pausas**, **legendas animadas** palavra-a-palavra, **card de abertura/hook**, **overlays de motion-graphics** e **transições**, usando a **identidade visual da marca do usuário**.

O fluxo roda em **estágios com checkpoints**: o agente executa cada estágio, reporta o resultado e aguarda aprovação do usuário antes de seguir.

A ferramenta é **projetada para também suportar, no futuro, geração de vídeos 100% sintéticos** (motion-graphics do zero, estilo do `SENDKIT-PH-PROMPT.md`) reaproveitando a fundação. Esse modo é **v2** (ver seção "Futuro"); a **v1 implementa a edição de filmagem real**.

## Decisões (resumo do brainstorming)

| Tema | Decisão |
|------|---------|
| Formatos | 16:9 **e** recortes 9:16 a partir do mesmo vídeo |
| Tooling | Pode instalar tudo localmente (Homebrew/pip/npm) |
| Hook | Tratamento completo: cold-open + overlay de título + base para escolher recortes verticais |
| Disparo/workflow | Estágios com **checkpoints de revisão** |
| Idioma | Português (PT-BR) |
| Marca | Usuário tem marca própria (logo/cores/fontes) — coletada no setup |
| Nível visual | Tratamento completo (acabamento nível Sendkit) |
| Abordagem | A — pipeline centrado em Remotion |
| Modo "do zero" | Projetar para ambos, **construir edição primeiro**; sintético é v2 |

## Abordagem escolhida

**Abordagem A — pipeline centrado em Remotion.** O Remotion é a camada de composição/render final; o pré-processamento (corte de pausas, transcrição) é feito em Python; a detecção de hook é feita pelo agente (Claude) lendo a transcrição.

Abordagens descartadas:

- **B (ffmpeg + legendas ASS):** leve, mas motion-graphics/overlays e reenquadre vertical ficam muito limitados — não entrega o tratamento completo.
- **C (SaaS/API):** custo recorrente e pouco controle de marca; contraria a escolha de rodar local.

## Arquitetura

### Estrutura do repositório

```
input/                 # usuário joga o vídeo cru aqui
output/                # renders finais (16:9 e 9:16)
brand/
  brand.json           # tokens da marca (cores, fontes, logo, handle)
  assets/              # logo, fontes
jobs/<slug>/           # tudo de um vídeo específico
  source.mp4           # cópia/ref do vídeo cru
  job.config.json      # params de auto-editor/whisper (ajustáveis sem código)
  cuts.json            # saída do estágio de corte
  trimmed.mp4          # vídeo sem pausas
  transcript.json      # transcrição com timestamp por palavra
  edit-recipe.json     # FONTE DE VERDADE da timeline (consumida pelo Remotion)
  renders/             # saídas intermediárias/finais do job
pipeline/              # Python
  cut_pauses.py        #   auto-editor → trimmed.mp4 + cuts.json
  transcribe.py        #   faster-whisper → transcript.json
  build_recipe.py      #   cuts.json + transcript.json (+ hooks) → edit-recipe.json
  probe.py             #   ffprobe → metadados / validação de ingest
remotion/              # projeto Remotion (React/TS)
  src/
    Root.tsx           #   registra composições
    Main16x9.tsx
    Vertical9x16.tsx
    Timeline.tsx       #   renderiza segmentos polimórficos da recipe
    components/
      SourceClip.tsx   #   <OffthreadVideo> com in/out + reenquadre
      HookCard.tsx     #   abertura/hook animada
      Captions.tsx     #   legendas palavra-a-palavra
      Overlays.tsx     #   lower-third de título + ênfase em palavra-chave
      Transitions.tsx  #   wrappers de @remotion/transitions
    theme.ts           #   design system lido de brand/brand.json
    schema.ts          #   tipos/validação (zod) da edit-recipe
  public/              # source + assets do job atual
scripts/
  edit-video.sh        # orquestrador: roda estágios, para nos checkpoints
docs/superpowers/specs/
```

### Modelo de job

Cada vídeo vira um **job** em `jobs/<slug>/` que acumula todos os artefatos. Isso torna o pipeline reproduzível, os estágios re-rodáveis e os checkpoints naturais (cada estágio escreve seu artefato; o próximo lê o anterior).

### Estágios e checkpoints

- **Estágio 0 — Ingest:** copia o vídeo pro job; `probe.py` lê resolução/fps/duração e valida o codec; normaliza fps se necessário.
- **Estágio 1 — Cortar pausas** (`cut_pauses.py` → `auto-editor`): gera `trimmed.mp4` + `cuts.json` (segmentos mantidos mapeados ao timecode original).
  - **Checkpoint 1:** reportar quanto foi cortado; usuário ajusta `silence_threshold`/`padding` em `job.config.json` e re-roda.
- **Estágio 2 — Transcrever** (`transcribe.py` → `faster-whisper`, PT-BR): gera `transcript.json` com timestamp por palavra, segmentado em linhas de legenda.
  - **Checkpoint 2:** usuário revisa a transcrição (nomes, termos técnicos); agente aplica correções.
- **Estágio 3 — Hook & recipe** (Claude + `build_recipe.py`): o agente lê a transcrição, escolhe o hook principal para o cold-open 16:9, marca trechos candidatos para verticais e sugere o título de abertura; `build_recipe.py` monta o `edit-recipe.json`.
  - **Checkpoint 3:** usuário aprova/ajusta hook, título e quais trechos viram recorte vertical.
- **Estágio 4 — Compor & renderizar** (Remotion):
  - **16:9:** hook card → cold-open opcional do hook → corpo com legendas + overlays + transições.
  - **9:16:** um por trecho aprovado, reenquadrado (center-crop com foco horizontal), com legendas e hook card.
  - **Checkpoint 4 (opcional):** preview leve (`remotion still` em frames-chave, ou render de um trecho curto) antes do render full.
  - Finais vão para `output/`.

Os estágios são **idempotentes** e re-rodáveis isoladamente; se um estágio falha, os artefatos anteriores permanecem e retomamos do último estágio bom.

### `edit-recipe.json` — a peça central (timeline polimórfica)

Única fonte de verdade que o Remotion lê. Lista ordenada de **segmentos polimórficos**, cada um com um `type`:

- `clip` — referência a um trecho da filmagem real (`source`, `inFrame`, `outFrame`, `reframe`).
- `card` — cartela animada (ex.: hook/abertura: `title`, `subtitle`, `logo`).
- `scene` — **(v2)** cena 100% animada por componente (motion-graphics). Não implementado na v1, mas reservado no schema.

Além dos segmentos, a recipe carrega: `captions` (linhas com palavras + timestamps), `overlays` (eventos de lower-third/ênfase com `from`/`duration`), e `formats` (settings por 16:9 e 9:16). Validado por `schema.ts` (zod).

Essa polimorfia é o que mantém a **camada de render compartilhada** entre "editar real" (segmentos `clip`/`card`) e "do zero" (segmentos `scene`, v2). `Timeline.tsx` faz o dispatch por `type`.

### Componentes Remotion

- **`theme.ts`** — tokens da marca (cores, fontes, logo, springs) lidos de `brand/brand.json`.
- **`<SourceClip>`** — `<OffthreadVideo>` com in/out e reenquadre horizontal (foco) para o vertical.
- **`<HookCard>`** — abertura animada (logo spring-in + título do hook + subtítulo), estilo Sendkit.
- **`<Captions>`** — legendas palavra-a-palavra (`@remotion/captions`), palavra ativa destacada, posicionadas na safe-zone de cada formato.
- **`<Overlays>`** — lower-third de título e "pop" de ênfase em palavras-chave, data-driven pela recipe.
- **`<Transitions>`** — wrappers de `@remotion/transitions` entre segmentos/cortes.

### Marca / configuração

`brand/brand.json`: `{ logo, colors{}, fonts{}, handle, lowerThirdStyle }`. O usuário fornece logo + cores + fontes; `theme.ts` carrega. Coletado no setup do primeiro job.

### Reenquadre vertical (v1)

Center-crop com **ponto de foco horizontal ajustável por trecho** (rosto costuma estar no centro). Legenda no terço inferior, hook card no topo. **Sem face-tracking automático** na v1.

## Dependências

- **Homebrew:** `ffmpeg`, `node`.
- **Python (venv):** `auto-editor`, `faster-whisper`.
- **npm:** Remotion 4.x + `@remotion/captions`, `@remotion/transitions`, `@remotion/google-fonts`, `zod`.

## Tratamento de erros

- Ingest valida codec/fps e normaliza quando preciso.
- Params voláteis (auto-editor/whisper) vivem em `job.config.json` — re-runs sem mexer no código.
- Estágios escrevem artefatos de forma atômica no job; em falha, o job retém o estado anterior e o pipeline retoma do último estágio bom.
- `schema.ts` valida o `edit-recipe.json` antes do render (erro claro se a recipe estiver malformada).

## Testes

- **Fixture curta (10–20s)** para validar o pipeline inteiro rápido.
- **Unitário (Python):** lógica de `build_recipe.py` (de `cuts.json` + `transcript.json` → `edit-recipe.json`) com fixtures.
- **Visual (Remotion):** `remotion still` em frames-chave (hook card, um frame de legenda, um overlay) no checkpoint de preview.
- **Validação final:** `ffprobe` no render (duração coerente, tem áudio, resolução correta por formato).

## Escopo

**v1 (este spec):**
- Corte de pausas, legendas PT-BR animadas, hook card + cold-open, overlays básicos (título + ênfase), 16:9 + 9:16 center-crop, workflow com checkpoints, marca própria.
- Schema da recipe já polimórfico (`clip | card | scene`), com `clip` e `card` implementados.

**Fora da v1 (futuro):**
- **Modo "do zero" (v2 — sintético, estilo Sendkit):** reaproveita `theme.ts`, `Timeline.tsx`, `HookCard`, `Captions`, `Overlays`, `Transitions` e a orquestração de render. Adiciona: tipo de segmento `scene`, uma **biblioteca de templates de cena** (motion-graphics reutilizáveis), integração de **TTS** (ex.: ElevenLabs) e timing "audio-first". Terá seu próprio spec.
- Face-tracking no reenquadre vertical.
- B-roll, trilha sonora/efeitos, tradução EN, watch-folder automático, auto-clipping multi-hook.

## Princípios

- **YAGNI:** v1 entrega a edição de ponta a ponta; o sintético é projetado, não construído.
- **Reproduzível:** tudo flui por artefatos versionáveis (`edit-recipe.json` é a fonte de verdade).
- **Compartilhar a fundação:** a polimorfia de segmentos evita reescrever a camada de render quando o modo "do zero" chegar.
- **Checkpoints:** o usuário aprova transcrição, cortes e hook antes do render final.
