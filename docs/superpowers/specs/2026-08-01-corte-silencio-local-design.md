# Design — corte por silêncio local (remoção precisa de um trecho)

Data: 2026-08-01

> **Status: DIREÇÃO CAPTURADA, brainstorm a completar.** O caminho foi
> escolhido (corte por silêncio local), mas as perguntas de design abaixo
> ainda não foram respondidas. Retomar pelo brainstorm a partir de "Perguntas
> em aberto" antes de escrever o plano.

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

## Perguntas em aberto (responder no brainstorm da próxima sessão)

1. **Como o usuário indica a região?** Um clique único perto do problema (o
   sistema abre uma janela em volta)? Ou marca início/fim grosso e pede
   "refinar"? Ou arrasta numa timeline com zoom?
2. **Tamanho da janela de re-análise.** Fixo (ex.: ±1s do clique)? Adaptativo?
3. **O que define a fronteira do corte na janela.** Os mínimos locais de
   volume (instantes mais silenciosos)? As micro-pausas sub-threshold que a
   detecção global ignorou (mais curtas que `min_silence`)? Um threshold local
   recalculado?
4. **Fallback quando não há silêncio na janela** (o "erro" é fala contínua sem
   pausa em volta). Cai no nudge frame a frame? Avisa que não achou fronteira
   limpa?
5. **Backend vs front.** A re-análise local roda no servidor (re-`detect_silences`
   numa janela do trimmed, mais preciso) ou no front (Web Audio API sobre o
   trecho, resposta instantânea, menos preciso)?
6. **Preview da emenda.** Mostrar "último frame que fica antes" × "primeiro
   frame que fica depois" antes de aplicar, para confirmar corte limpo?

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
