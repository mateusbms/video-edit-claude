# Design — refinar a edição da variação (edição escopada ao hook)

Data: 2026-08-01

> **Status:** brainstorm concluído, pronto para virar plano. Continuação da
> feature `2026-08-01-variacoes-de-hook-design.md`, endereçando incômodos
> encontrados no primeiro uso real.

## Problema

A feature de variações de hook entregou a criação, mas o uso real expôs que
tratar a variação como "um projeto normal depois de criada" ficou apertado. O
corpo da variação **já está pronto** (cortado, transcrito, com legenda e CTA
herdados da matriz) — forçar o usuário a lidar com o vídeo inteiro é retrabalho
e é onde a sincronia de legenda pode quebrar. Quatro incômodos concretos:

1. **Hook fantasma no preview da matriz** (bug). O passo Textos (`OverlaysStep`)
   chama `getHook` sem checar o papel; numa matriz transcrita, `GET /hook` cai
   no ramo que **auto-sugere um hook a partir da transcrição**
   (`suggest_hook`), e o preview desenha esse hook fantasma. É só visual (é
   `readOnlyOverlays`, não entra no `overlays.json`; a matriz não renderiza),
   mas é confuso e conceitualmente errado.
2. **Não dá para re-cortar o silêncio só do hook.** Na criação, o hook é
   cortado uma vez com os sliders da matriz e o clipe é **apagado**
   (`hook_cortado.unlink()` + `hook_path.unlink()` em `criar_variacao`); a
   variação nasce sem `source.mp4`, então "Detectar pausas" fica desabilitado.
   Sem volta.
3. **A transcrição da variação mostra o vídeo todo.** `transcript.json` é a
   fusão hook+corpo; o passo Transcrição exibe tudo, quando o usuário só quer
   revisar o hook (o corpo já foi transcrito e revisado na matriz).
4. **Garantir legenda/CTA na mesma posição e tamanho do corpo.** Já é o
   comportamento atual (herança de config + deslocamento só do tempo), mas
   falta travar contra regressão.

## Decisões do brainstorm

- **Re-corte do hook: dentro da variação.** Guardar o clipe bruto do hook na
  variação; o passo Cortes da variação re-corta só o hook e recompõe.
- **Transcrição da variação: só o hook, corpo escondido.**
- **Trade-off aprovado (muda a promessa da spec original):** o re-corte lê o
  corpo (vídeo + transcrição/textos base) da **matriz** na hora. A variação
  continua 100% autossuficiente para **renderizar** mesmo sem a matriz, mas o
  *re-corte do hook* fica indisponível se a matriz for excluída (com mensagem).
  Guardar cópia do corpo em cada variação evitaria isso, mas dobraria o disco
  por variação — não vale.
- **Item 4 já funciona**; travar com teste de paridade, não reimplementar.
- **Corte por silêncio local** (feature separada) fica fora deste pacote — ver
  `2026-08-01-corte-silencio-local-design.md`.

## Modelo e armazenamento

`criar_variacao` passa a **preservar o clipe bruto do hook** como
`hook_source.mp4` na pasta da variação (em vez de apagá-lo). O config da
variação ganha `hook_linhas: int` — quantas linhas iniciais de
`transcript.json` são do hook (a fronteira do delta) — para o passo
Transcrição saber onde o hook termina.

A variação continua com `origem_matriz` apontando para a matriz; o re-corte
usa esse slug para achar o corpo. `bytes_parts`/source seguem como hoje (a
variação não tem `source.mp4`; `hook_source.mp4` é um arquivo a mais no
diretório, contado normalmente em `bytes_total`).

## Backend

### Refatorar `criar_variacao` para compartilhar o núcleo compõe+funde

Extrair de `criar_variacao` o núcleo reutilizável (cortar hook → delta →
concat com o corpo → probe/cuts sintético → transcrever hook → fundir/deslocar
→ escrever artefatos) numa função `_compor_variacao(var_dir, matriz_dir,
hook_source, cfg_sliders, progress_cb)`. Tanto a criação quanto o re-corte
chamam ela. A criação, além disso, preserva `hook_source.mp4` e grava
`hook_linhas`.

### Nova rota: `POST /api/jobs/{slug}/recut-hook` (SSE)

Re-corta o hook de uma variação. Validações antes de gravar:
- a variação existe e tem `origem_matriz` e `hook_source.mp4` → senão 409
  "esta variação não pode re-cortar o hook";
