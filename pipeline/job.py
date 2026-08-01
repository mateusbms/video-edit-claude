import json
from dataclasses import dataclass, field, asdict
from pathlib import Path


@dataclass
class JobConfig:
    silence_threshold_db: float = -30.0
    min_silence: float = 0.5
    padding: float = 0.1
    min_segment: float = 0.3
    whisper_model: str = "base"
    language: str = "pt"
    hook_card_frames: int = 90
    max_caption_chars: int = 24
    max_caption_gap: float = 0.6
    brand_kit_slug: str = ""
    caption_font_size: int = 48
    caption_bottom: int = 120
    caption_color: str = ""
    caption_highlight: str = ""
    caption_font: str = ""
    orientation: str = ""  # "" = auto (deriva do probe); "16x9" | "9x16" = escolha do usuário
    title: str = ""  # nome legível na lista de projetos; "" = usa o slug
    # "matriz" = projeto só-corpo que gera variações de hook (spec 2026-08-01);
    # variações nascem "normal" com origem_matriz preenchido (só exibição —
    # a variação é autossuficiente e sobrevive à exclusão da matriz).
    papel: str = "normal"  # "normal" | "matriz"
    origem_matriz: str = ""


@dataclass
class Job:
    dir: Path
    config: JobConfig = field(default_factory=JobConfig)


def write_json(path, data) -> None:
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def init_job(jobs_root, slug: str) -> Job:
    job_dir = Path(jobs_root) / slug
    job_dir.mkdir(parents=True, exist_ok=True)
    config = JobConfig()
    cfg_path = job_dir / "job.config.json"
    if cfg_path.exists():
        data = load_json(cfg_path)
        config = JobConfig(**data)
    else:
        write_json(cfg_path, asdict(config))
    return Job(dir=job_dir, config=config)
