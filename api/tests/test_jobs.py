import json
from pathlib import Path

from api.jobs import get_state, suggest_hook, allowed_file_path
from api.models import ProbeOut


def _write(p: Path, data):
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def test_get_state_empty(tmp_path):
    s = get_state("v1", tmp_path)
    assert s.slug == "v1"
    assert s.probe is None
    assert s.has_trimmed is False


def test_get_state_after_artifacts(tmp_path):
    job = tmp_path / "v1"
    job.mkdir()
    _write(job / "probe.json", {"width": 1920, "height": 1080, "fps": 30.0, "duration": 10.0})
    (job / "trimmed.mp4").write_bytes(b"x")
    _write(job / "transcript.json", [])
    s = get_state("v1", tmp_path)
    assert s.probe == ProbeOut(width=1920, height=1080, fps=30.0, duration=10.0)
    assert s.has_trimmed is True
    assert s.has_transcript is True


def test_suggest_hook_takes_first_sentence():
    transcript = [
        {"text": "Por que isso funciona? Eu vou contar.", "start": 0.0, "end": 2.5, "words": []},
    ]
    h = suggest_hook(transcript)
    assert h.title == "Por que isso funciona?"


def test_suggest_hook_empty():
    h = suggest_hook([])
    assert h.title == ""


def test_allowed_file_path_blocks_traversal(tmp_path):
    job = tmp_path / "v1"; job.mkdir()
    assert allowed_file_path(job, "trimmed.mp4") == (job / "trimmed.mp4").resolve()
    assert allowed_file_path(job, "../etc/passwd") is None
    assert allowed_file_path(job, "source.mp4") is None  # source não é exposto
