import os
import shutil
import subprocess
from pathlib import Path
import pytest
from starlette.testclient import TestClient

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


@_needs_ffmpeg
def test_post_jobs_joins_multiple_files(tmp_path, monkeypatch):
    monkeypatch.setenv("JOBS_ROOT", str(tmp_path / "jobs"))
    monkeypatch.setenv("INPUT_ROOT", str(tmp_path / "input"))
    monkeypatch.setenv("OUTPUT_ROOT", str(tmp_path / "output"))
    monkeypatch.setenv("TTS_MODE", "mock")
    from api.app import app  # importado após setenv para satisfazer REQUIRED_ENV

    a = tmp_path / "a.mp4"; _clip(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _clip(b, 640, 360, 1.0)
    client = TestClient(app)
    with a.open("rb") as fa, b.open("rb") as fb:
        r = client.post(
            "/api/jobs",
            data={"slug": "multi"},
            files=[("files", ("a.mp4", fa, "video/mp4")),
                   ("files", ("b.mp4", fb, "video/mp4"))],
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["slug"] == "multi"
    assert body["probe"]["duration"] > 1.5


def test_post_jobs_requires_a_file(tmp_path, monkeypatch):
    monkeypatch.setenv("TTS_MODE", "mock")
    from api.app import app
    client = TestClient(app)
    r = client.post("/api/jobs", data={"slug": "empty"}, files=[])
    assert r.status_code in (400, 422)
