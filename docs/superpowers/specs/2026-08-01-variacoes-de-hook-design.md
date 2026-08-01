# Design — Variações de hook

Data: 2026-08-01

## Problema

O usuário publica vários vídeos com o **mesmo corpo** e só o **hook falado**
diferente (primeira fala + legenda dela + texto do hook animado). Hoje cada
variação exige o pipeline inteiro: upload, corte de pausas, cortes manuais,
transcrição completa e render — com reencode do corpo a cada vez. O objetivo:
editar o corpo **uma vez** e fazer cada variação custar só o processamento do
clipe do hook (segundos) mais o texto digitado.

## Decisões do brainstorm

1. **A escolha nasce na criação do projeto**: toggle no Upload — "matriz de
   variações de hook (só o corpo)". Projetos normais seguem o fluxo de hoje,
   intocado.
2. **Base = só o corpo** (sem hook falado). Todo hook — inclusive o primeiro
   vídeo publicado — entra como variação. Nada de marcar fronteira de hook em
   vídeo pronto (fora de escopo).
3. **Matriz é só matriz**: não renderiza. Wizard curto (Upload → Cortes →
   Transcrição → Textos → Concluir).
4. **Um hook por vez** (upload unitário). Lote de hooks = fase 2, se o volume
   justificar.
5. **Tudo automático após o upload do hook**; o usuário cai direto no passo
   do texto do hook da variação. Corte de pausas do hook usa os sliders da
   matriz.
6. **Variações são projetos independentes** na lista, com nome sugerido
   editável (`<matriz>-h1`, `-h2`, …). Excluir/renomear/liberar já funcionam.
   Sem agrupamento visual (fase futura, se incomodar).
7. **Textos manuais e sugestões da matriz vêm já na v1**, deslocados pelo
   delta do hook.
8. **Abordagem A — composição física com deslocamento**: a variação nasce com
   `trimmed.mp4` próprio (hook cortado + corpo concatenados) e artefatos
   fundidos. Depois de criada, é um projeto normal e autossuficiente —
   receita, render, invalidações e tela de projetos funcionam sem saber que
   houve composição. Excluir a matriz não afeta variações.

Alternativas descartadas: composição virtual na receita (B — quebra a
autossuficiência do diretório e invade o render) e hardlinks (C —
complexidade de filesystem para economizar o que "Liberar espaço" já
resolve).

## Modelo de dados

- `job.config.json`: novo campo `papel: "normal" | "matriz"` (default
  `"normal"`; projetos existentes não mudam) e, nas variações,
  `origem_matriz: "<slug>"` — só informativo/exibição.
- `JobSummary` e `JobState` expõem `papel` e `origem_matriz`.
- A variação nasce **sem `source.mp4` de propósito**: o estado "sem source"
  já existe (mesmo do "Liberar espaço") e trava o "Detectar pausas" — que
  seria desastroso numa variação (re-cortaria a partir de um source que
  seria só o hook). `bytes_parts` idem: o clipe do hook é processado em
  arquivo temporário dentro do diretório da variação e removido no fim.

## Backend

### `POST /jobs` (mudança pequena)

Ganha o campo de form opcional `papel` (`"normal"` default | `"matriz"`),
gravado no `job.config.json` pelo fluxo normal de criação. Nenhuma outra
mudança no upload.

### Rota

`POST /api/jobs/{slug}/variants` — multipart: `file` (clipe do hook),
`novo_slug` (nome da variação). Resposta em SSE (mesmo mecanismo de
`/cut`/`/refine`), com eventos de progresso por fase e `done` devolvendo
`{"slug": novo_slug}`.

Validações (antes de gravar qualquer byte):
- matriz existe (guard `_dir_do_job`) e `papel == "matriz"` → senão 409
  "este projeto não é uma matriz de variações";
- matriz tem `trimmed.mp4` **e** `transcript.json` → senão 409 "transcreva o
  corpo antes de criar variações";
- `novo_slug` passa pelo guard (400 nome inválido) e não colide com projeto
  existente com trabalho → 409 com o resumo, como no upload.

### Pipeline da variação (`pipeline/variants.py`, função `criar_variacao`)

1. **Corte do hook**: `detect_silences` + `compute_kept_segments` +
   `cut_segments` sobre o clipe do hook, com os sliders da matriz,
   normalizando para resolução **e fps** do corpo (mesmo `build_scale_filter`
   + fps do `trimmed.probe.json` da matriz) → `hook_trimmed.tmp.mp4` no
   diretório da variação.
2. **Concat**: hook cortado + `trimmed.mp4` da matriz → `trimmed.mp4` da
   variação. Primeiro tenta **stream-copy** (concat demuxer, `-c copy`) —
   ambos saem do mesmo encoder, deve casar; se o ffmpeg recusar, cai para
   reencode com `logger.warning` explicando. O corpo nunca é tocado na
   matriz.
3. **Probe** do composto → `trimmed.probe.json`; `cuts.json` sintético com um
   segmento inteiro (`[{"start": 0, "end": duração}]`) para o passo de
   Cortes remontar player e cortes manuais.
