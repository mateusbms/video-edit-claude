# Design: progresso percentual nos passos (corte, transcrição, render)

**Data:** 2026-07-24
**Status:** aprovado (pré-implementação)

## Problema

Os passos lentos do fluxo "Editar gravação" não mostram progresso consistente:
- **Render** tem barra por formato, mas o fix recente dos IDs de composição quebrou a
  chave (emite `Recorded16x9`, a UI espera `Main16x9`) → barra sumiu.
- **Transcrição** só mostra um texto de etapa ("loading_model"), sem %.
- **Corte** é um POST síncrono, sem progresso nenhum.

## Objetivo

Barra de progresso percentual **real** nos três passos, reutilizando a `ProgressBar`
existente e o padrão de SSE que o render já usa.

## Fontes de progresso

- **Subprocess ffmpeg** (corte): rodar com `-progress pipe:1 -nostats`, parsear
  `out_time_us=` → segundos; `% = out_time / duração_cortada`.
- **Loop Python** (transcrição): iterar os segmentos do faster-whisper; `info.duration`
  dá o total; `% = segment.end / info.duration`.
- **Render**: já emite `Rendered N/total` (inalterado); só corrige a chave.

## Infra de progresso (backend)

Novo helper assíncrono `run_with_progress(blocking_fn)` (em `api/progress.py`):
- Roda `blocking_fn(progress_cb)` numa thread via `run_in_executor`.
- `progress_cb(n, total)` faz `loop.call_soon_threadsafe` de um evento na `asyncio.Queue`.
- O gerador async drena a fila e faz `yield sse_event(...)`; ao terminar, emite `done`
  (com o resultado retornado por `blocking_fn`) ou `error`, e para num sentinela.

Isso unifica corte e transcrição (ambos trabalho bloqueante em thread).

## Mudanças por passo

### Corte
- `pipeline/silence.py`:
  - Nova função pura `parse_ffmpeg_progress(line) -> float | None` (segundos a partir de
    `out_time_us=`).
  - `cut_segments(src, segments, out_path, total_duration=None, progress_cb=None)`: roda
    ffmpeg com `-progress pipe:1 -nostats` via `Popen`, lê linha a linha e chama
    `progress_cb(min(t, total), total)`. `progress_cb`/`total_duration` opcionais
    (retrocompatível).
- `pipeline/stages.py` `stage_cut(job, progress_cb=None)`: calcula
  `total = soma das durações dos trechos mantidos` e repassa para `cut_segments`.
- `api/routes.py` `POST /jobs/{slug}/cut`: de JSON síncrono → **SSE**
  (`run_with_progress`), emitindo `progress {n, total}` e um `done` com o `CutResult`
  (original_duration, trimmed_duration, segments).

### Transcrição
- `pipeline/transcribe.py` `transcribe_audio(path, model_size="base", language="pt",
  progress_cb=None)`: usa `info.duration` como total; ao iterar os segmentos, chama
  `progress_cb(min(seg.end, total), total)`. `words_from_segments` permanece puro (recebe
  um gerador que reporta progresso).
- `pipeline/stages.py` `stage_transcribe(job, progress_cb=None)`: repassa o callback.
- `api/routes.py` `POST /jobs/{slug}/transcribe`: usa `run_with_progress`, emitindo
  `progress {n, total}` por segmento (mantém um `progress {stage:"loading_model"}` inicial).

### Render (corrigir regressão)
- `api/routes.py` `run_render`: emitir a **chave lógica** (`main16x9`/`vertical9x16`) no
  campo `format` do SSE, em vez do ID de composição. O loop passa a carregar
  `(fmt_key, composition, out_name)`.

## Frontend

- `web/src/api.ts`: remover `runCut` (vira SSE); `CutsStep` usa `streamSSE` direto, como o
  `RenderStep`. (Manter `streamSSE`, `fileUrl`, etc.)
- `web/src/steps/CutsStep.tsx`: `streamSSE` para `/cut`; `ProgressBar` durante o corte;
  `CutResult` vem do evento `done` → alimenta resumo/timeline/preview já existentes.
- `web/src/steps/TranscriptStep.tsx`: guardar `{n,total}` do `progress` e mostrar
  `ProgressBar` durante a transcrição (no lugar do texto de etapa).
- `web/src/steps/RenderStep.tsx`: indexar `prog` por `main16x9`/`vertical9x16`.

Nenhuma mudança na `ProgressBar` (aceita `label`, `n`, `total`); para corte/transcrição,
`n`/`total` são segundos.

## Tratamento de erros

- Falha do ffmpeg no corte / erro na transcrição → `blocking_fn` levanta exceção →
  `run_with_progress` emite `error {detail}` (a UI já trata `error`).
- Endpoints que viram SSE mantêm o contrato de eventos (`progress`/`done`/`error`) que o
  `streamSSE` do frontend já entende.

## Testes

**Backend:**
- `parse_ffmpeg_progress`: linhas `out_time_us=1500000` → 1.5; linha irrelevante → None.
- `run_with_progress`: dado um `blocking_fn` trivial que chama `progress_cb` algumas vezes
  e retorna um dict, a saída contém eventos `progress` e um `done` com o dict (drenar o
  gerador async via `asyncio.run`).
- `transcribe_audio`: modelo mockado com `info.duration` e segmentos → `progress_cb`
  chamado com `seg.end` crescente; resultado igual ao `words_from_segments`.
- `stage_cut` (ffmpeg): clipe curto com silêncio → `progress_cb` recebe ao menos uma
  chamada e `trimmed.mp4` é gerado.
- `POST /cut` (SSE, TestClient): clipe curto → ≥1 `progress` e um `done` com `CutResult`.

**Frontend:**
- `CutsStep`: mock de `streamSSE` (emite progress e done com CutResult) → `ProgressBar`
  durante, resumo/timeline/preview no fim.
- `TranscriptStep`: mock de `streamSSE` → `ProgressBar` durante a transcrição.
- `RenderStep`: mock de `streamSSE` emitindo `format:"main16x9"` → barra 16:9 aparece.

Clipes via ffmpeg; whisper mockado.

## Fora de escopo

- Progresso da própria detecção de silêncio (rápida com `-vn`); o % do corte cobre a
  fase lenta (re-encode).
- Estimativa de tempo restante (ETA) além do que a `ProgressBar` já mostra.
- Cancelamento de tarefa em andamento.
