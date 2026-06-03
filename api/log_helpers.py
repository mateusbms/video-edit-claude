import datetime
from pathlib import Path


def append_job_log(job_dir: Path, stage: str, outcome: str, **extra) -> None:
    job_dir.mkdir(parents=True, exist_ok=True)
    line = f"{datetime.datetime.utcnow().isoformat()}Z  {stage}  {outcome}  {extra}\n"
    (job_dir / "log.txt").open("a").write(line)
