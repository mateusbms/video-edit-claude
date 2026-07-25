import re
from dataclasses import asdict
from pathlib import Path

from pipeline.job import init_job, load_json, write_json
from api.models import CutParams, Hook, JobState, ProbeOut


ALLOWED_FILES = {
    "trimmed.mp4",
}


def get_state(slug: str, jobs_root: Path) -> JobState:
    job_dir = Path(jobs_root) / slug
    probe = None
    if (job_dir / "probe.json").exists():
        d = load_json(job_dir / "probe.json")
        probe = ProbeOut(**d)
    job = init_job(jobs_root, slug)
    config = CutParams(
        silence_threshold_db=job.config.silence_threshold_db,
        padding=job.config.padding,
        min_silence=job.config.min_silence,
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
        "fontSize": job.config.caption_font_size,
        "bottom": job.config.caption_bottom,
        "color": job.config.caption_color,
        "highlightColor": job.config.caption_highlight,
        "fontFamily": job.config.caption_font,
    }
    state.brandKitSlug = job.config.brand_kit_slug
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
