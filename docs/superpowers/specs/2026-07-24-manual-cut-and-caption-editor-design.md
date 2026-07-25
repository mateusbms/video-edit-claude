# Design: corte manual fino + editor de legendas + fix de teste

**Data:** 2026-07-24
**Status:** aprovado (pré-implementação)

## Escopo

1. Corrigir as 4 falhas pré-existentes de `web/src/__tests__/state.test.ts` (localStorage).
2. **Corte manual fino** na tela de corte: após o corte automático de silêncio, permitir
   remover manualmente trechos indesejados que o automático não pegou.
3. **Editor de legendas mais legível** (hoje achatado).

## Parte 0 — Fix `state.test.ts`

Adicionar um polyfill mínimo de `localStorage` (Storage in-memory) em
`web/src/test-setup.ts`, definido apenas se ausente. Corrige as 4 falhas sem tocar em
`state.ts`.

## Parte 1 — Corte manual fino

### Modelo de interação
Trabalha sobre o `trimmed.mp4` (vídeo já cortado), em **tempo do vídeo cortado**:
- Dando play no preview, botões **"Marcar início"** e **"Marcar fim"** capturam
  `videoRef.currentTime` e formam um trecho a remover.
- Lista dos trechos a remover, com remover individual e limpar tudo; mini-timeline sobre
  `[0, duração]` destacando em vermelho o que sai.
- **"Aplicar cortes"** re-corta o `trimmed.mp4` removendo esses trechos, com barra de
  progresso (reusa o SSE + ffmpeg do passo de corte).

### Backend
- `pipeline/silence.py` — `invert_ranges(remove: list[Segment], duration) -> list[Segment]`:
  complemento dos trechos a remover sobre `[0, duration]` (ordena, faz clamp, funde
  sobreposições). Função pura.
- `pipeline/stages.py` — `stage_refine(job, remove_ranges, progress_cb=None) -> float`:
  lê a duração do `trimmed.probe.json`, calcula `keep = invert_ranges(...)`, re-corta o
  `trimmed.mp4` (via `cut_segments` para um temp, depois substitui) e reprobeia; retorna a
  nova duração. Erro se não sobrar nada.
- `api/models.py` — `RefineParams { remove: list[CutSegmentOut] }` (reusa `CutSegmentOut`
  com `start`/`end`).
- `api/routes.py` — `POST /jobs/{slug}/refine` (SSE via `run_with_progress`): emite
  `progress` durante o re-corte e um `done {trimmed_duration}`.

### Frontend (`web/src/steps/CutsStep.tsx`)
- Estado: `remove: {start,end}[]`, um "in" pendente, e um contador `refineVersion` para
  cache-bust do vídeo.
- Sob o preview: display do tempo atual + "Marcar início"/"Marcar fim"; lista + mini-timeline;
  "Aplicar cortes" via `streamSSE` para `/refine`.
- Ao concluir: atualiza `result.trimmed_duration`, limpa a lista, e força reload do vídeo
  (`src = mediaUrl(...) + "?v=" + refineVersion`).
- O corte manual é opcional; "Próximo" continua habilitado com o `result` do corte.

## Parte 2 — Editor de legendas legível (`web/src/steps/TranscriptStep.tsx`)

Só layout, mantendo edição por palavra e os timestamps:
- Área mais alta e arejada (container maior, rolagem vertical).
- Fonte maior (`text-base`), espaçamento generoso entre palavras (`gap`) e entre linhas
  (`leading`/padding por linha).
- Cada legenda numa linha própria: timestamp como rótulo à esquerda, palavras fluindo;
  realce sutil no hover da linha.
- Inputs de palavra com largura mínima maior e sublinhado discreto (texto fluido, não
  campos espremidos).

## Tratamento de erros

- `/refine` sem trechos ou que removeria tudo → `error` no SSE (a UI já trata `error`).
- Após refinar, uma transcrição pré-existente fica desatualizada (fluxo normal é refinar
  antes de transcrever); o usuário re-transcreve se preciso. Fora de escopo tratar isso.

## Testes

**Backend:**
- `invert_ranges`: remover no meio → 2 trechos; nas bordas; sobreposto; vazio → tudo.
- `/refine` (SSE, TestClient): clipe curto já "cortado" → remover um trecho → `progress` +
  `done` com `trimmed_duration` menor que a original.

**Frontend:**
- CutsStep: após o corte (mock SSE), "Marcar início" + "Marcar fim" adiciona um item à
  lista de remoção; "Aplicar cortes" chama o `streamSSE` de `/refine`.
- TranscriptStep: teste atual (palavras editáveis) continua válido — layout não muda a
  semântica.
- `state.test.ts`: passa após o polyfill.

Clipes via ffmpeg; whisper/SSE mockados onde couber.

## Fora de escopo

- Edição por linha/frase das legendas (mantém por palavra).
- Alças arrastáveis na timeline (marcação é por início/fim no player).
- Reconciliar transcrição já feita com um refino posterior.
- Desfazer/refazer dos cortes manuais.
