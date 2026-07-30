# Tela de projetos: listar, reabrir e proteger contra sobrescrita

## Problema

Todo trabalho já é persistido por job em `jobs/<slug>/` — source, corte, vídeo
cortado, transcrição, hook, textos, sugestões, recipe e preferências. Cada passo
do wizard relê o servidor ao montar. Na prática dá para voltar num projeto hoje:
basta digitar o slug certo no passo 1.

Falta a camada que torna isso utilizável:

1. **Não há como listar os projetos.** Todas as rotas são por slug; nenhuma
   responde "quais existem". O usuário precisa decorar os nomes.
2. **A sobrescrita é silenciosa e provável.** O campo de nome no passo 1 vem
   pré-preenchido com o slug atual (`UploadStep.tsx:16`), então o caminho de
   menor esforço para começar um vídeo novo é reusar o nome do anterior. Foi o
   que aconteceu: um upload trocou o `source.mp4` de um job que já tinha
   transcrição e textos.
3. **Ações destrutivas não avisam.** Aplicar corte manual apaga transcrição,
   textos, sugestões e recipe (`stages.py`, no `stage_refine`). É correto — o
   vídeo encurtou e as legendas ficariam fora de sincronia — mas nada avisa.
   Num projeto reaberto semanas depois, isso custa caro.
4. **Disco cresce sem limite.** Cada projeto guarda o source inteiro; três
   projetos somam 1,1 GB.

## Decisões tomadas

- **Disco:** a tela oferece *excluir projeto* e *liberar espaço* (apagar só o
  source) como ações separadas.
- **Identidade:** título legível editável, com o slug seguindo como nome de
  pasta e do arquivo exportado.
- **Aviso do corte manual:** confirma antes de aplicar, mas só quando existe
  transcrição ou textos a perder.

## Apagar o source: o que se perde

Registrado aqui porque a UI precisa explicar isso ao usuário no momento da ação.

`source.mp4` é lido num único ponto do código de produção: `stage_cut`. Sem ele:

- **Continua funcionando:** transcrever, editar legendas, hook, textos,
  sugestões, renderizar — tudo opera sobre o `trimmed.mp4`. Cortes manuais
  adicionais também: `stage_refine` recorta o `trimmed.mp4`.
- **Deixa de funcionar:** o "Detectar pausas". Refazer o corte automático com
  outros parâmetros é impossível naquele projeto, para sempre.
- **Perde-se o master 4K.** `build_scale_filter` reduz o lado maior para 1920,
  então o `trimmed.mp4` é 1080p. O render sai em 1080p de qualquer forma, mas o
  caminho para um 4K futuro some junto com o source.
- **Perde-se o material que o corte automático descartou.** Corte manual só
  remove; nunca devolve.

Não existe caminho de volta: reenviar o original para o mesmo slug apaga o
trabalho derivado (comportamento do `stage_ingest`, corrigido em 30/07).

## Arquitetura

### Backend

Seis pontas. Uma restrição atravessa todas: **`init_job` cria o diretório**
(`job.py`), então nada que apenas consulta pode chamá-lo — consultar um slug
inexistente o criaria. A listagem varre `jobs/` e lê `job.config.json` direto.

| rota | comportamento |
|---|---|
| `GET /api/jobs` | lista os projetos |
| `PUT /api/jobs/{slug}/title` | grava o título legível |
| `DELETE /api/jobs/{slug}` | apaga a pasta do job; **não** toca em `output/` |
| `DELETE /api/jobs/{slug}/source` | apaga só o `source.mp4` |
| `POST /api/jobs` | novo campo `overwrite`; sem ele, slug ocupado → 409 |
| `POST /api/jobs/{slug}/cut` | 409 explicando quando o source foi apagado |

**`GET /api/jobs`** devolve, por projeto: `slug`, `title`, `updated_at`,
`orientation`, as flags de progresso que o `JobState` já monta (`has_trimmed`,
`has_transcript`, `has_hook`, `has_recipe`, `has_render_16x9`,
`has_render_9x16`), mais `has_source`, `bytes_source` e `bytes_total`. Nova
função `list_jobs(jobs_root, output_root)` em `api/jobs.py`. Diretórios sem
`job.config.json` são ignorados; arquivos soltos dentro de `jobs/` também.

