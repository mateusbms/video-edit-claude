# Design — corte por silêncio local (remoção precisa de um trecho)

Data: 2026-08-01

> **Status: brainstorm concluído, pronto para virar plano.** As perguntas de
> design foram respondidas (ver "Decisões do brainstorm"). Feature separada da
> edição escopada da variação (`2026-08-01-variacao-edicao-escopada-design.md`).

## Problema

O usuário está no passo Cortes (vídeo já trimado) e sobrou um trecho indesejado
num ponto específico (ex.: segundo 22) — tipicamente algo **com áudio** (um
respiro alto, um "é/ãã", um começo de fala repetido, um engano). Duas saídas
atuais, as duas ruins:

- **Baixar os sliders** (padding/silêncio mínimo) para pegar esse trecho torna
  a detecção agressiva **no vídeo inteiro** — estraga o resto.
- **Corte manual** exige marcar início/fim com precisão, mas a marcação lê o
  `currentTime` do player no clique. Dar play e pausar no ponto certo erra
  facilmente 3–6 frames (a 30fps, cada frame é 33ms) — sobra pedaço do erro ou
  come frame bom vizinho.

O usuário quer algo **automático**: apontar aproximadamente onde está o
problema e o sistema achar os pontos exatos de corte, sem precisar de precisão
manual e sem mexer no corte do resto do vídeo.

## O que já é possível hoje (base para construir)

O backend já corta intervalos arbitrários com precisão de frame
(`cut_segments` em `pipeline/silence.py`, via expressões `select`/`between` do
ffmpeg) e já detecta silêncios (`detect_silences`). O corte manual do
`CutsStep` (rota `/refine`, `stage_refine`) remove ranges e invalida os
derivados com o diálogo de confirmação já blindado. **A infra de corte
frame-preciso e de invalidação existe — o que falta é a detecção de fronteira
e a UI.**

## Direção escolhida: corte por silêncio LOCAL

Globalmente não dá para baixar o threshold sem estragar tudo — mas
**localmente sim**. O usuário indica aproximadamente onde está o trecho ruim, e
o sistema **re-analisa só aquela janelinha** (onde pode ser agressivo sem tocar
no resto), acha os dois instantes mais silenciosos que cercam o ruído e propõe
esses como pontos de corte. A parte manual vira só "é por aqui"; a precisão é
automática. Isso responde direto o "sem deixar padding zero" — a agressividade
fica confinada ao ponto apontado.

Complemento possível (não exclusivo): **nudge frame a frame** nas bordas
propostas (◀/▶, teclas `,`/`.`), com o player saltando para o frame exato, para
o caso de o trecho ruim não ter silêncio claro em volta (fala contínua).

## Decisões do brainstorm

1. **Indicação = clique único (centro).** No passo Cortes, o usuário dá
   play/pausa perto do trecho ruim e clica **"Remover trecho aqui"**; o
   `currentTime` do player vira o **centro** da janela de re-análise. Casa com
   "aponto aproximadamente onde está" e reusa o player que já existe. O
   "Marcar início/fim" manual **continua disponível** ao lado (não é
   substituído) — quem quiser marcar à mão pode.
2. **Janela fixa de ±1s** (2s no total) em torno do clique, clampada às bordas
   do vídeo. Simples e previsível; cobre respiro/"é-ãã" típicos. Adaptativo
   fica fora do escopo (imprevisível, difícil de testar/explicar).
3. **Fronteira = micro-pausas que bracketam o clique.** Na janela, re-detecta
   silêncios com `min_silence` bem menor que o global (pega micro-pausas que o
   corte global ignora) e o mesmo (ou levemente mais alto) noise floor. A
   fronteira do corte é o **ponto mais silencioso (meio da micro-pausa)
   imediatamente antes** e **imediatamente depois** do instante apontado. Se o
   clique cair dentro de uma pausa, expande para a próxima pausa de cada lado.
   Reusa `parse_silences`/`detect_silences`.
4. **Fallback sem silêncio = default + nudge.** Se faltar micro-pausa de um dos
   lados dentro da janela (fala contínua), a borda vira o próprio instante
   apontado ± um default pequeno, e o **nudge frame-a-frame** (sempre presente)
   termina o ajuste. O front avisa discretamente: "não achei fronteira limpa
   deste lado — ajuste no frame".
5. **Backend (analyze-only).** Nova rota `POST /api/jobs/{slug}/detect-local`
   recebe `{center: float}` e devolve `{start, end}` **sem cortar nada**. Roda
   `silencedetect` só na janela `[center−1s, center+1s]` via `-ss`/`-t` no
   `trimmed.mp4`, deslocando os timestamps de volta ao absoluto. Frame-preciso,
   barato (~2s de áudio), sem código de análise de áudio no front.
6. **Preview da emenda = sim.** Antes de aplicar, o front mostra **dois
   quadros** — *último frame que fica antes* × *primeiro frame que fica
   depois* — com as setas de nudge (◀/▶, teclas `,`/`.`, ±1 frame). O player
   busca cada tempo e `requestVideoFrameCallback` trava no frame exato. Só
   depois o botão **"Aplicar corte"**.

## Aplicação e invalidação

A fronteira confirmada (`{start, end}`) entra na `removeList`/`/refine`
(`stage_refine`) já existente, que encurta o vídeo, invalida
`DERIVADOS_DO_TRIMMED` e reusa o diálogo `ConfirmarDescarte`. **Nada novo no
caminho de aplicação** — a feature só adiciona a *detecção da fronteira* e a
*UI de apontar/pré-visualizar*. Vale para **qualquer projeto**, sobre o
`trimmed.mp4`.

## Testes

- **Backend:** golden da detecção na janela — offset absoluto correto (timestamps
  do slice mapeados de volta); escolhe as pausas que bracketam o clique; clique
  dentro de uma pausa expande para os lados; fallback quando não há pausa de um
  dos lados. Rota `/detect-local`: 200 com `{start, end}`; clamp nas bordas do
  vídeo; 404/409 sem `trimmed.mp4`.
- **Front:** clicar "Remover trecho aqui" chama `detectLocal(center)`; o preview
  mostra os dois frames; o nudge soma/subtrai 1 frame nas bordas; "Aplicar corte"
  manda pelo `/refine` com o diálogo de descarte; o caminho de fallback mostra o
  aviso e deixa o nudge terminar.

## Restrições conhecidas

- Aplicar o corte **encurta o vídeo** → invalida transcrição/textos/legenda
  como qualquer corte manual. Reusa o diálogo de confirmação existente. Ideal
  fazer antes de transcrever.
- Frame-stepping via `currentTime` do HTML5 é preciso na prática para
  1080p/H.264 (o que o corte produz); se houver imprecisão residual,
  `requestVideoFrameCallback` trava no frame exato.
- Vale para **qualquer projeto** (não só variação). Para variações, o re-corte
  do hook (spec `2026-08-01-variacao-edicao-escopada-design.md`) cobre o hook;
  esta feature cobre trechos indesejados no corpo/em projetos normais.

## Fora de escopo

- Detecção **autônoma** de erros (o sistema decidir sozinho o que é indesejado
  sem o usuário apontar) — não confiável; respiro, repetição proposital e
  pausa dramática são acusticamente parecidos.
