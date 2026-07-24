# Design: velocidade de transcrição/silêncio + previews de vídeo

**Data:** 2026-07-24
**Status:** aprovado (pré-implementação)

## Problema

Dois pontos no fluxo "Editar gravação":
1. Detecção de silêncio e transcrição estão lentas.
2. Não há preview de vídeo — nem no passo de corte de silêncio, nem no de legendas.
   O usuário só vê números/timeline, sem assistir ao resultado.

## Objetivo

Acelerar os passos lentos e adicionar previews de vídeo em dois pontos, sem alterar o
pipeline de edição em si.

## Decisões

- **Preview de legendas:** overlay simples (rodapé, linha atual destacada). O objetivo é
  conferir texto e sincronia, não replicar pixel-a-pixel o render Remotion.
- **Velocidade:** máxima — inclui trocar o modelo default de transcrição para `base`.

## Parte A — Velocidade (sem UI nova)

### Silêncio
- `pipeline/silence.py` `detect_silences`: adicionar `-vn` ao comando ffmpeg do
  `silencedetect` (pula a decodificação de vídeo; só o áudio importa).

### Transcrição — `pipeline/transcribe.py`
- **Cache do modelo** em nível de módulo, chaveado por `model_size`, para não recarregar
  os pesos (~500MB) a cada chamada.
- Chamar `model.transcribe(..., vad_filter=True, beam_size=1)`.
- **Default do modelo → `base`** (função `transcribe_audio`, o default da API, e o
  seletor da UI). O usuário ainda troca para small/medium quando quiser.

## Parte B — Servir o vídeo (já existe; reaproveitar)

**Nenhum backend novo necessário.** O endpoint `GET /api/jobs/{slug}/files/{name}`
([api/routes.py:143](api/routes.py#L143)) já serve `trimmed.mp4` (está em
`ALLOWED_FILES`), com:
- proteção contra path traversal via `allowed_file_path` (valida `name` contra a lista e
  confina o caminho ao diretório do job);
- suporte a HTTP Range (starlette `FileResponse` responde 206 a `Range`), necessário para
  o `<video>` fazer seek;
- 404 quando o arquivo não existe.

Os dois previews usam `trimmed.mp4`, então basta consumir esse endpoint. Adicionar um
helper no frontend `mediaUrl(slug, name)` em `web/src/api.ts` que devolve
`/api/jobs/{slug}/files/{name}`. (Servir `source.mp4` fica fora de escopo — não é
necessário.)

## Parte C — Preview do corte de silêncio (`web/src/steps/CutsStep.tsx`)

Após "Detectar pausas" (quando há `result`):
- `<video src="/api/jobs/{slug}/media?which=trimmed" controls>` abaixo da timeline —
  o usuário assiste ao resultado já cortado.
- A barra de timeline existente vira clicável: clicar num trecho mantido (verde) faz o
  `<video>` pular para `s.start` (via `ref` do elemento de vídeo, setando `currentTime`).

## Parte D — Preview das legendas (`web/src/steps/TranscriptStep.tsx`)

Quando há `lines`:
- `<video src="/api/jobs/{slug}/media?which=trimmed" controls>` com um overlay de
  legenda posicionado no rodapé (absolute sobre o vídeo).
- Um pequeno componente calcula, a partir do `currentTime` do vídeo (via evento
  `timeupdate`), qual linha do transcript está ativa e a exibe. Palavra atual destacada.
- A edição de palavras existente continua funcionando; o overlay reflete as edições
  porque lê do mesmo estado `lines`.

## Fluxo de dados

```
<video src=/api/jobs/{slug}/media?which=trimmed>
   │  timeupdate → currentTime
   ▼
overlay de legenda (client-side): acha a linha/palavra ativa no transcript já carregado
```
Nenhuma mudança no pipeline; o transcript e o trimmed.mp4 já existem no job.

## Componentes novos (frontend)

- Um componente reutilizável para a legenda ativa dado `currentTime` + `lines`
  (ex.: `web/src/components/CaptionOverlay.tsx`), para manter os steps focados e testável
  isoladamente.
- Uma função pura `activeLineIndex(lines, t)` (em `web/src/util.ts` ou junto do
  componente) para escolher a linha ativa — testável sem DOM.

## Tratamento de erros

- Vídeo ausente → 404 do endpoint existente (ex.: pedir `trimmed.mp4` antes de rodar o
  corte). A UI só monta o `<video>` depois que o passo relevante produziu o arquivo
  (CutsStep após o corte; TranscriptStep assume corte já feito no passo 2).
- Cache do modelo whisper: se o carregamento falhar, o erro propaga como hoje (SSE
  `error`).

## Testes

- **Backend:**
  - `detect_silences` continua detectando silêncios com o novo comando (`-vn`) — teste
    com um clipe gerado (tom/silêncio) afirmando que acha ao menos um silêncio.
  - Servir vídeo: o endpoint existente `GET /jobs/{slug}/files/trimmed.mp4` retorna 200 e
    responde 206 a um header `Range` (cobre a necessidade de seek do `<video>`). Reusa o
    endpoint atual — teste de regressão leve, sem novo endpoint.
  - Cache do modelo: `transcribe_audio` chamado 2x usa a mesma instância (patch/spy no
    construtor de `WhisperModel`).
- **Frontend:**
  - `activeLineIndex(lines, t)` escolhe a linha correta para tempos dentro/fora/limítrofes.
  - `CaptionOverlay` renderiza a linha ativa e destaca a palavra atual.
  - CutsStep: clicar num trecho da timeline seta `currentTime` do vídeo (mock do
    elemento) — ou, se custoso, testar via a função de mapeamento trecho→tempo.

Clipes de teste gerados via ffmpeg (`testsrc`/`sine`) para não depender de assets.

## Fora de escopo

- Preview fiel ao estilo final do Remotion (fonte/animação exatas).
- Preview do vídeo animado (já existe via `/still`).
- Edição de cortes por trecho (mover/adicionar/remover trechos manualmente) — hoje o
  corte é só por parâmetros de silêncio.
- Aceleração via whisper.cpp/CoreML (troca de dependência).
