# Design: juntar múltiplos arquivos num vídeo

**Data:** 2026-07-24
**Status:** aprovado (pré-implementação)

## Problema

O fluxo "Editar gravação" processa **um arquivo por projeto**. Gravações humanas para
campanhas do Facebook às vezes vêm em partes separadas (o mesmo vídeo gravado em
múltiplos arquivos). Hoje não há como uni-las na ferramenta — só editar cada arquivo
isoladamente.

## Objetivo

Permitir que o usuário suba **N arquivos** e a ferramenta os concatene, na ordem
escolhida, num único vídeo que segue pelo pipeline existente de edição.

## Princípio central

O pipeline inteiro (cut de silêncio → transcrição → recipe → render) opera sobre um
único `jobs/<slug>/source.mp4`, gerado no `stage_ingest`. A junção acontece **num único
ponto**: o ingest passa a concatenar N arquivos em `source.mp4`. Daí pra frente, nada
muda. Um upload de 1 arquivo mantém exatamente o comportamento atual.

## Decisões

- **Estratégia de concatenação:** rápido com fallback. Tenta concat sem recodificar
  (`concat` demuxer + `-c copy`, instantâneo) quando todos os arquivos têm mesma
  resolução, fps e codecs; cai automaticamente pro re-encode (filtro `concat`,
  normalizando para os parâmetros do primeiro arquivo, H.264 + AAC) quando divergem ou
  quando o caminho rápido falha.
- **Reordenação na UI:** setas ↑/↓ + remover. Simples e confiável para poucas partes.

## Componentes

### Backend

- **`pipeline/concat.py` (novo) — `concat_videos(paths: list[str], dest: str)`**
  - Faz probe de cada arquivo.
  - Se todos compartilham `(width, height, fps, codec de vídeo, codec de áudio)` →
    concat demuxer com `-c copy`.
  - Caso divirjam → re-encode com filtro `concat`, normalizando para a
    resolução/fps do **primeiro** arquivo (H.264 + AAC).
  - Se o caminho rápido falhar em runtime, faz fallback para o re-encode.
  - Erra explicitamente se algum arquivo não tiver stream de vídeo.
  - Áudio preservado em ambos os caminhos (`a=1` no filtro `concat`).

- **`pipeline/stages.py` — `stage_ingest(job, src_paths: list[str])`**
  - Assinatura passa a receber lista. 1 item → copia (comportamento atual). N itens →
    `concat_videos()`. Resultado sempre em `jobs/<slug>/source.mp4`; probe gravado como
    hoje.

- **`api/routes.py` — `POST /jobs`**
  - Aceita `files: list[UploadFile]` em vez de `file: UploadFile`.
  - Salva cada arquivo em `input/<slug>-part{N}{ext}` preservando a ordem do array.
  - Passa a lista ordenada para `stage_ingest`.
  - Um único arquivo continua funcionando (lista de tamanho 1).
  - Zero arquivos → HTTP 400.

### Frontend

- **`web/src/steps/UploadStep.tsx`**
  - Input de arquivo com `multiple`.
  - Estado passa de `File | null` para `File[]`.
  - Lista renderizada com botões ↑ / ↓ / remover por item.
  - "Enviar" manda todos os arquivos na ordem da lista.
  - Probe exibido continua sendo o do resultado final (`source.mp4`), já retornado pela
    resposta do endpoint.

- **`web/src/api.ts` — `uploadJob`**
  - Monta `FormData` com múltiplos campos `files` na ordem da lista.

### Sem alterações

cut, transcribe, recipe, render, e todos os steps seguintes do wizard.

## Fluxo de dados

```
[UploadStep] usuário escolhe N arquivos, ordena com ↑/↓
   │  FormData { files: [part0, part1, ...], slug }
   ▼
POST /jobs
   │  salva input/<slug>-part0.ext ... part{N}.ext
   ▼
stage_ingest(job, [part0, part1, ...])
   │  1 arquivo → copy
   │  N arquivos → concat_videos()
   │        ├─ params iguais → concat demuxer -c copy
   │        └─ divergem      → re-encode filtro concat (normaliza p/ 1º arquivo)
   ▼
jobs/<slug>/source.mp4   ← ponto único de convergência
   ▼
[cut → transcribe → recipe → render]  (inalterado)
```

## Tratamento de erros

- Arquivo sem stream de vídeo → erro claro no ingest, propagado como HTTP para a UI.
- Falha no concat rápido apesar de params compatíveis → fallback automático pro
  re-encode, sem falhar para o usuário.
- Zero arquivos enviados → HTTP 400 "envie ao menos um arquivo".
- Ordem garantida pelo índice do array → nome `part{N}` → lista passada ao ffmpeg.

## Testes

- `concat_videos` com 2 clipes de mesma resolução/fps → caminho copy; duração do
  resultado ≈ soma das durações.
- `concat_videos` com resoluções diferentes → caminho re-encode; resolução do resultado
  = a do 1º arquivo; duração ≈ soma.
- `concat_videos` com 1 arquivo → equivale a copiar.
- `POST /jobs` com múltiplos arquivos → job criado, probe do resultado retornado.
- `UploadStep` (front) → adicionar, reordenar (↑/↓) e remover arquivos, seguindo o
  padrão dos testes em `web/src/__tests__/`.

Clipes de teste gerados via ffmpeg (`testsrc`) para não depender de assets grandes.

## Fora de escopo

- Transições/crossfade entre partes (concatenação é corte seco).
- Reordenação por drag-and-drop.
- Alinhamento de áudio/normalização de volume entre partes.
