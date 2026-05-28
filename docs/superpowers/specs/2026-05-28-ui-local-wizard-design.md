# Interface Local (Wizard) — Design

**Data:** 2026-05-28
**Status:** Aprovado para escrita de plano

## Objetivo

Substituir o fluxo de edição via chat por uma **interface web local** em estilo wizard, rodando em `localhost`, aberta dentro do Cursor (Simple Browser). O usuário sobe um vídeo, ajusta parâmetros, revisa transcrição, define hook, renderiza e baixa — tudo numa UI, sem digitar comandos.

A interface é também o **embrião do app web** que será deployado no Coolify: stack (FastAPI + React/Vite) é exatamente o que vai pro container. Quando chegar a hora do deploy, o front e o backend são reaproveitados sem reescrita; só muda a infra (Dockerfile, persistência).

## Decisões (resumo do brainstorming)

| Tema | Decisão |
|------|---------|
| Stack | **FastAPI** (backend) + **React/Vite + Tailwind** (front-end) |
| Padrão de UI | **Wizard** de 5 passos (linear, com voltar/próximo) |
| Onde roda | `localhost:8000`, aberto no Simple Browser do Cursor (`Cmd+Shift+P → Simple Browser`) |
| Backend processo | Single-process: FastAPI serve a API **e** os estáticos do React buildados |
| Extras v1 | **Progresso ao vivo no render** (SSE) |
| Fora da v1 | Modo automático 1-clique, editor de marca, histórico de jobs, autenticação, Dockerfile/Coolify |
| Persistência | Reutiliza `jobs/<slug>/` que já existe — nada novo |
| Idioma da UI | Português (PT-BR) |

## Abordagem escolhida

**Wizard de 5 passos** com botões "Voltar"/"Próximo". Cada passo faz **uma coisa**, lê/escreve os artefatos do job e chama um estágio do motor Python existente. Alternativa descartada: página única com todos os controles (mais flexível, mas mais confuso para uso linear).

## Arquitetura

### Estrutura do projeto

```
api/                    # FastAPI (NOVO)
  __init__.py
  app.py                # cria FastAPI, registra rotas, monta /static
  routes.py             # endpoints REST + SSE
  jobs.py               # serviço: envelopa pipeline/, emite eventos de progresso
  models.py             # request/response (pydantic)
  static/               # build do React (gerado por `npm run build`)
  tests/
    test_routes.py      # TestClient cobrindo o fluxo
web/                    # React + Vite + Tailwind (NOVO)
  package.json
  vite.config.ts        # proxy /api -> http://localhost:8000 (dev)
  tailwind.config.ts
  index.html
  src/
    main.tsx
    App.tsx             # roteia entre os 5 steps + barra de progresso
    api.ts              # client HTTP + helpers SSE
    types.ts            # tipos espelhando os pydantic
    state.ts            # estado do job atual (slug, stage, etc.)
    steps/
      UploadStep.tsx
      CutsStep.tsx
      TranscriptStep.tsx
      HookStep.tsx
      RenderStep.tsx
    components/
      Stepper.tsx       # indicador "1 → 2 → 3 → 4 → 5"
      Slider.tsx
      VideoPlayer.tsx
      ProgressBar.tsx
      Toast.tsx
pipeline/               # já existe — REUTILIZADO sem mudanças
remotion/               # já existe — REUTILIZADO sem mudanças
scripts/
  ui.sh                 # build do front + uvicorn + imprime URL
```

### Backend — rotas

Todas em `/api/...`. Respostas JSON. Erros 4xx com `{ "detail": "..." }` legível.

| Método | Rota | O que faz |
|--------|------|-----------|
| `POST` | `/jobs` | Cria job (multipart upload do vídeo). Body: arquivo + slug opcional. Retorna `{ slug, probe: {...} }` |
| `GET` | `/jobs/{slug}` | Estado completo do job (existência de cada artefato, config atual) |
| `PATCH` | `/jobs/{slug}/config` | Atualiza `JobConfig` (silence_threshold_db, padding, min_silence, whisper_model, hook_card_frames, etc.) |
| `POST` | `/jobs/{slug}/cut` | Roda `stage_cut` síncrono. Retorna `{ original_duration, trimmed_duration, segments: [...] }` |
| `POST` | `/jobs/{slug}/transcribe` | Roda `stage_transcribe` em background. SSE com `event: progress` e `event: done` (ou stream simples + 200 quando termina) |
| `GET` | `/jobs/{slug}/transcript` | Lê `transcript.json` |
| `PUT` | `/jobs/{slug}/transcript` | Sobrescreve `transcript.json` (após edição na UI) |
| `GET` | `/jobs/{slug}/hook` | Lê `hook.json` (ou sugere baseado na transcrição) |
| `PUT` | `/jobs/{slug}/hook` | Salva `hook.json` |
| `POST` | `/jobs/{slug}/recipe` | Roda `stage_recipe` síncrono |
| `POST` | `/jobs/{slug}/render` | Dispara `npx remotion render` para 16:9 e 9:16. SSE com progresso (parse do stdout do Remotion) e `event: done` com paths finais |
| `GET` | `/jobs/{slug}/files/{name}` | Stream de arquivos (`trimmed.mp4`, `output/<slug>-16x9.mp4`, `output/<slug>-9x16.mp4`, stills) |
| `GET` | `/jobs/{slug}/still?frame=N&format=main16x9` | Renderiza um still on-demand (para a prévia do hook) |

Estágios longos (transcribe, render) rodam em **`asyncio.create_task` + asyncio.Queue** alimentada por um worker; a rota SSE drena a queue para o cliente.

