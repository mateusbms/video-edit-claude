# Design — `stage_cut` invalida os derivados + confirmação no "Detectar pausas"

Data: 2026-07-31

## Problema

`pipeline/stages.py::stage_cut` reescreve o `trimmed.mp4` **sem apagar**
`transcript.json`, `edit-recipe.json`, `overlays.json` e `suggestions.json`.
Rodar "Detectar pausas" de novo num projeto que já tem transcrição deixa esses
arquivos apontando para a timeline antiga: o vídeo muda, as legendas não, e o
render sai fora de sincronia **sem nenhum aviso**.

É a quarta causa do relato "meu trabalho não fica salvo" (handoff de
2026-07-31), e a pior das quatro: as outras três perdiam trabalho de forma
anunciável; esta corrompe em silêncio.

O `stage_refine` já resolve o mesmo problema para o corte manual: apaga os
quatro derivados ao reescrever o trimmed, e o `CutsStep` confirma antes,
listando o que aquele projeto de fato tem (estado `aPerder`). O conserto
espelha esse par nos dois lados.

## Decisões tomadas no brainstorm

- **Confirmação só com derivados a perder** (ou quando não se sabe o que há),
  igual ao corte manual. Ajustar sliders e re-detectar continua sem atrito
  quando não há nada a perder. A perda de cortes manuais aplicados num projeto
  sem transcrição fica sem aviso — caso raro, e rastreá-lo exigiria flag nova
  no backend (fora de escopo).
- **Confirmação no front, não no servidor** (sem 409 + `force`): é o contrato
  que o refino já tem, e hoje só existe um cliente. Consistência ganha.
- **`hook.json` sobrevive**, como no refino: o texto do hook não é
  sincronizado com a timeline.

## Backend — `pipeline/stages.py`

Nova constante ao lado de `DERIVADOS_DO_SOURCE`:

```python
# Tudo que foi derivado do trimmed.mp4: reescrevê-lo deixa esses arquivos
# apontando para a timeline antiga — legendas fora de sincronia no render.
# hook.json fica de fora de propósito: o texto do hook não é sincronizado
# com a timeline (mesma decisão do stage_refine).
DERIVADOS_DO_TRIMMED = (
    "transcript.json", "edit-recipe.json", "overlays.json", "suggestions.json",
)
```

- `stage_cut` apaga os quatro (`unlink(missing_ok=True)`) no **final**, depois
  de escrever o `trimmed.probe.json` — só invalida depois que o corte novo
  existe, espelhando a ordem do refino.
- `stage_refine` troca a tupla inline pela constante. Comportamento idêntico,
  fonte única.
- `api/routes.py` não muda: a invalidação mora no pipeline.

## Front — `web/src/steps/CutsStep.tsx`

- Novo estado `confirmandoCorte` (booleano, irmão de `confirmandoRefino`).
- Nova função `pedirParaCortar()`: mesmo portão do `pedirParaAplicar` —
  `aPerder === null || aPerder.length > 0` abre o diálogo; senão chama
  `onCut()` direto. O botão "Detectar pausas" chama ela e fica desabilitado
  também enquanto `carregandoJob` (mesma regra do botão de aplicar).
- No `done` do `onCut`:
  - `setAPerder([])` e `setPerdeTranscricao(false)` — o corte acabou de apagar
    os derivados; avisar de novo no próximo clique seria mentira (igual ao
    refino);
  - `setRemoveList([])` e `setMarkStart(null)` — as marcações antigas
    referenciam a timeline do trimmed anterior, que não existe mais.
- O parágrafo do aviso (renderização de `aPerder`, singular/plural, variante
  `null`) sai para um componente local `AvisoDescarte`, usado pelos dois
  diálogos — evita a terceira cópia do vocabulário do "o que se perde".

### Texto do diálogo do corte

Mesma estrutura do refino, com a primeira frase própria:

> Detectar pausas refaz o corte a partir do vídeo original, então
> **[a transcrição, os textos, as sugestões, a receita de render]**
> serão descartados — as legendas ficariam fora de sincronia com o vídeo
> novo. Você vai precisar transcrever outra vez. *(última frase só quando
> `perdeTranscricao`)*

Variante `aPerder === null` (getJob falhou): "Não foi possível confirmar o que
este projeto já tem salvo. Detectar pausas refaz o corte a partir do vídeo
original, então **a transcrição, os textos, as sugestões e a receita de
render** seriam descartados, se existirem — …".

Botões: **Descartar e cortar** / **Desistir**.

## Testes

### Backend (`tests/test_stages.py`)

- `stage_cut` apaga os quatro derivados quando existem.
- `stage_cut` não falha quando os derivados não existem.
- `cuts.json`, `trimmed.mp4` e `trimmed.probe.json` continuam sendo escritos.
- Suíte existente do `stage_refine` continua verde com a constante.

### Front (`web/src/__tests__/CutsStep.test.tsx`)

- Com algo a perder: clique em "Detectar pausas" abre o diálogo e **não**
  dispara o POST; "Descartar e cortar" dispara; "Desistir" fecha sem disparar.
- Sem nada a perder: dispara direto, sem diálogo.
- `aPerder === null` (getJob falhou): abre a variante conservadora.
- Após um corte confirmado, re-detectar não pede confirmação de novo
  (`aPerder` zerou).

Armadilha conhecida (handoff, pendência 4): testes do botão "Detectar pausas"
que passam porque o estado inicial já é o esperado. Cada teste novo deve
provocar a mudança de estado que afirma.

## Fora de escopo

- Rastrear cortes manuais aplicados para avisar sobre a perda deles quando não
  há derivados (exigiria flag nova no backend).
- Confirmação no servidor (409 + `force`).
- Logging da invalidação (pendência 2 do handoff, separada).
