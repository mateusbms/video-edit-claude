# Design — logging nos caminhos que engolem erro (pendência 2 do handoff)

Data: 2026-08-01

## Problema

`import logging` não aparece em `api/` nem em `pipeline/`. A tela de projetos
(fase 2) criou caminhos que engolem erro **por desenho** — todos erram para o
lado seguro, mas ninguém fica sabendo:

- `_tamanho_seguro`/`_mtime_seguro` devolvem 0 para qualquer `OSError`: um
  arquivo sem permissão vira "0.0 MB" na lista — e "Libera 0.0 MB" num diálogo
  destrutivo cuja única justificativa é esse número;
- `_apagar_partes_de_upload` é melhor-esforço: uma parte travada fica órfã em
  `input/` sem deixar rastro;
- `job_summary`/`job_summary_minimo` tratam config corrompido como "não é um
  job"/resumo mínimo, silenciosamente.

## Decisões (defaults registrados, sem ambiguidade)

- **stdlib `logging`, console.** `logging.basicConfig` em `api/app.py` (nível
  INFO, formato com timestamp/nível/módulo) — o uvicorn já loga no console;
  os logs da aplicação vão para o mesmo lugar. Sem arquivo, sem rotação, sem
  dependência nova (YAGNI).
- **Loggers por módulo**: `logger = logging.getLogger(__name__)` no topo de
  `api/jobs.py`. Nada de logger global compartilhado.
- **`FileNotFoundError` continua silencioso em `_tamanho_seguro`/
  `_mtime_seguro`.** É o caso *esperado* que motivou as funções (corrida com
  `stage_refine` criando/substituindo `trimmed.refined.mp4`); logá-lo seria
  ruído a cada refino. Só o `OSError` restante (permissão, I/O) — o que
  produz "0.0 MB" sem explicação — ganha `logger.warning` com o caminho e o
  erro.
- **`append_job_log` (log.txt por job) não muda.** É outro mecanismo, com
  outro público (o dono do projeto); esta spec cobre o log operacional do
  servidor.

## Pontos que ganham log (todos `warning`)

| Onde | Quando | Mensagem contém |
|---|---|---|
| `_tamanho_seguro` | `OSError` exceto `FileNotFoundError` | caminho + erro ("tamanho ilegível, contando 0") |
| `_mtime_seguro` | idem | caminho + erro |
| `_apagar_partes_de_upload` | `iterdir()` falha | input_root + erro |
| `_apagar_partes_de_upload` | `unlink()` de uma parte falha | caminho da parte órfã + erro |
| `job_summary` | config ilegível (`except Exception` do `load_json`) | caminho do config + erro |
| `job_summary` | probe ilegível (`except Exception` do probe.json) | caminho do probe + erro |
| `job_summary_minimo` | `iterdir()` falha (`except OSError` → `arquivos = []`, que zera tamanhos e `updated_at`) | job_dir + erro |

Comportamento externo **não muda**: mesmos retornos, mesmos fallbacks. Só
aparece o rastro.

## Testes (pytest `caplog`)

- `_tamanho_seguro` com `PermissionError` (monkeypatch em `Path.stat`) →
  devolve 0 **e** registra warning com o caminho.
- `_tamanho_seguro` com `FileNotFoundError` → devolve 0 **sem** warning.
- `_apagar_partes_de_upload` com `unlink` falhando (monkeypatch) → não
  levanta, apaga as demais partes e registra warning nomeando a órfã.
- `job_summary` com `job.config.json` corrompido (JSON inválido em disco) →
  devolve None e registra warning.

## Fora de escopo

- Logging em `pipeline/` (os stages têm o SSE de progresso e o log.txt por
  job; instrumentar o pipeline é outro trabalho).
- Arquivo de log, rotação, structured logging.
