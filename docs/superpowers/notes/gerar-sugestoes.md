# Gerar sugestões de texto (Fase D, sem API)

> **Atalho rápido:** no passo **Textos** há o botão **✨ Gerar sugestões**, ao lado do
> ↻ Recarregar. Ele dispara o mesmo trabalho chamando o binário `claude` local (assinatura
> do usuário, sem API key) e popula o painel direto — sem precisar de uma sessão de chat
> aberta. O caminho manual abaixo continua válido e rende sugestões melhores quando o Claude
> tem o contexto do projeto todo; o botão é a opção rápida, não um substituto.


As sugestões NÃO são geradas por código/servidor. São geradas pelo **Claude da sessão**
(plano do usuário) e gravadas num arquivo que o editor lê. Este é o "run" que o usuário
dispara no chat.

## Gatilho

Usuário no chat: **"gera sugestões pro <slug>"** (ex.: "gera sugestões pro A1 Exame").

## Procedimento (o que o Claude faz)

1. Ler o contexto do job em `jobs/<slug>/`:
   - `transcript.json` — a fala com tempos (a **única fonte** de grounding).
   - `hook.json` — o hook já definido (não repetir).
   - `suggest-defaults.json` (se existir) — estilo padrão que o usuário escolheu.
   - brand kit, se relevante.
2. Aplicar a skill `.claude/skills/ad-creative/`:
   - Definir 3–5 **ângulos** (dor, resultado, prova, curiosidade, comparação, urgência,
     identidade, contrarian, objeção, CTA).
   - Para cada beat relevante da fala, escrever 1–2 textos: um **curto** (1 ideia, punchy,
     número quando houver) e/ou um **denso** (linha com símbolos ✓ ✗ → · ).
   - **Grounding rígido:** cada sugestão tem `source` = a fala que a originou. **Nunca
     inventar** claim, número ou fato que não esteja na transcrição.
   - Evitar a janela do hook (~0–3s) e a faixa da legenda (o estilo padrão nasce no topo).
3. Escrever `jobs/<slug>/suggestions.json` — array de objetos:
   ```json
   { "id": "sug_01", "text": "...", "fromFrame": <round(start*fps)>,
     "durationInFrames": 45-75, "kind": "short"|"dense", "angle": "...", "source": "fala" }
   ```
   fps vem de `probe.json`. Ids `sug_01..`.
4. Avisar o usuário: no editor (passo Textos), clicar **↻ Recarregar** para ver as sugestões,
   e **✓ Aplicar** / **✗ Pular** cada uma. Aplicar usa o **estilo padrão** que ele definiu.

## Importante

- Zero chamada de API/IA no servidor. O app só faz `GET/PUT` de dois arquivos JSON.
- `suggestions.json` é apagado no recorte (`stage_refine`) porque os tempos deixam de valer;
  `suggest-defaults.json` (preferência de estilo) permanece.
- Manter o `suggestions.json` como **array válido** no schema — um shape errado quebra o
  painel (o GET não valida; o produtor confiável é o Claude).
