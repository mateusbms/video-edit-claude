import logging
import re
import shutil
from dataclasses import asdict
from pathlib import Path

from api.models import (
    CutParams,
    CutResult,
    CutSegmentOut,
    Hook,
    JobState,
    JobSummary,
    ProbeOut,
)
from pipeline.job import JobConfig, init_job, load_json, write_json
from pipeline.orientation import FRAME_SIZES, frame_size, resolve_orientation
from pipeline.recipe import brand_of_kit, resolve_caption_style
from pipeline.stages import DERIVADOS_DO_SOURCE

logger = logging.getLogger(__name__)


ALLOWED_FILES = {
    "trimmed.mp4",
}


def cut_result(job_dir: Path) -> CutResult | None:
    """O resultado do corte reconstruído do disco, ou None se ainda não houve corte.

    O `POST /cut` monta esse mesmo objeto a partir dos mesmos três arquivos.
    Ter uma função só evita que a resposta ao vivo e a recarregada divirjam —
    o passo de Cortes desmonta ao trocar de aba e precisa reconstruir tudo.

    Nota: `stage_refine` reescreve trimmed.probe.json mas não cuts.json, então
    depois de um corte manual a duração é a refinada e os segmentos são os da
    detecção original. É a mesma combinação que o front já mostra ao vivo.
    """
    cuts_p = job_dir / "cuts.json"
    probe_p = job_dir / "probe.json"
    tprobe_p = job_dir / "trimmed.probe.json"
    trimmed_p = job_dir / "trimmed.mp4"
    if not (cuts_p.exists() and probe_p.exists() and tprobe_p.exists()):
        return None
    return CutResult(
        original_duration=load_json(probe_p)["duration"],
        trimmed_duration=load_json(tprobe_p)["duration"],
        segments=[CutSegmentOut(**c) for c in load_json(cuts_p)],
        trimmed_mtime=trimmed_p.stat().st_mtime if trimmed_p.exists() else 0.0,
    )


def tem_trabalho(job_dir: Path) -> bool:
    """Se há algo a perder ao trocar o vídeo deste projeto.

    Fonte única: o source mais tudo que `stage_ingest` apaga ao reingerir.
    Manter uma segunda lista à mão já tinha deixado `overlays.json` e
    `suggestions.json` de fora da guarda de upload — trabalho real do usuário.
    """
    if not job_dir.is_dir():
        return False
    return (job_dir / "source.mp4").exists() or any(
        (job_dir / nome).exists() for nome in DERIVADOS_DO_SOURCE
    )


def _tem_conteudo_lista(path: Path) -> bool:
    """Se *path* existe e guarda uma lista JSON não vazia.

    overlays.json e suggestions.json podem existir vazios — passar pelo passo
    Textos sem escrever nada grava `[]` (ver stage_recipe/o editor de
    overlays). "Existe" sozinho não é "tem conteúdo perdível": a flag
    baseada só em existência gerava aviso de perda para um projeto que não
    tem nada a perder ali. Arquivo ilegível ou com um JSON que não é lista
    conta como True — na dúvida, avisar é o lado seguro (mantém o
    comportamento de antes desta função existir).
    """
    if not path.exists():
        return False
    try:
        data = load_json(path)
    except Exception as e:  # noqa: BLE001
        logger.warning("lista ilegível em %s, contando como 'tem conteúdo': %s", path, e)
        return True
    if not isinstance(data, list):
        return True
    return len(data) > 0