4. **Transcrição só do hook** (`transcribe_audio` no hook cortado).
5. **Fusão e deslocamento** (ver seção seguinte) + cópia da matriz:
   `overlays.json` e `suggestions.json` deslocados; `suggest-defaults.json`,
   estilo de legenda, marca e sliders copiados via config. `hook.json` NÃO é
   criado — o passo do hook da variação começa vazio para o usuário digitar.
6. `job.config.json` da variação: `papel: "normal"`,
   `origem_matriz: <slug da matriz>`, título sugerido = título da matriz +
   sufixo.
7. Remove os temporários (clipe bruto do hook, `hook_trimmed.tmp.mp4`).

**Rollback**: qualquer exceção no meio → `shutil.rmtree` best-effort do
diretório da variação + `logger.warning`; o erro sobe pelo SSE como nos
outros stages. Nenhum projeto meio-nascido na lista.

### A matemática do deslocamento

`delta = duração do hook cortado`, lida do **probe** do hook cortado (nunca
estimada).

- Transcrição da matriz: todo `start`/`end` de linhas e palavras `+= delta`;
  o resultado é `transcrição(hook) ++ transcrição(corpo deslocado)`.
- `overlays.json`/`suggestions.json`: `fromFrame += round(delta × fps)`, com
  `fps` do probe do composto.

É a única lógica realmente nova do projeto; concentra os testes golden.

## Front

- **`UploadStep`**: toggle "Matriz de variações de hook (só o corpo, sem hook
  falado)" — manda `papel` no form do `POST /jobs`.
- **`RecordedWizard`**: com `papel == "matriz"`, a lista de passos vira
  Upload → Cortes → Transcrição → Textos, com "Concluir" (volta à lista) no
  lugar do "Próximo" final. Sem Hook, sem Render.
- **`ProjectsScreen`**: linha da matriz ganha badge "matriz" e botão
  **"Nova variação"** → diálogo (mesmo padrão `useAlertDialog`): input de
  arquivo + nome sugerido `<matriz>-h<N>` (menor N livre, editável) → barra
  de progresso SSE → ao concluir, `onOpen(novo_slug)` abrindo a variação
  direto no passo do texto do hook. Erros (409/400) aparecem no diálogo com
  o nome editável.
- **Passo de Cortes da variação**: a mensagem de "sem vídeo original" ganha a
  variante correta ("esta variação já nasce cortada e montada a partir da
  matriz; os cortes manuais continuam funcionando") — o texto atual fala em
  "liberar espaço", que seria falso aqui. Decide pela flag `origem_matriz`
  no `JobState`.
- `api.ts`: `createVariant(slug, file, novoSlug)` via `streamSSE`.

## Erros e casos de borda

- Matriz sem transcrição/trimmed → 409 antes de qualquer gravação.
- Colisão de nome → 409 com resumo; o diálogo mantém o nome editável.
- Hook com fps/resolução diferentes → normalização no corte do hook; se o
  stream-copy do concat ainda recusar, reencode automático (warning).
- Falha em qualquer fase → rollback do diretório + erro legível no SSE.
- Variação re-transcrita/re-cortada manualmente depois: fluxo normal de
  projeto — as invalidações existentes cuidam da consistência.
- Matriz excluída: variações seguem funcionando (autossuficientes); o botão
  "Nova variação" morre com ela.

## Testes

### Backend
- **Golden do deslocamento**: corpo com palavra em `t=1.0`, hook cortado de
  `3.2s` ⇒ palavra em `t=4.2`; overlay `fromFrame=30` a 30fps ⇒ `126`;
  sugestões idem. Transcrição fundida = hook ++ corpo deslocado, na ordem.
- `criar_variacao` (com mocks de ffmpeg/whisper no padrão `_cut_falso`):
  artefatos esperados existem; source ausente; temporários removidos;
  `cuts.json` sintético; config com `papel`/`origem_matriz`.
- Concat: stream-copy chamado primeiro; fallback reencode quando o copy
  falha (mock que recusa).
- Rota: happy path SSE; 409 matriz-não-matriz, matriz sem transcript,
  colisão; 400 nome inválido; 404 matriz inexistente; rollback quando uma
  fase estoura (diretório não sobra).
- `papel`/`origem_matriz` no summary/state; projetos velhos sem o campo
  continuam `"normal"`.

### Front
- Toggle no Upload manda `papel`.
- Wizard da matriz: sem passos de Hook/Render; "Concluir" volta à lista.
- ProjectsScreen: badge, botão, diálogo com nome sugerido incrementado,
  progresso, erro 409 mantém diálogo editável, sucesso abre a variação no
  passo do hook.
- Cortes da variação: mensagem correta (não fala em "liberar espaço").

### Paridade
- Legendas da variação = legendas da matriz deslocadas por `delta` (teste de
  integração comparando recipes gerados, com transcrições sintéticas).

## Fora de escopo

- Lote de hooks numa tacada (fase 2).
- Agrupamento visual matriz/variações na lista.
- Marcar fronteira de hook em vídeo já gravado com hook embutido.
- TTS/modo animado; qualquer mudança no render/Remotion.
