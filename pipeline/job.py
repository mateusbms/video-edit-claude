import json
from dataclasses import dataclass, field, asdict
from pathlib import Path


@dataclass
class JobConfig:
    silence_threshold_db: float = -30.0
    min_silence: float = 0.5
    padding: float = 0.1
    min_segment: float = 0.3
    whisper_model: str = "small"
    language: str = "pt"
    hook_card_frames: int = 90
    max_caption_chars: int = 24
    max_caption_gap: float = 0.6


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