### Front-end — telas

1. **UploadStep**
   - Drop zone + `<input type="file" accept="video/*">`.
   - Ao soltar: `POST /jobs` (multipart). Mostra resolução, fps, duração da resposta.
   - "Próximo" habilita quando o upload retorna OK.

2. **CutsStep**
   - Sliders: `silence_threshold_db` (-50 a -10, default -30), `padding` (0 a 0.5, default 0.1), `min_silence` (0.2 a 2.0, default 0.5).
   - Botão **"Detectar pausas"** → `POST /cut`. Mostra: "removidos `X.X`s de `Y.Y`s (`Z%`)" + uma régua simples (barra horizontal com cores: verde = mantido, cinza = pausa cortada).
   - "Voltar" / "Próximo" (próximo só quando há cuts.json).

3. **TranscriptStep**
   - Dropdown de modelo: tiny / base / **small (default)** / medium.
   - Botão **"Transcrever"** → `POST /transcribe` (SSE com progresso simples: "carregando modelo", "transcrevendo", "pronto"). Quando termina, carrega `GET /transcript`.
   - Render: cada linha é uma row com inputs editáveis **por palavra** (mantém timestamps). Salvar (debounce 1s) → `PUT /transcript`.

4. **HookStep**
   - Inputs: `título`, `subtítulo`, `duração do card` (segundos → frames via fps do job).
   - **Sugestão automática:** clicar "Sugerir" pega a primeira frase da transcrição (até primeira `?` ou `.`) e preenche o título.
   - **Prévia ao vivo do card:** ao mudar título/subtítulo, refaz `GET /still?frame=30` (com debounce) e mostra a imagem. Roda `POST /recipe` ao avançar.

5. **RenderStep**
   - Botão **"Renderizar 16:9 + 9:16"** → `POST /render` (SSE).
   - **Barra de progresso ao vivo** (frames renderizados / total, para 16:9 e 9:16). Implementação: parser do stdout do Remotion ("Encoded 310/664") emite eventos `progress`.
   - Quando termina: dois `<video controls>` com os MP4s servidos pelo backend + botões "Baixar" (download) e "Abrir pasta" (link `file://` para `output/`).

### Cliente HTTP e SSE (web/src/api.ts)

Função `fetchJSON` e função `subscribeSSE(path, { onProgress, onDone, onError })` que usa `EventSource`. Tipos espelham `models.py` (request/response).

### Boot local

`scripts/ui.sh`:
```bash
# 1) builda o front
(cd web && npm run build && cp -r dist/* ../api/static/)
# 2) sobe FastAPI
export PATH="$ROOT/bin:$ROOT/.tools/node-.../bin:$PATH"
"$ROOT/.venv/bin/uvicorn" api.app:app --port 8000
```
Imprime `Abra http://localhost:8000 no Simple Browser do Cursor`.

Modo dev: `npm run dev` em `web/` (Vite porta 5173, proxy `/api` → `http://localhost:8000`) **e** uvicorn em paralelo.

## Tratamento de erros

- `POST /cut`/`/transcribe`/`/render` validam que os artefatos pré-requisito existem; se não, retornam 409 com mensagem.
- Falta de ffmpeg/ffprobe ou node detectada no boot → 503 com link pras instruções do README.
- SSE: se o subprocess falha, evento `event: error` com a stderr; UI mostra toast.
- Upload muito grande (>500MB inicialmente) → 413.

## Testes

- **API (pytest):** `TestClient` cobre o happy-path do fluxo end-to-end com um vídeo curto de fixture. Mocks de `subprocess.run` para ffmpeg/whisper nos testes unitários (já que esses são lentos); um teste de integração marca-do como `slow` roda de verdade.
- **Front (vitest):** testes puros para parser SSE, validador de `JobConfig`, lógica do stepper, sugestão de hook (primeira frase).
- **Visual:** os stills do Remotion já cobrem o card e overlay; nada novo aqui.

## Configuração

Tudo via env (preparando pro Coolify):
- `PORT` (default 8000)
- `JOBS_ROOT` (default `jobs/`)
- `OUTPUT_ROOT` (default `output/`)
- `BIN_PATH` (ffmpeg/ffprobe, default `bin/`)
- `NODE_PATH` (default `.tools/node-.../bin`)

## Escopo

**v1 (este spec):**
- 5 telas do wizard, backend FastAPI com as rotas acima, SSE no render, build local em `scripts/ui.sh`.
- Reutilização integral de `pipeline/` e `remotion/`; nenhuma reescrita do motor.
- Persistência via `jobs/<slug>/` (zero novo).

**Fora da v1 (futuro):**
- **Modo automático 1-clique** (botão "edite tudo" pulando checkpoints).
- **Editor de marca** (logo + cores + fontes via UI, sem mexer em `brand/brand.json`).
- **Histórico de jobs** + re-renderizar antigos.
- **Dockerfile + deploy Coolify** (Fase 2, sob spec próprio).
- **Autenticação / multi-usuário** (quando virar app web).
- **WebSocket bidirecional** (caso queiramos pause/cancel de jobs).

## Princípios

- **Reaproveitar tudo:** o motor Python e o projeto Remotion não mudam — a UI é só uma camada nova.
- **Linear e claro:** wizard guiado, uma decisão por tela.
- **Embrião realista:** a stack escolhida é a que vai pro Coolify; nada é throwaway.
- **YAGNI:** entrega o wizard + progresso ao vivo. Extras ficam pra depois.
