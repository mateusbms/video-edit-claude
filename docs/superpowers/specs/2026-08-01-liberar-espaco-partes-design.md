# Design — "Liberar espaço" apaga as partes de upload + tamanhos honestos (pendência 3)

Data: 2026-08-01

## Problema

`create_job` grava os arquivos enviados em `input/<slug>-part<N>.<ext>` e só o
*excluir projeto* os apaga. O "Liberar espaço" não — então:

- o "Libera X MB" do diálogo **subestima** o que continua ocupando disco (só
  mostra `bytes_source`; as partes são outra cópia do vídeo em resolução
  cheia);
- o `bytes_total` da lista não conta as partes e **subdeclara** o tamanho
  real de cada projeto.

## Decisões (defaults registrados)

- **"Liberar espaço" passa a apagar também as partes do próprio projeto.**
  Mesmo mecanismo do excluir: `_apagar_partes_de_upload` (casamento exato via
  regex — a lição do bug do vizinho na fase 2 — e melhor-esforço, com os
  warnings do logging recém-adicionado). Roda sempre que o projeto existe,
  mesmo quando o source já não está lá: limpa partes órfãs de projetos
  liberados antes desta mudança.
- **Contrato de retorno do `delete_source` não muda**: `True` = apagou o
  source. A limpeza das partes é efeito colateral best-effort, como no
  `delete_job`.
- **`JobSummary` ganha `bytes_parts`** (partes do slug em `input/`), e
  `bytes_total` passa a **incluí-lo**. O diálogo mostra
  `bytes_source + bytes_parts`; a lista continua mostrando `bytes_total`.
- **Regex das partes vira helper único** (`_padrao_partes(slug)`), usado por
  `_apagar_partes_de_upload` e pelo novo cálculo de tamanho — uma fonte só
  para o formato `-part\d+\.[^.]+`.
- **Texto do diálogo** menciona as cópias do upload **só quando
  `bytes_parts > 0`** ("… apagando o vídeo original e as cópias do upload") —
  sem partes, a frase atual fica como está.

## Mudanças

### Backend

- `api/jobs.py`:
  - `_padrao_partes(slug)` → `re.Pattern` (extraído de
    `_apagar_partes_de_upload`);
  - `_bytes_partes(slug, input_root) -> int`: soma `_tamanho_seguro` dos
    arquivos de `input/` que casam o padrão; `iterdir` protegido como nas
    demais (OSError → 0 + warning);
  - `job_summary(job_dir, input_root, output_root)` e
    `job_summary_minimo(...)`: novo parâmetro, preenchem `bytes_parts` e
    somam em `bytes_total`;
  - `list_jobs(jobs_root, input_root, output_root)`: repassa;
  - `delete_source(slug, jobs_root, input_root)`: após localizar o projeto,
    limpa as partes (sempre); retorno inalterado.
- `api/models.py`: `bytes_parts: int = 0` no `JobSummary`.
- `api/routes.py`: repassar `input_root` nos quatro pontos (lista, guarda de
  upload em `create_job`, `remove_source`).

### Front

- `web/src/types.ts`: `bytes_parts: number` no tipo.
- `web/src/ProjectsScreen.tsx`:
  - diálogo: `Libera {tamanho(j.bytes_source + j.bytes_parts)}` + frase
    condicional sobre as cópias do upload;
  - update otimista pós-liberar: zera `bytes_source` **e** `bytes_parts`, e
    subtrai ambos de `bytes_total`.

## Testes

### Backend

- `delete_source` apaga as partes do slug e **não** as do vizinho
  (`A1` vs `A1-parte2`, mesmo cenário do teste do excluir).
- `delete_source` num projeto sem source: devolve False, mas as partes
  órfãs somem.
- `job_summary`: com partes em `input/`, `bytes_parts` soma só as do slug e
  `bytes_total` as inclui; sem partes, `bytes_parts == 0` e nada muda.
- Assinaturas novas: testes existentes de rotas/list continuam verdes após o
  ajuste de chamadas.

### Front

- Diálogo de liberar espaço mostra a soma (source + partes).
- Com `bytes_parts > 0`, a frase menciona as cópias do upload; com 0, não.
- Depois de liberar, o update otimista zera os dois e ajusta `bytes_total`.

## Fora de escopo

- Contar as partes no `updated_at`.
- Qualquer mudança no fluxo de upload/create_job.