- a matriz de origem ainda existe e tem `trimmed.mp4` + `transcript.json` →
  senão 409 "a matriz desta variação foi excluída; o re-corte do hook não é
  mais possível" (a variação continua renderizável).

Recebe os parâmetros de corte (os 3 sliders). Roda `_compor_variacao` com o
`hook_source.mp4` guardado e o corpo da matriz, com os novos sliders;
re-transcreve o hook, re-deriva `transcript.json` (hook novo + corpo base
re-deslocado pelo novo delta), re-desloca `overlays.json`/`suggestions.json`
**a partir da base da matriz** (não dos arquivos já deslocados da variação —
evita drift), atualiza `hook_linhas` e o `trimmed.probe.json`/`cuts.json`.

**Invalidação = a mesma de re-detectar pausas.** Re-compor descarta os
derivados que dependem da timeline (a transcrição editada do hook, textos
próprios da variação, recipe), exatamente como `stage_cut`. Isso reusa a
constante `DERIVADOS_DO_TRIMMED` e o front reusa o **diálogo de confirmação**
que já existe. Ordem natural de trabalho: criar a variação → acertar o corte
do hook → depois transcrever/escrever.

## Front

### Passo Cortes da variação = "modo hook"

Numa variação (`origem_matriz` presente) com `hook_source` disponível, o passo
Cortes deixa de mostrar a mensagem "já nasce cortada e montada" e passa a
oferecer **"Detectar pausas (do hook)"** — mesmos sliders, chamando
`/recut-hook` via SSE, com o mesmo portão de confirmação do `aPerder` (reusa
`ConfirmarDescarte`). Cortes manuais continuam disponíveis sobre o composto. Se
a matriz foi excluída, mostra a mensagem de indisponível (o backend recusa com
409, mas o front antecipa pela ausência da matriz na lista, como faz com
`temSource`).

### Passo Transcrição da variação = só o hook

`TranscriptStep`, quando `hook_linhas` está presente (variação), mantém a
transcrição completa em estado mas **exibe e edita só `lines[0:hook_linhas]`**;
ao salvar, remonta a transcrição completa (linhas do hook editadas + corpo
preservado) e manda no `putTranscript`. O corpo nunca aparece nem é tocado.
Um aviso curto explica: "o corpo já está transcrito na matriz; aqui você
revisa só o hook".

Nota de borda: o editor de transcrição edita texto dentro de linhas
existentes, sem adicionar/remover linhas — então `hook_linhas` permanece
válido durante a edição normal. (Se um dia o editor permitir split/merge de
linha, `hook_linhas` precisa ser recalculado no save.)

### Hook fantasma + heading (itens de carona)

- `OverlaysStep`: quando `papel === "matriz"`, não buscar/desenhar o hook
  (`hookOverlays = []`). Fim do fantasma no preview da matriz.
- `OverlaysStep`: o heading fixo "5. Textos" passa a refletir o passo real (4
  na matriz). Derivar o número do papel/lista de passos, ou remover o número.

## Testes

### Backend
- `criar_variacao` preserva `hook_source.mp4` e grava `hook_linhas` correto.
- `_compor_variacao` reusada por criação e re-corte dá o mesmo resultado.
- `/recut-hook`: happy path SSE re-deriva transcrição/textos do **base da
  matriz** (sem drift após dois re-cortes seguidos com deltas diferentes);
  409 quando a matriz sumiu; 409 quando não é variação; invalida os derivados.
- **Paridade (item 4):** estilo de legenda (`caption_*` + brand kit) e o
  x/y/fontSize do CTA são idênticos entre matriz e variação — golden que trava
  a herança.

### Front
- `OverlaysStep` numa matriz não mostra hook; heading = "4. Textos".
- Cortes da variação oferece "Detectar pausas (do hook)" e confirma antes de
  descartar; some quando a matriz foi excluída.
- Transcrição da variação mostra só `hook_linhas` linhas; salvar preserva o
  corpo.

## Fora de escopo

- Corte por silêncio local (spec própria).
- Cópia do corpo por variação (re-corte sem a matriz viva).
- Editar o corpo pela variação — para mudar o corpo, edita-se a matriz e
  geram-se novas variações.
- Lote de hooks; agrupamento visual matriz/variações.
