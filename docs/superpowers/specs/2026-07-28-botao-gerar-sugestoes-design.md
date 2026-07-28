# Botão "Gerar sugestões" — Claude CLI local, sem API key

**Data:** 2026-07-28
**Depende de:** Fase D (painel de sugestões, `suggestions.json`, `suggest-defaults.json`).
**Muda a Fase D:** a geração deixa de exigir que o usuário peça no chat. Um botão no editor
dispara o mesmo trabalho, chamando o binário `claude` já instalado na máquina. Continua sem
API key da Anthropic e sem custo por token além da assinatura do Claude Code.

## Problema

A Fase D deixou a geração fora do app de propósito: o usuário digita "gera sugestões pro
\<slug\>" no chat, o Claude da sessão grava `suggestions.json`, e o usuário volta ao editor e
clica em ↻ Recarregar. Funciona, mas exige uma sessão de chat aberta e quebra o fluxo do
wizard — o editor tem um painel de sugestões que nasce vazio sem explicação.

## Princípio

O backend continua **sem API key e sem SDK**. A geração passa a ser um subprocesso do
binário `claude` em modo headless (`-p`), que roda na assinatura do usuário. O backend é
dono do arquivo: ele monta o prompt, recebe texto, **valida**, e só então grava.

Isso é o oposto de dar acesso a arquivos para o CLI. O CLI não lê nem escreve nada do job —
recebe tudo pelo prompt e devolve JSON pela stdout.

## Fluxo do usuário

1. No passo **Textos**, com transcrição pronta, clica em **✨ Gerar sugestões**.
2. Botão vira `Gerando… (~1min)` e desabilita.
3. Ao terminar, o painel de sugestões popula direto — sem precisar do ↻ Recarregar.
4. ✓ Aplicar / ✗ Pular por sugestão, como já é hoje.

Clicar de novo **substitui** `suggestions.json` por inteiro. O que o usuário digitou ou já
aplicou vive em `overlays.json` e **nunca** é tocado por este endpoint.

## Arquitetura

Três unidades, cada uma com uma responsabilidade e testável isolada:

| Módulo | Interface | Depende de |
|---|---|---|
| `api/suggest_prompt.py` | `build_prompt(transcript, hook, defaults, fps, orientation) -> str` | nada (função pura) |
| `api/claude_cli.py` | `run_claude(prompt, timeout=180) -> str` | `subprocess` |
| `api/routes.py` | `POST /api/jobs/{slug}/suggest` | os dois acima + `Suggestion` |

`run_claude` isolado é o que permite testar o endpoint inteiro sem gastar quota: mocka o
módulo e o resto do caminho roda de verdade.

### `api/claude_cli.py`

```
claude -p <prompt> --output-format json --allowed-tools ""
```
rodando com `subprocess(..., cwd=<diretório temporário>)`.

- **`--output-format json`** devolve um envelope: `{"is_error":bool, "result":"<texto>", ...}`.
  O `result` é o texto do modelo. `run_claude` levanta `ClaudeCLIError` se `is_error` for
  verdadeiro ou se o envelope não parsear. Verificado no CLI 2.1.128.
- **`--allowed-tools ""`**: o CLI não precisa de ferramenta nenhuma. Recebe tudo no prompt.
- **cwd neutro pelo `subprocess`, não por flag** — o CLI **não tem** `--cwd`. Rodar de um
  diretório temporário evita carregar o `.claude/` do repo, com as ~40 skills de marketing
  vendorizadas; uma chamada trivial da raiz mediu ~27k tokens de contexto.
- **Ausente do PATH** → `ClaudeCLINotFound`. Resolver com `shutil.which("claude")`, que no
  Windows respeita PATHEXT (o npm instala `claude.ps1`/`claude.cmd`, não `.exe`) — mesma
  armadilha já corrigida em `api/render.py::_npx`.
