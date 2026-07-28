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
    # Fase B: sem card; hook vira overlay animado sobre o vídeo, legendas sem offset
    assert all(s["type"] != "card" for s in recipe["segments"])
    assert recipe["segments"][0]["type"] == "clip"
    assert recipe["captions"][0]["fromFrame"] == 0
    assert recipe["overlays"][0]["type"] == "hook"
    assert recipe["overlays"][0]["text"] == "Hook"
    assert recipe["overlays"][0]["maxWidthPct"] == 80


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


def test_stage_recipe_includes_manual_overlays(tmp_path):
    job = init_job(tmp_path / "jobs", "c1")
    write_json(job.dir / "probe.json", {"width": 1920, "height": 1080, "fps": 30, "duration": 2.0})
    write_json(job.dir / "transcript.json",
               [{"text": "ola", "start": 0.0, "end": 0.5,
                 "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}])
    write_json(job.dir / "hook.json", {"title": "H", "subtitle": ""})
    write_json(job.dir / "overlays.json", [{
        "id": "ov_a", "type": "text", "text": "Manual",
        "fromFrame": 10, "durationInFrames": 20,
        "x": 0.5, "y": 0.3, "anchor": "center", "fontSize": 64,
        "color": "", "highlightColor": "", "fontFamily": "",
        "enter": "fade", "exit": "fade",
        "enterDurationInFrames": 12, "exitDurationInFrames": 12,
    }])
    stage_recipe(job)
    recipe = load_json(job.dir / "edit-recipe.json")
    assert any(o["text"] == "Manual" for o in recipe["overlays"])
    assert recipe["overlays"][0]["type"] == "hook"  # hook ainda primeiro


@_needs_ffmpeg
def test_stage_refine_deletes_overlays_json(tmp_path):
    from pipeline.stages import stage_refine
    from pipeline.silence import Segment
    from pipeline.probe import probe_video
    job = init_job(tmp_path / "jobs", "c2")
    trimmed = job.dir / "trimmed.mp4"
    _clip(trimmed, 320, 240, 2.0)
    tm = probe_video(str(trimmed))
    write_json(job.dir / "trimmed.probe.json",
               {"width": tm.width, "height": tm.height, "fps": tm.fps,
                "duration": tm.duration, "nb_frames": tm.nb_frames})
    write_json(job.dir / "overlays.json", [{"id": "ov_a", "type": "text", "text": "m",
                                            "fromFrame": 0, "durationInFrames": 10}])
    # remove um pequeno trecho no meio; sobra vídeo suficiente
    stage_refine(job, [Segment(0.5, 1.0)])
    assert not (job.dir / "overlays.json").exists()


@_needs_ffmpeg
def test_stage_refine_deletes_suggestions_keeps_suggest_defaults(tmp_path):
    from pipeline.stages import stage_refine
    from pipeline.silence import Segment
    from pipeline.probe import probe_video
    job = init_job(tmp_path / "jobs", "c3")
    trimmed = job.dir / "trimmed.mp4"
    _clip(trimmed, 320, 240, 2.0)
    tm = probe_video(str(trimmed))
    write_json(job.dir / "trimmed.probe.json",
               {"width": tm.width, "height": tm.height, "fps": tm.fps,
                "duration": tm.duration, "nb_frames": tm.nb_frames})
    write_json(job.dir / "suggestions.json", [{"id": "sug_a", "text": "s",
                                               "fromFrame": 0, "durationInFrames": 10}])
    write_json(job.dir / "suggest-defaults.json", {"x": 0.5, "y": 0.12})
    # remove um pequeno trecho no meio; sobra vídeo suficiente
    stage_refine(job, [Segment(0.5, 1.0)])
    assert not (job.dir / "suggestions.json").exists()
    assert (job.dir / "suggest-defaults.json").exists()