def job_summary(job_dir: Path, input_root: Path, output_root: Path) -> JobSummary | None:
    """Resumo de um projeto, ou None se o diretório não for um job.

    Lê o job.config.json direto em vez de chamar init_job: init_job cria o
    diretório, e consultar um slug inexistente não pode criá-lo.
    """
    cfg_path = job_dir / "job.config.json"
    if not job_dir.is_dir() or not cfg_path.exists():
        return None
    try:
        cfg = load_json(cfg_path)
    except Exception as e:
        logger.warning("config ilegível em %s: %s", cfg_path, e)
        return None

    arquivos = [p for p in job_dir.iterdir() if p.is_file()]
    source = job_dir / "source.mp4"
    probe = None
    probe_path = job_dir / "probe.json"
    if probe_path.exists():
        try:
            probe = load_json(probe_path)
        except Exception as e:
            logger.warning("probe ilegível em %s: %s", probe_path, e)
            probe = None

    slug = job_dir.name
    renders = [output_root / f"{slug}-16x9.mp4", output_root / f"{slug}-9x16.mp4"]
    bytes_parts = _bytes_partes(slug, input_root)
    return JobSummary(
        slug=slug,
        title=cfg.get("title", ""),
        updated_at=max((p.stat().st_mtime for p in arquivos), default=0.0),
        orientation=resolve_orientation(cfg.get("orientation", ""), probe),
        has_source=source.exists(),
        has_trimmed=(job_dir / "trimmed.mp4").exists(),
        has_transcript=(job_dir / "transcript.json").exists(),
        has_hook=(job_dir / "hook.json").exists(),
        has_recipe=(job_dir / "edit-recipe.json").exists(),
        has_overlays=_tem_conteudo_lista(job_dir / "overlays.json"),
        has_suggestions=_tem_conteudo_lista(job_dir / "suggestions.json"),
        has_render_16x9=(output_root / f"{slug}-16x9.mp4").exists(),
        has_render_9x16=(output_root / f"{slug}-9x16.mp4").exists(),
        bytes_source=source.stat().st_size if source.exists() else 0,
        bytes_total=sum(p.stat().st_size for p in arquivos) + bytes_parts,
        bytes_render=sum(p.stat().st_size for p in renders if p.exists()),
        bytes_parts=bytes_parts,
    )


def _tamanho_seguro(p: Path) -> int:
    """Tamanho de *p*, ou 0 se o arquivo sumiu entre listar e ler o stat.

    job_summary_minimo é a rede de segurança que a guarda de upload usa para
    montar o 409 de sobrescrita: ela precisa devolver um resumo mesmo quando
    o diretório tem arquivos transitórios em disco — stage_refine cria e
    substitui trimmed.refined.mp4 dentro do job, então um refino rodando em
    paralelo já basta para um FileNotFoundError entre o iterdir() e o stat(),
    sem precisar de um DELETE concorrente.
    """
    try:
        return p.stat().st_size
    except FileNotFoundError:
        return 0
    except OSError as e:
        logger.warning("tamanho ilegível de %s, contando 0: %s", p, e)
        return 0


def _mtime_seguro(p: Path) -> float:
    """Mesma proteção de `_tamanho_seguro`, para `updated_at`."""
    try:
        return p.stat().st_mtime
    except FileNotFoundError:
        return 0.0
    except OSError as e:
        logger.warning("mtime ilegível de %s, contando 0: %s", p, e)
        return 0.0


def _bytes_partes(slug: str, input_root: Path) -> int:
    """Soma o tamanho das cópias de upload do slug em input/ (ver
    `_padrao_partes`).

    "Liberar espaço" apaga o source, mas as partes que o geraram (outra cópia
    do vídeo em resolução cheia) continuavam de fora da contagem — o "Libera X
    MB" do diálogo subestimava o que realmente some, e bytes_total da lista
    subdeclarava o tamanho real do projeto. Melhor-esforço como o resto deste
    módulo: iterdir protegido (OSError → 0 + warning) e `_tamanho_seguro` por
    arquivo.
    """
    root = Path(input_root)
    if not root.is_dir():
        return 0
    padrao = _padrao_partes(slug)
    try:
        candidatos = [p for p in root.iterdir() if p.is_file() and padrao.fullmatch(p.name)]
    except OSError as e:
        logger.warning("iterdir falhou em %s, bytes_parts contado como 0: %s", root, e)
        return 0
    return sum(_tamanho_seguro(p) for p in candidatos)