**`POST /api/jobs` com `overwrite=False`** e um slug que já tem derivados
responde 409 com o que existe naquele projeto (as mesmas flags da listagem),
para a UI montar o diálogo sem uma segunda chamada. Um slug que existe mas está
vazio (só `job.config.json`) não bloqueia — não há o que perder. É esta guarda,
e não o diálogo, que torna a sobrescrita silenciosa impossível: a proteção vive
no servidor, não na tela.

**`POST /api/jobs/{slug}/cut` sem source** responde 409 dizendo que o vídeo
original foi apagado para liberar espaço e que só cortes manuais seguem
disponíveis. Hoje esse caso estoura dentro do ffmpeg com erro ilegível.

**`DELETE /api/jobs/{slug}`** apaga `jobs/<slug>/` inteiro. O render exportado
em `output/<slug>-*.mp4` sobrevive, deliberadamente: é o entregável, e o
usuário pode ter apagado o projeto justamente por já tê-lo exportado.

### Dados

Um campo novo: `title: str = ""` em `JobConfig`. Retrocompatível — `init_job`
faz `JobConfig(**data)`, e configs antigas simplesmente não trazem a chave,
caindo no default. Nenhum outro formato muda.

Quando `title` está vazio, a UI exibe o slug. Não há migração: projetos
existentes aparecem pelo slug até serem renomeados.

### Frontend

**Tela de projetos** entre o `ModeSelect` e o wizard. `slug` vazio significa
"estou na lista" — o `state.ts` já persiste `{slug, step}` no localStorage, e
voltar para a lista é limpar o slug. O wizard ganha um "← Projetos" no
cabeçalho.

Cada linha mostra título, slug, data, formato, em que passo parou e tamanho,
com três ações: **Abrir**, **Liberar espaço**, **Excluir**. As duas últimas
pedem confirmação, e a confirmação diz o que sobrevive.

**Novo projeto** sugere o próximo slug livre (`A4`), não o slug atual. Este é o
conserto da causa raiz do incidente: o padrão deixa de apontar para a
sobrescrita. O campo de título entra junto na fase 2; até lá o slug é o nome.

**Diálogo de colisão**, disparado pelo 409 do upload, com três saídas:

- *Criar novo projeto* (padrão), já com um slug livre sugerido
- *Abrir o existente como está*
- *Substituir o vídeo* — descarta corte, transcrição e textos; mantém o render
  já exportado

**`CutsStep`:** "Detectar pausas" desabilitado com explicação quando
`has_source` é falso; confirmação antes de `applyRefine` quando existe
transcrição ou textos, listando o que será descartado.

## Faseamento

Três entregas independentes, em ordem de valor:

1. `GET /api/jobs`, tela de lista, abrir projeto, guarda de sobrescrita no
   upload e o diálogo de colisão. Resolve a dor que originou o pedido.
2. Título editável, excluir projeto, liberar espaço.
3. Os dois avisos: cut sem source e a cascata do corte manual.

## Testes

**Backend**
- `list_jobs`: diretório vazio; vários projetos; ignora arquivos soltos e
  diretórios sem `job.config.json`; não cria diretório para slug inexistente.
- Título: persiste; config antiga sem a chave lê com default vazio.
- `DELETE /jobs/{slug}`: apaga a pasta e preserva `output/<slug>-9x16.mp4`.
- `DELETE /jobs/{slug}/source`: some o source, sobrevivem trimmed, transcrição
  e textos; `has_source` vira falso na listagem.
- Upload: 409 quando o slug tem derivados e `overwrite` é falso; passa com
  `overwrite`; não bloqueia slug vazio; o corpo do 409 traz as flags.
- Cut: 409 quando falta o source, sem chamar o ffmpeg.

**Frontend**
- A lista renderiza os projetos e abrir seta o slug e entra no wizard.
- O diálogo de colisão aparece no 409 e cada uma das três saídas faz o esperado.
- "Detectar pausas" desabilitado sem source, com a explicação visível.
- A confirmação do corte manual aparece só quando há transcrição ou textos, e
  cancelar não chama `/refine`.

**Regressão a cobrir:** o teste que hoje garante que reenviar para o mesmo slug
invalida os derivados continua valendo — a guarda de 409 vem antes dele, não no
lugar dele.
