import os
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import app


@pytest.fixture
def tmp_root(tmp_path, monkeypatch):
    jobs = tmp_path / "jobs"
    inp = tmp_path / "input"
    outp = tmp_path / "output"
    for p in (jobs, inp, outp):
        p.mkdir()
    monkeypatch.setenv("JOBS_ROOT", str(jobs))
    monkeypatch.setenv("INPUT_ROOT", str(inp))
    monkeypatch.setenv("OUTPUT_ROOT", str(outp))
    return tmp_path


@pytest.fixture
def client(tmp_root):
    return TestClient(app)


@pytest.fixture(scope="session")
def sample_mp4():
    """Mini mp4 gerado uma vez por sessão."""
    fixture = Path("tests/fixtures/sample-short.mp4")
    if not fixture.exists():
        fixture.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", "color=c=gray:s=320x240:d=2",
                "-f", "lavfi", "-i", "sine=frequency=300:d=2",
                "-shortest", "-pix_fmt", "yuv420p", str(fixture),
            ],
            check=True, capture_output=True,
        )
    return fixture