def job_summary_minimo(job_dir: Path, input_root: Path, output_root: Path) -> JobSummary | None:
    """Resumo mínimo de um job cujo job.config.json está ausente ou não pôde
    ser lido.

    `job_summary` devolve None nesse caso — e None não pode virar "o slug não
    existe" na guarda de upload (I1): o diretório pode ter source, corte,
    transcrição e textos de verdade que um config corrompido não apaga.
    Exigido só isto (nunca job.config.json): a checagem real é `tem_trabalho`.

    Calcula tamanhos, `updated_at` e flags de render do mesmo jeito que
    `job_summary` — sem isso, um projeto nesta condição entrava na lista como
    "16:9 · 0.0 MB", e o diálogo de "Liberar espaço" (cuja única justificativa
    é o tamanho) abria dizendo "Libera 0.0 MB" mesmo com o source intacto.
    Fica de fora só o que depende de um config legível: título e orientação
    escolhida (cai no default 16:9 do model).

    `_tamanho_seguro`/`_mtime_seguro` blindam as leituras de tamanho/mtime
    contra um arquivo transitório (stage_refine substituindo
    trimmed.refined.mp4 no meio da leitura, por exemplo) — mas isto NÃO é uma
    garantia de que a função nunca levanta: os `.exists()` abaixo só engolem
    ENOENT/ENOTDIR/EBADF/ELOOP (o que o pathlib ignora por padrão), e uma
    PermissionError/WinError 32 ou um WinError 5 de delete-pending (o mesmo
    estado que `ArquivoEmUsoError` documenta) passam direto. Quem depende de
    "não levanta" é quem chama, não esta função: a guarda de sobrescrita em
    `create_job` trata qualquer exceção (daqui ou de `job_summary`) como
    "ainda não sei se há trabalho, então recuso" — nunca como "não há
    trabalho, pode sobrescrever" (ver o comentário lá).
    """
    if not tem_trabalho(job_dir):
        return None
    try:
        arquivos = [p for p in job_dir.iterdir() if p.is_file()]
    except OSError as e:
        logger.warning("iterdir falhou em %s, tamanhos e updated_at zerados: %s", job_dir, e)
        arquivos = []
    source = job_dir / "source.mp4"
    has_source = source.exists()
    slug = job_dir.name
    renders = [output_root / f"{slug}-16x9.mp4", output_root / f"{slug}-9x16.mp4"]
    bytes_parts = _bytes_partes(slug, input_root)
    return JobSummary(
        slug=slug,
        updated_at=max((_mtime_seguro(p) for p in arquivos), default=0.0),
        has_source=has_source,
        has_trimmed=(job_dir / "trimmed.mp4").exists(),
        has_transcript=(job_dir / "transcript.json").exists(),
        has_hook=(job_dir / "hook.json").exists(),
        has_recipe=(job_dir / "edit-recipe.json").exists(),
        has_overlays=_tem_conteudo_lista(job_dir / "overlays.json"),
        has_suggestions=_tem_conteudo_lista(job_dir / "suggestions.json"),
        has_render_16x9=(output_root / f"{slug}-16x9.mp4").exists(),
        has_render_9x16=(output_root / f"{slug}-9x16.mp4").exists(),
        bytes_source=_tamanho_seguro(source) if has_source else 0,
        bytes_total=sum(_tamanho_seguro(p) for p in arquivos) + bytes_parts,
        bytes_render=sum(_tamanho_seguro(p) for p in renders if p.exists()),
        bytes_parts=bytes_parts,
    )


def list_jobs(jobs_root: Path, input_root: Path, output_root: Path) -> list[JobSummary]:
    """Projetos existentes, do mais recente para o mais antigo.

    Cada resumo é montado isoladamente: um render ou um refine concorrente
    pode apagar/substituir um arquivo entre o `iterdir()` e o `stat()` de
    `job_summary`, e isso não pode derrubar a listagem inteira — só aquele
    job fica de fora desta resposta (a próxima varredura pega ele de novo).
    """
    root = Path(jobs_root)
    if not root.is_dir():
        return []
    resumos = []
    for d in root.iterdir():
        try:
            # config ilegível cai no resumo mínimo: um projeto invisível na
            # lista não pode ser apagado, e ele ainda bloqueia o upload com 409
            s = (
                job_summary(d, Path(input_root), Path(output_root))
                or job_summary_minimo(d, Path(input_root), Path(output_root))
            )
        except Exception:
            continue
        if s:
            resumos.append(s)
    return sorted(resumos, key=lambda s: s.updated_at, reverse=True)


