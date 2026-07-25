import os
import shutil
import subprocess
from pathlib import Path
import pytest

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg indisponível")


@_needs_ffmpeg
def test_cut_streams_progress_and_done(tmp_path, monkeypatch):
    monkeypatch.setenv("JOBS_ROOT", str(tmp_path / "jobs"))
    monkeypatch.setenv("INPUT_ROOT", str(tmp_path / "input"))
    monkeypatch.setenv("OUTPUT_ROOT", str(tmp_path / "output"))
    monkeypatch.setenv("TTS_MODE", "mock")
    from starlette.testclient import TestClient
    from api.app import app

    clip = tmp_path / "c.mp4"
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", "color=c=black:s=320x240:d=3",
         "-f", "lavfi", "-i", "sine=frequency=440:d=3",
         "-af", "volume='if(lt(t,1)+gt(t,2),1,0)':eval=frame",
         "-shortest", "-pix_fmt", "yuv420p", str(clip)],
        capture_output=True, check=True,
    )
    client = TestClient(app)
    with clip.open("rb") as f:
        client.post("/api/jobs", data={"slug": "c1"},
                    files=[("files", ("c.mp4", f, "video/mp4"))])

    with client.stream("POST", "/api/jobs/c1/cut",
                       json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3}) as r:
        events = []
        data_lines = []
        for line in r.iter_lines():
            if line.startswith("event:"):
                events.append(line.split(":", 1)[1].strip())
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
    assert "progress" in events
    assert "done" in events
    import json
    done_payload = json.loads(data_lines[-1])
    assert "original_duration" in done_payload
    assert "segments" in done_payload
