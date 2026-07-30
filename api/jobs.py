import re
from dataclasses import asdict
from pathlib import Path

from pipeline.job import JobConfig, init_job, load_json, write_json
from pipeline.orientation import FRAME_SIZES, frame_size, resolve_orientation
from pipeline.recipe import brand_of_kit, resolve_caption_style
from pipeline.stages import DERIVADOS_DO_SOURCE
from api.models import CutParams, CutResult, CutSegmentOut, Hook, JobState, JobSummary, ProbeOut


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


def job_summary(job_dir: Path, output_root: Path) -> JobSummary | None:
    """Resumo de um projeto, ou None se o diretório não for um job.

    Lê o job.config.json direto em vez de chamar init_job: init_job cria o
    diretório, e consultar um slug inexistente não pode criá-lo.
    """
    cfg_path = job_dir / "job.config.json"
    if not job_dir.is_dir() or not cfg_path.exists():
        return None
    try:
        cfg = load_json(cfg_path)
    except Exception:
        return None

    arquivos = [p for p in job_dir.iterdir() if p.is_file()]
    source = job_dir / "source.mp4"
    probe = None
    probe_path = job_dir / "probe.json"
    if probe_path.exists():
        try:
            probe = load_json(probe_path)
        except Exception:
            probe = None

    slug = job_dir.name
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
        has_render_16x9=(output_root / f"{slug}-16x9.mp4").exists(),
        has_render_9x16=(output_root / f"{slug}-9x16.mp4").exists(),
        bytes_source=source.stat().st_size if source.exists() else 0,
        bytes_total=sum(p.stat().st_size for p in arquivos),
    )


def job_summary_minimo(job_dir: Path) -> JobSummary | None:
    """Resumo mínimo de um job cujo job.config.json existe mas não pôde ser lido.

    `job_summary` devolve None nesse caso — e None não pode virar "o slug não
    existe" na guarda de upload (I1): o diretório pode ter source, corte,
    transcrição e textos de verdade que um config corrompido não apaga. Monta
    só o que dá para inferir da presença dos arquivos — a tela só precisa
    saber o nome e que há trabalho.
    """
    if not job_dir.is_dir():
        return None
    source = job_dir / "source.mp4"
    tem_algo = source.exists() or any((job_dir / nome).exists() for nome in DERIVADOS_DO_SOURCE)
    if not tem_algo:
        return None
    return JobSummary(
        slug=job_dir.name,
        has_source=source.exists(),
        has_trimmed=(job_dir / "trimmed.mp4").exists(),
        has_transcript=(job_dir / "transcript.json").exists(),
        has_hook=(job_dir / "hook.json").exists(),
        has_recipe=(job_dir / "edit-recipe.json").exists(),
    )


def list_jobs(jobs_root: Path, output_root: Path) -> list[JobSummary]:
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
            s = job_summary(d, Path(output_root))
        except Exception:
            continue
        if s:
            resumos.append(s)
    return sorted(resumos, key=lambda s: s.updated_at, reverse=True)


def get_state(slug: str, jobs_root: Path) -> JobState:
    """Estado de um projeto para as telas lerem.

    Lê o job.config.json direto (defaults de JobConfig se não existir) em vez
    de chamar init_job: get_state é usado por rotas de consulta, e nada que
    apenas consulta pode criar o diretório do job — mesmo raciocínio de
    job_summary. Quem precisa do diretório/arquivo criados chama init_job
    separadamente (create_job, update_config etc. já fazem isso).
    """
    job_dir = Path(jobs_root) / slug
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
    job = init_job(jobs_root, slug)
    job.config.caption_font_size = style.fontSize
    job.config.caption_bottom = style.bottom
    job.config.caption_color = style.color
    job.config.caption_highlight = style.highlightColor
    job.config.caption_font = style.fontFamily
    write_json(job.dir / "job.config.json", asdict(job.config))


def update_brand_kit(slug: str, jobs_root: Path, kit_slug: str) -> None:
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
    """
    if orientation != "" and orientation not in FRAME_SIZES:
        raise ValueError(f"orientação inválida: {orientation!r}")
    before = get_state(slug, jobs_root).orientation
    job = init_job(jobs_root, slug)
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