class ProjetoNaoEncontradoError(Exception):
    """O projeto (diretório) não existe."""


class ArquivoEmUsoError(Exception):
    """Um processo ainda tem arquivos do projeto abertos; não deu para apagar.

    cut/transcribe/render rodam em thread de background (api/progress.py)
    enquanto a API segue atendendo — no Windows o ffmpeg mantém source.mp4/
    trimmed.mp4 abertos, e tentar apagar um arquivo aberto estoura
    PermissionError.
    """


def _job_dir_seguro(slug: str, jobs_root: Path) -> Path | None:
    """Caminho do job, ou None se o slug tentar escapar de jobs_root.

    Apagar é irreversível e não há lixeira: um slug precisa ser exatamente um
    segmento dentro de jobs_root. Checar só contenção (algo como "root está
    entre os parents de alvo") deixa passar aninhamento — um slug como
    "meu-job\\audio" (a barra invertida é separador de path no Windows) resolve
    para dentro de jobs_root/meu-job/audio, que está contido em jobs_root mas
    não é o diretório de um projeto, e sim uma subpasta dele (onde a locução
    da ElevenLabs é gravada). Exigir que o pai do alvo seja exatamente
    jobs_root cobre de uma vez isso, "..", caminho absoluto e aninhamento.
    """
    root = Path(jobs_root).resolve()
    try:
        alvo = (root / slug).resolve()
    except (ValueError, OSError):
        # slug com caractere nulo embutido (%00) faz resolve() levantar
        # ValueError; nada é apagado, mas não pode virar 500 cru.
        return None
    if alvo.parent != root:
        return None
    return alvo


def delete_job(slug: str, jobs_root: Path, input_root: Path) -> bool:
    """Apaga o diretório do job e as partes de upload que criaram o source em
    input/. Não toca em output/ — o render exportado sobrevive de propósito.
    Devolve False se não havia o que apagar.

    Levanta ArquivoEmUsoError se o rmtree esbarrar num arquivo aberto por
    outro processo — nesse caso a árvore pode ter ficado parcialmente
    apagada, e quem chama precisa saber que não foi uma operação limpa. Um
    FileNotFoundError no meio do rmtree não é isso: é o caso de dois DELETEs
    concorrentes no mesmo slug, e vira o mesmo False de "não havia o que
    apagar" (404), não um falso 409 de "arquivo em uso".

    A limpeza das partes de upload roda só depois do rmtree ter dado certo —
    o projeto em si já foi apagado nesse ponto — e é melhor-esforço: ver
    `_apagar_partes_de_upload`.
    """
    alvo = _job_dir_seguro(slug, jobs_root)
    if alvo is None or not alvo.is_dir():
        return False
    try:
        shutil.rmtree(alvo)
    except FileNotFoundError:
        return False
    except OSError as e:
        raise ArquivoEmUsoError(
            "não deu para apagar: há um processo usando os arquivos deste projeto"
        ) from e
    _apagar_partes_de_upload(alvo.name, input_root)
    return True


def _padrao_partes(slug: str) -> re.Pattern:
    """Padrão exato de input/<slug>-part<N>.<ext> — as cópias que create_job
    grava de cada arquivo enviado (`f"{slug}-part{i}{suffix}"`) antes de
    concatená-las em source.mp4.

    Fonte única para `_apagar_partes_de_upload` e `_bytes_partes`: casamento
    exato via regex, não um glob com curinga. O slug é texto livre digitado
    pelo usuário, e um padrão como "{slug}-part*" casaria também
    "A1-parte2-part0.mp4" e "A1-part2-part1.mov" para o slug "A1" — as partes
    de projetos vizinhos com nome parecido ("parte" é palavra provável num
    nome em português). O `\\d+` logo após "-part" e o `\\.` exigido depois
    dos dígitos fecham as duas aberturas: nenhum arquivo fora do formato
    exato que create_job grava casa.
    """
    return re.compile(re.escape(slug) + r"-part\d+\.[^.]+")


