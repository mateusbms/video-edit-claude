import json
import os
import shutil
import subprocess
from pathlib import Path
import pytest
from pipeline.job import init_job, write_json, load_json
from pipeline.stages import stage_recipe, stage_ingest

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg indisponível")


def _clip(path: Path, w: int, h: int, dur: float) -> None:
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", f"testsrc=size={w}x{h}:rate=30:duration={dur}",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={dur}",
         "-shortest", "-pix_fmt", "yuv420p", str(path)],
        capture_output=True, check=True,
    )


def test_stage_recipe_writes_edit_recipe(tmp_path):
    job = init_job(tmp_path / "jobs", "v1")
    write_json(job.dir / "probe.json", {"width": 1920, "height": 1080, "fps": 30, "duration": 2.0})
    write_json(job.dir / "transcript.json",
               [{"text": "ola", "start": 0.0, "end": 0.5,
                 "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}])
    hook = {"title": "Hook", "subtitle": "x"}
    write_json(job.dir / "hook.json", hook)

    stage_recipe(job)

    recipe = load_json(job.dir / "edit-recipe.json")
    assert recipe["segments"][0]["title"] == "Hook"
    assert recipe["captions"][0]["fromFrame"] == job.config.hook_card_frames


@_needs_ffmpeg
def test_stage_ingest_joins_multiple(tmp_path):
    a = tmp_path / "a.mp4"; _clip(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _clip(b, 640, 360, 1.0)
    job = init_job(tmp_path / "jobs", "v1")
    stage_ingest(job, [str(a), str(b)])
    assert (job.dir / "source.mp4").exists()
    probe = load_json(job.dir / "probe.json")
    assert probe["width"] == 640
    assert probe["duration"] > 1.5