- **Timeout** de 180s → `ClaudeCLITimeout`.
- Remover cercas de markdown (` ```json `) antes de devolver: o modelo às vezes as inclui
  mesmo com instrução em contrário.

**Não usar `--bare`.** A flag existe e parece feita para isto ("skip hooks, plugin sync,
auto-memory, CLAUDE.md auto-discovery"), mas a própria descrição diz que sob `--bare` a
autenticação passa a ser estritamente `ANTHROPIC_API_KEY` ou `apiKeyHelper` — OAuth e
keychain nunca são lidos. Ou seja, ela exige exatamente a API key que este desenho existe
para evitar. Se o contexto ainda pesar depois do cwd neutro, o próximo botão a girar é
`--setting-sources user`, medindo antes e depois.

### `api/suggest_prompt.py`

Monta um prompt fechado com:

- **A fala com tempos**, do `transcript.json` — única fonte de grounding.
- **O hook já definido**, para não repetir a mesma ideia na abertura.
- **Os defaults de estilo** e a **orientação** do job. A orientação importa: em `9x16` o
  canvas tem 1080 de largura e linha densa com símbolos quebra feio; em `16x9` cabe mais.
- **As regras da `ad-creative`** condensadas: 3–5 ângulos distintos (dor, resultado, prova,
  curiosidade, comparação, urgência, identidade, contrarian, objeção, CTA); por beat
  relevante, um texto **curto** (uma ideia, punchy, número quando houver) ou **denso**
  (linha com ✓ ✗ → ·).
- **Grounding rígido**: cada sugestão carrega `source` = a fala que a originou. Nunca
  inventar claim, número ou fato fora da transcrição.
- **Evitar a janela do hook** (~0–3s) e a faixa da legenda.
- **O shape exato do JSON** e a instrução de responder só com o array.

Alvo de 6 a 10 sugestões. `fromFrame` = `round(start * fps)` da fala de origem;
`durationInFrames` entre 45 e 75. Ids `sug_01`, `sug_02`, …

Manter as regras aqui, e não apontar para a skill, é o que permite o cwd neutro e torna o
prompt versionável junto do código que o consome.

### `POST /api/jobs/{slug}/suggest`

1. Lê `transcript.json` (obrigatório), `hook.json`, `suggest-defaults.json`, `probe.json`.
2. `build_prompt(...)` → `run_claude(...)`.
3. `json.loads` + valida como `list[Suggestion]` (o modelo já existe em `api/models.py`).
4. Grava `jobs/<slug>/suggestions.json` e devolve a lista.

Resposta síncrona, sem SSE: o `claude -p` não reporta progresso, e uma barra falsa não
informa nada. O botão desabilitado com texto é honesto sobre o que está acontecendo.

### Erros

| Situação | Status | Efeito no arquivo |
|---|---|---|
| Sem `transcript.json` | 409 | intacto |
| `claude` fora do PATH | 503 | intacto |
| Timeout (180s) | 504 | intacto |
| CLI retornou `is_error` | 502 | intacto |
| JSON inválido ou fora do schema | 422 | intacto |

A gravação acontece **só depois** da validação — uma geração ruim nunca destrói a anterior.
Todo detalhe de erro sobe legível para o front, que mostra inline abaixo do botão.

## Front

Botão `✨ Gerar sugestões` ao lado do ↻ Recarregar, em `web/src/steps/OverlaysStep.tsx`.

- Desabilitado quando não há transcrição, com hint explicando por quê.
- Durante a chamada: `Gerando… (~1min)`, desabilitado.
- Sucesso: `setSuggestions(resposta)` direto, sem novo GET.
- Erro: mensagem inline, sugestões atuais preservadas.

`generateSuggestions(slug)` entra em `web/src/api.ts`, ao lado de `getSuggestions`.

## Testes

**`build_prompt`** — inclui as falas com tempos; passa o hook; reflete os defaults e a
orientação; pede o shape correto.

**`run_claude`** — com `subprocess` mockado: envelope de sucesso extrai `result`;
`is_error` levanta; cercas de markdown removidas; envelope inválido levanta; ausência do
binário levanta `ClaudeCLINotFound`.

**Endpoint** — com `run_claude` mockado: grava `suggestions.json` e devolve a lista;
shape errado devolve 422 e **não** sobrescreve o arquivo anterior; sem transcript devolve
409; sem CLI devolve 503; `overlays.json` continua intacto após regenerar.

**Front** — botão dispara a chamada; estado de loading; painel popula sem recarregar; erro
inline não apaga as sugestões existentes; botão desabilitado sem transcrição.

Nenhum teste chama o CLI de verdade.

## Fora do escopo

- Memória de sugestões puladas — regenerar pode repetir algo que o usuário pulou.
- Streaming de progresso.
- Escolha de modelo pela UI. Usa o default do CLI; se virar necessidade, um parâmetro
  opcional em `run_claude`.
- Geração para o modo animado.

## Nota sobre o doc de procedimento

`docs/superpowers/notes/gerar-sugestoes.md` descreve o fluxo manual pelo chat. Ele continua
válido — o botão é um atalho, não um substituto, e o caminho pelo chat rende sugestões
melhores quando o Claude tem o contexto do projeto todo. Vale um parágrafo no doc apontando
para o botão como a opção rápida.