def _apagar_partes_de_upload(slug: str, input_root: Path) -> None:
    """Apaga input/<slug>-part<N>.<ext> (ver `_padrao_partes`).

    Sem isto, cada projeto excluído deixava cópias invisíveis do vídeo
    original em input/, numa tela cuja razão de existir é o disco não crescer
    sem limite: nem excluir nem liberar espaço nunca as apagava.

    Melhor-esforço: o diretório do job já foi apagado (ou o source já não
    existe mais) quando isto roda, então uma parte travada (arquivo em uso,
    por exemplo) não pode virar um 409 numa operação que já aconteceu — e não
    pode abandonar as partes restantes por causa de uma que falhou.
    """
    root = Path(input_root)
    if not root.is_dir():
        return
    padrao = _padrao_partes(slug)
    try:
        candidatos = [p for p in root.iterdir() if p.is_file() and padrao.fullmatch(p.name)]
    except OSError as e:
        logger.warning("iterdir falhou em %s, partes de upload não apagadas: %s", root, e)
        return
    for p in candidatos:
        try:
            p.unlink()
        except OSError as e:
            logger.warning("não deu para apagar a parte órfã %s: %s", p, e)
            continue


def delete_source(slug: str, jobs_root: Path, input_root: Path) -> bool:
    """Apaga o source.mp4 e as partes de upload que o geraram, mantendo
    corte, transcrição e textos.

    O que se perde: refazer o corte automático (stage_cut é o único leitor do
    source), o master em resolução original e as cópias de upload em input/
    (mesma outra cópia em resolução cheia, ver `_apagar_partes_de_upload`). O
    que continua: transcrever, editar textos, cortes manuais e renderizar,
    que operam sobre o trimmed.

    A limpeza das partes roda sempre que o projeto existe — inclusive quando
    o source já não está lá, ou quando o unlink do source falha — para varrer
    partes órfãs de projetos liberados antes desta função existir. É
    melhor-esforço e não muda o contrato de retorno: True continua
    significando só "apagou o source".

    Levanta ProjetoNaoEncontradoError se o diretório do projeto não existir —
    distinto de "existe mas não tem source", que devolve False. Levanta
    ArquivoEmUsoError se o unlink do source esbarrar num arquivo aberto por
    outro processo. Um FileNotFoundError (dois DELETEs concorrentes no mesmo
    slug) não é isso: vira o mesmo False de "não havia o que apagar".
    """
    alvo = _job_dir_seguro(slug, jobs_root)
    if alvo is None or not alvo.is_dir():
        raise ProjetoNaoEncontradoError(f"projeto {slug!r} não encontrado")
    _apagar_partes_de_upload(alvo.name, input_root)
    source = alvo / "source.mp4"
    if not source.exists():
        return False
    try:
        source.unlink()
    except FileNotFoundError:
        return False
    except OSError as e:
        raise ArquivoEmUsoError(
            "não deu para apagar: há um processo usando os arquivos deste projeto"
        ) from e
    return True


