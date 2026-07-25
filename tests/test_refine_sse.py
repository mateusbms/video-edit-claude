import json
import os
import shutil
import subprocess
from pathlib import Path
import pytest

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg indisponível")


@_needs_ffmpeg
def test_refine_streams_and_shortens(tmp_path, monkeypatch):
    monkeypatch.setenv("JOBS_ROOT", str(tmp_path / "jobs"))
    monkeypatch.setenv("INPUT_ROOT", str(tmp_path / "input"))
    monkeypatch.setenv("OUTPUT_ROOT", str(tmp_path / "output"))
    monkeypatch.setenv("TTS_MODE", "mock")
    from starlette.testclient import TestClient
    from api.app import app

    clip = tmp_path / "c.mp4"
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", "color=c=black:s=320x240:d=4",
         "-f", "lavfi", "-i", "sine=frequency=440:d=4",
         "-shortest", "-pix_fmt", "yuv420p", str(clip)],
        capture_output=True, check=True,
    )
    client = TestClient(app)
    with clip.open("rb") as f:
        client.post("/api/jobs", data={"slug": "r1"},
                    files=[("files", ("c.mp4", f, "video/mp4"))])
    with client.stream("POST", "/api/jobs/r1/cut",
                       json={"silence_threshold_db": -60.0, "padding": 0.0, "min_silence": 2.0}) as r:
        for _ in r.iter_lines():
            pass
    before = json.loads((tmp_path / "jobs" / "r1" / "trimmed.probe.json").read_text())["duration"]

    # transcrição obsoleta deve ser invalidada pelo refino
    stale_transcript = tmp_path / "jobs" / "r1" / "transcript.json"
    stale_transcript.write_text("[]")

    with client.stream("POST", "/api/jobs/r1/refine",
                       json={"remove": [{"start": 1.0, "end": 2.0}]}) as r:
        events, datas = [], []
        for line in r.iter_lines():
            if line.startswith("event:"):
                events.append(line.split(":", 1)[1].strip())
            elif line.startswith("data:"):
                datas.append(line.split(":", 1)[1].strip())
    assert "progress" in events
    assert "done" in events
    new_dur = json.loads(datas[-1])["trimmed_duration"]
    assert new_dur < before
    assert not stale_transcript.exists()
