# Design — pendências menores do handoff (pendência 4, em lote)

Data: 2026-08-01

Seis itens registrados em revisões anteriores. Todos pequenos; nenhum muda o
fluxo principal. Defaults registrados aqui; sem ambiguidade a decidir.

## 1. Slug inexistente responde 404 (backend)

**Hoje:** `get_state` devolve estado default para diretório inexistente, então
`GET /jobs/{slug}` e `POST /jobs/{slug}/cut` respondem 200/409 confiantes para
um nome digitado errado.

**Mudança:** `get_state` levanta `ProjetoNaoEncontradoError` quando o
diretório do job não existe. Rotas que o chamam **antes** de criar qualquer
coisa mapeiam para 404 (`read_job`, `run_cut`, `suggest`); chamadas de
`get_state` que rodam depois de `init_job`/`update_*` (diretório garantido)
não precisam de tratamento. Testes: slug inexistente → 404 nas rotas de
leitura; fluxos existentes continuam verdes.

## 2. Guard de caminho centralizado (backend)

**Hoje:** só os DELETEs e o `PUT /title` usam `_job_dir_seguro`; `create_job`,
`update_config`, `update_caption_style`, `update_brand_kit` e
`update_orientation` montam `jobs_root / slug` com o slug cru. Não há bypass
hoje, mas o guard existe e deveria ser o único jeito de montar o caminho.

**Mudança:** essas funções (e o `job_dir` da guarda de sobrescrita em
`create_job`) passam a obter o caminho via `_job_dir_seguro`; `None`
(traversal) → `ProjetoNaoEncontradoError` → 404 na rota (para `create_job`,
400 "nome inválido"). Comportamento para slugs legítimos: idêntico.

## 3. `tem_trabalho()` dentro do try (backend)

**Hoje:** em `create_job` (routes), `tem_trabalho(job_dir)` roda fora do try
da guarda: se levantar, vira 500 em vez do 409 conservador.

**Mudança:** mover a chamada para dentro do try existente; exceção em
`tem_trabalho` cai no mesmo fallback (`JobSummary(slug=slug)` → 409). Teste:
`tem_trabalho` estourando (monkeypatch) → 409, não 500.

## 4. `has_overlays`/`has_suggestions` = "tem conteúdo" (backend)

**Hoje:** flag = arquivo existe. Passar pelo passo Textos sem escrever nada
grava `[]` e gera aviso de perda inexistente (erra para o lado seguro, mas
mente).

**Mudança:** para `overlays.json` e `suggestions.json` (os dois que gravam
listas possivelmente vazias), a flag = existe **e** a lista não é vazia.
Arquivo ilegível → `True` (na dúvida, avisar — mantém o lado seguro).
Aplicar em `job_summary`, `job_summary_minimo` e `get_state` via helper único
(`_tem_conteudo_lista(path) -> bool`). `has_transcript`/`has_recipe`/`has_hook`
não mudam (nunca gravam vazio por design). Testes: `[]` → False; lista com
item → True; JSON inválido → True.

## 5. Vocabulário do "o que se perde" unificado (front)

**Hoje:** a lista ("a transcrição", "os textos", "as sugestões", "a receita de
render") vive em três lugares com junções diferentes: `ProjectsScreen`
(vírgulas), `CutsStep` (vírgulas, e a variante null hard-coded no
`AvisoDescarte`), `UploadStep` ("receita de render" sem artigo).

**Mudança:** novo `web/src/perda.ts` exportando:
- `oQueSePerde(flags: {has_transcript?, has_overlays?, has_suggestions?, has_recipe?}): string[]`
- `listarPerdas(itens: string[]): string` — junção "a, b e c" (vírgulas +
  " e " no último), a mesma nos três lugares;
- `TUDO_QUE_SE_PERDE: string` — a frase da variante conservadora ("a
  transcrição, os textos, as sugestões e a receita de render").
Os três componentes consomem o helper; nenhum texto de tela muda além da
junção unificada ("e" antes do último item em todos). Testes de `perda.ts` +
ajuste dos testes de tela que asseverarem a junção antiga.

## 6. Acessibilidade dos diálogos (front)

**Hoje:** os cinco `role="alertdialog"` (ProjectsScreen ×2, UploadStep ×1,
CutsStep ×2) não recebem foco, não prendem Tab e não fecham com Esc.

**Mudança:** hook compartilhado `useAlertDialog` (`web/src/useAlertDialog.ts`):
- ao montar, foca o primeiro elemento focável do diálogo;
- Esc chama o `onClose` do diálogo (o mesmo do botão "Desistir"/"Cancelar");
- Tab/Shift+Tab ciclam dentro do diálogo (focus trap simples);
- ao desmontar, devolve o foco ao elemento que estava focado antes.
Todos os cinco diálogos usam o hook e ganham `aria-modal="true"`. Testes:
Esc fecha (um por tela basta), foco inicial dentro do diálogo.

## Fora de escopo

- Reforçar os testes incidentais do "Detectar pausas" citados no handoff — a
  reescrita desta sessão (describes novos de aviso/concorrência) já cobre o
  comportamento com mudanças de estado provocadas.
- 404 em rotas de update que hoje criam implicitamente o diretório
  (`update_*` via `init_job`) — mantêm o comportamento atual.