def get_state(slug: str, jobs_root: Path) -> JobState:
    """Estado de um projeto para as telas lerem.

    Lê o job.config.json direto (defaults de JobConfig se não existir) em vez
    de chamar init_job: get_state é usado por rotas de consulta, e nada que
    apenas consulta pode criar o diretório do job — mesmo raciocínio de
    job_summary. Quem precisa do diretório/arquivo criados chama init_job
    separadamente (create_job, update_config etc. já fazem isso).

    Levanta ProjetoNaoEncontradoError se o diretório do job não existe: um
    slug digitado errado (ou obsoleto no localStorage do front) não pode
    receber um estado default confiante — as rotas de leitura (`GET
    /jobs/{slug}`, `POST /cut`, `POST /suggest`) traduzem isso para 404.
    Rotas que chamam get_state depois de init_job/update_* (diretório já
    garantido) nunca veem esta exceção na prática.
    """
    job_dir = Path(jobs_root) / slug
    if not job_dir.is_dir():
        raise ProjetoNaoEncontradoError(f"projeto {slug!r} não encontrado")
    probe = None
    if (job_dir / "probe.json").exists():
        d = load_json(job_dir / "probe.json")
        probe = ProbeOut(**d)
    cfg_path = job_dir / "job.config.json"
    if cfg_path.exists():
        job_config = JobConfig(**load_json(cfg_path))
    else:
        job_config = JobConfig()
    config = CutParams(
        silence_threshold_db=job_config.silence_threshold_db,
        padding=job_config.padding,
        min_silence=job_config.min_silence,
    )
    state = JobState(
        slug=slug,
        probe=probe,
        config=config,
        has_trimmed=(job_dir / "trimmed.mp4").exists(),
        has_transcript=(job_dir / "transcript.json").exists(),
        has_hook=(job_dir / "hook.json").exists(),
        has_recipe=(job_dir / "edit-recipe.json").exists(),
        has_source=(job_dir / "source.mp4").exists(),
        has_overlays=_tem_conteudo_lista(job_dir / "overlays.json"),
        has_suggestions=_tem_conteudo_lista(job_dir / "suggestions.json"),
        has_render_16x9=False,  # preenchido pelo caller com OUTPUT_ROOT
        has_render_9x16=False,
    )
    state.captionStyle = {
        "fontSize": job_config.caption_font_size,
        "bottom": job_config.caption_bottom,
        "color": job_config.caption_color,
        "highlightColor": job_config.caption_highlight,
        "fontFamily": job_config.caption_font,
    }
    # o que o render vai realmente usar (brand kit já aplicado). O preview
    # precisa disso: com a fonte errada a quebra de linha da legenda diverge.
    state.captionStyleResolved = resolve_caption_style(
        state.captionStyle, brand_of_kit(job_config.brand_kit_slug)
    )
    state.brandKitSlug = job_config.brand_kit_slug
    state.orientation = resolve_orientation(
        job_config.orientation,
        probe.model_dump() if probe else None,
    )
    return state


def update_config(slug: str, jobs_root: Path, params: CutParams) -> None:
    if _job_dir_seguro(slug, jobs_root) is None:
        raise ProjetoNaoEncontradoError(f"projeto {slug!r} não encontrado")
    init_job(jobs_root, slug)
    cfg_path = Path(jobs_root) / slug / "job.config.json"
    cfg = load_json(cfg_path)
    cfg["silence_threshold_db"] = params.silence_threshold_db
    cfg["padding"] = params.padding
    cfg["min_silence"] = params.min_silence
    write_json(cfg_path, cfg)


def update_whisper_model(slug: str, jobs_root: Path, model_size: str, language: str) -> None:
    cfg_path = Path(jobs_root) / slug / "job.config.json"
    cfg = load_json(cfg_path)
    cfg["whisper_model"] = model_size
    cfg["language"] = language
    write_json(cfg_path, cfg)


def update_hook_card_frames(slug: str, jobs_root: Path, frames: int) -> None:
    cfg_path = Path(jobs_root) / slug / "job.config.json"
    cfg = load_json(cfg_path)
    cfg["hook_card_frames"] = frames
    write_json(cfg_path, cfg)


def update_caption_style(slug: str, jobs_root: Path, style) -> None:
    if _job_dir_seguro(slug, jobs_root) is None:
        raise ProjetoNaoEncontradoError(f"projeto {slug!r} não encontrado")
    job = init_job(jobs_root, slug)
    job.config.caption_font_size = style.fontSize
    job.config.caption_bottom = style.bottom
    job.config.caption_color = style.color
    job.config.caption_highlight = style.highlightColor
    job.config.caption_font = style.fontFamily
    write_json(job.dir / "job.config.json", asdict(job.config))


