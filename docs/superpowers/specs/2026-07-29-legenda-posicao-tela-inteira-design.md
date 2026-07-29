# Posição da legenda por toda a altura da tela

## Problema

O controle "Posição (do rodapé)" em `web/src/steps/TranscriptStep.tsx` é um
`<input type="range" min={0} max={600}>`. O valor é `captionStyle.bottom`, em px
do frame-alvo, medido a partir do rodapé.

O teto de 600 é arbitrário: não vem de nenhuma restrição do pipeline. O backend
aceita qualquer inteiro (`api/models.py::CaptionStyleParams.bottom`), e tanto o
preview (`CaptionOverlay`) quanto o render (`remotion/src/components/CaptionLayer.tsx`)
só aplicam `marginBottom`. Num vídeo vertical (1080×1920), 600 px sobe apenas 31%
da altura — a legenda nunca alcança a metade de cima.

Além disso, posicionar por slider é indireto: o usuário arrasta e olha pro vídeo
pra descobrir onde a legenda caiu. Os blocos de texto do passo 5 já se posicionam
por arraste direto no preview; a legenda não.

## Decisão

Duas mudanças, uma dependente da outra:

1. O alcance do slider passa a cobrir a altura útil do frame, derivada da
   orientação do job.
2. A legenda vira arrastável na vertical dentro do preview do passo 3, com o
   slider mantido como ajuste fino.

Só o eixo vertical. O render sempre centraliza a legenda na horizontal
(`CaptionLayer.tsx`, `justifyContent/alignItems: center`), então arraste lateral
prometeria um posicionamento que o vídeo final não entrega.

Fora de escopo: os overlays de texto do passo 5, que já têm liberdade total via
`clientToFraction` (fração [0,1] dos dois eixos).

## Modelo de dados

Inalterado. `captionStyle.bottom` continua sendo px a partir do rodapé no espaço
do frame-alvo, persistido em `job.config.caption_bottom`. Nada muda em
`pipeline/`, no schema do Remotion, nem no contrato da API — o que muda é a
faixa que a UI permite e a forma de chegar no valor.

Manter px (em vez de trocar por fração da altura) evita tocar em recipe, render e
testes existentes, e mantém `captionZone()` funcionando como está.

## Altura útil do frame

Nova função pura em `web/src/overlayGeom.ts`, ao lado de `captionZone()`:

```
captionBlockHeight(fontSize) = fontSize * 1.6
maxCaptionBottom(fontSize, frameHeight) = max(0, frameHeight - captionBlockHeight(fontSize))
```

O fator 1.6 já existe hardcoded dentro de `captionZone()`. Ele passa a viver em
`captionBlockHeight()`, e `captionZone()` passa a chamá-la — senão as duas
aproximações da altura da legenda divergem com o tempo.

`maxCaptionBottom` é o teto: com ele, a borda superior do bloco encosta no topo
do frame sem passar. É aproximação de uma linha; uma legenda que quebra em duas
pode encostar antes. O preview mostra o resultado real, então não vale
complicar o cálculo.

`TranscriptStep` já tem `orientation` no estado (linha 29) e `capStyle.fontSize`,
então o `max` do slider vira
`maxCaptionBottom(capStyle.fontSize, frameSize(orientation).height)` — sem
requisição nova.

Consequência: aumentar a fonte reduz o teto. Se `bottom` ficar acima do novo
máximo, o slider clampa o valor exibido e persiste o clampado, para o controle
não mostrar uma posição diferente da que vai renderizar.

## Arraste no preview

`CaptionOverlay` ganha uma prop opcional:

```
onDragBottom?: (bottom: number) => void   // durante o arraste
onDragEnd?: () => void                    // ao soltar
```

Sem as props, o componente fica exatamente como hoje: `pointer-events-none` e
`aria-hidden`. Com elas, o bloco da legenda vira `pointer-events-auto` com
`cursor-ns-resize`.

O arraste é por delta, não por posição absoluta: no `pointerdown` guarda-se
`bottomInicial` e `clientY` inicial; a cada `pointermove`,

```
bottom = clamp(0, max, bottomInicial + (yInicial - yAtual) / scale)
```

Delta evita ter de calcular a altura real do bloco pra alinhar o cursor com o
texto, e `scale` (o `previewScale` que o componente já recebe) converte px de
tela em px do frame-alvo.

Persistência: `onDragBottom` só atualiza o estado local a cada movimento;
`onDragEnd` dispara o `PUT /jobs/{slug}/caption-style`. O slider hoje persiste a
cada `onChange`; num arraste isso viraria dezenas de requisições por segundo.

Onde fica arrastável: só em `TranscriptStep`, que é onde vivem os controles de
estilo. `HookStep` e `OverlaysStep` não passam as props e mantêm a legenda como
referência visual read-only — nesses passos o `capStyle` é carregado só para
desenhar, e editar ali exigiria propagar o save por dois caminhos.

## Acessibilidade

O slider continua sendo o controle canônico e é o que os testes exercitam por
`aria-label="posição da legenda"`. A `CaptionOverlay` permanece `aria-hidden`
pelo motivo já documentado nela (as palavras não têm espaço real no DOM, e leitor
de tela leria tudo colado). O arraste é um atalho de mouse por cima de um
controle que já existe, não o único caminho.

## Troca de orientação

`bottom` é px do frame final, então o valor válido depende da orientação: 1500
faz sentido no 9:16 (altura 1920) e joga a legenda pra fora no 16:9 (altura
1080). Hoje o problema não aparece porque 600 cabe nos dois.

O clamp vai no backend, em `api/jobs.py::update_orientation`, que já compara a
orientação efetiva antes e depois para invalidar a `edit-recipe.json`. No mesmo
ponto: se a orientação mudou, reduzir `job.config.caption_bottom` ao máximo
válido da nova altura, usando o mesmo `fontSize * 1.6`.

Fica no servidor, não na UI, para valer para qualquer cliente e para jobs
retomados depois. Isso duplica a regra de `maxCaptionBottom` em Python — mesma
situação de `frame.ts` × `pipeline/orientation.py`, que já são espelhos
declarados por comentário. Seguir o padrão: comentário em cada lado apontando
para o outro.

## Testes

Novos:

- `overlayGeom`: `maxCaptionBottom` — caso típico, e piso em 0 quando a fonte é
  maior que o frame. `captionZone` continua passando após extrair
  `captionBlockHeight`.
- `CaptionOverlay`: com `onDragBottom`, uma sequência pointerdown/move/up emite
  o `bottom` esperado (delta ÷ scale) e clampa nos dois extremos; sem a prop,
  não há handler nem `pointer-events`.
- `TranscriptStep`: o `max` do slider acompanha a orientação do job (16:9 vs
  9:16) e o `fontSize`; valor acima do teto é clampado e persistido.
- `api/tests`: trocar a orientação de um job com `caption_bottom` alto reduz o
  valor; trocar sem mudar a orientação efetiva não mexe nele.

Regressão a cobrir: os testes existentes usam `bottom: 327` e `bottom: 120`,
ambos abaixo de qualquer teto novo, então devem continuar passando sem edição.