def update_title(slug: str, jobs_root: Path, title: str) -> None:
    """Grava o título legível. Espaços em volta somem, e um título só de
    espaços vira vazio — senão a lista mostraria um nome em branco em vez de
    cair no slug.

    Levanta ProjetoNaoEncontradoError se o projeto não existir: ao contrário
    de update_config/update_caption_style/etc., que só são chamadas depois de
    um upload, esta rota pode ser chamada depois de um Excluir confirmado — a
    tela fecha o modo de renomear antes da resposta do PUT resolver, e um
    Excluir que chega primeiro apaga o diretório embaixo dela. Usar init_job
    sem checar antes ressuscitava o diretório recém-apagado; e as duas rotas
    de DELETE já respondem 404 para um slug inexistente, então PUT /title
    precisa concordar. Usa o mesmo _job_dir_seguro dos DELETEs para as rotas
    concordarem também sobre o que é um slug válido (sem isso, no Windows um
    slug como "projeto%5Caudio" grava job.config.json dentro de uma subpasta
    do projeto, não no projeto).
    """
    alvo = _job_dir_seguro(slug, jobs_root)
    if alvo is None or not alvo.is_dir():
        raise ProjetoNaoEncontradoError(f"projeto {slug!r} não encontrado")
    job = init_job(jobs_root, slug)
    job.config.title = title.strip()
    write_json(job.dir / "job.config.json", asdict(job.config))


def update_brand_kit(slug: str, jobs_root: Path, kit_slug: str) -> None:
    if _job_dir_seguro(slug, jobs_root) is None:
        raise ProjetoNaoEncontradoError(f"projeto {slug!r} não encontrado")
    job = init_job(jobs_root, slug)
    job.config.brand_kit_slug = kit_slug
    write_json(job.dir / "job.config.json", asdict(job.config))


def _max_caption_bottom(font_size: int, orientation: str) -> int:
    """Maior `caption_bottom` que deixa o bloco da legenda dentro do frame.

    Espelho de web/src/overlayGeom.ts::maxCaptionBottom — o 1.6 é a altura
    aproximada do bloco (uma linha com o lineHeight 1.2 do CaptionLayer, mais
    folga). Mudar de um lado pede mudar do outro.
    """
    _, height = frame_size(orientation)
    return max(0, int(height - font_size * 1.6))


def update_orientation(slug: str, jobs_root: Path, orientation: str) -> None:
    """Grava a orientação escolhida. "" volta ao auto-detectar pelo probe.

    Se a orientação efetiva mudou, a `edit-recipe.json` em disco fica obsoleta:
    ela carrega o `orientation` e o `formats` de quando foi gerada, e o render
    escolhe a composição pelo estado atual do job. Mesmo padrão de
    `pipeline/stages.py::stage_refine`, que apaga os artefatos derivados quando
    a origem muda.

    init_job roda antes do primeiro get_state de propósito: esta rota cria o
    projeto implicitamente (fora do escopo do 404 de slug inexistente), e
    get_state agora levanta ProjetoNaoEncontradoError para um diretório que
    ainda não existe — chamá-lo antes de init_job quebraria justo o caso
    comum de um slug novo.
    """
    if orientation != "" and orientation not in FRAME_SIZES:
        raise ValueError(f"orientação inválida: {orientation!r}")
    if _job_dir_seguro(slug, jobs_root) is None:
        raise ProjetoNaoEncontradoError(f"projeto {slug!r} não encontrado")
    job = init_job(jobs_root, slug)
    before = get_state(slug, jobs_root).orientation
    job.config.orientation = orientation
    write_json(job.dir / "job.config.json", asdict(job.config))
    depois = get_state(slug, jobs_root).orientation
    if depois != before:
        (job.dir / "edit-recipe.json").unlink(missing_ok=True)
        # `caption_bottom` é px do frame final, então o que era válido no 9x16
        # (altura 1920) pode jogar a legenda para fora do 16x9 (altura 1080).
        job.config.caption_bottom = min(
            job.config.caption_bottom,
            _max_caption_bottom(job.config.caption_font_size, depois),
        )
        write_json(job.dir / "job.config.json", asdict(job.config))


def suggest_hook(transcript: list[dict]) -> Hook:
    if not transcript:
        return Hook(title="", subtitle="")
    first_line = transcript[0]["text"]
    m = re.search(r"[.!?]", first_line)
    title = first_line[: m.end()] if m else first_line
    return Hook(title=title.strip(), subtitle="")


def allowed_file_path(job_dir: Path, name: str) -> Path | None:
    if name not in ALLOWED_FILES:
        return None
    candidate = (job_dir / name).resolve()
    try:
        candidate.relative_to(job_dir.resolve())
    except ValueError:
        return None
    return candidate
