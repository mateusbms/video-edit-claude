import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test")
    monkeypatch.setenv("TTS_MODE", "elevenlabs")
    monkeypatch.setenv("TTS_MAX_CHARS_PER_JOB", "100")
    monkeypatch.setattr("api.tts_routes.JOBS_ROOT", tmp_path)
    from importlib import reload
    from api import app as app_module
    reload(app_module)
    return TestClient(app_module.app)


def test_rejects_over_char_limit(client):
    long_text = "x" * 200
    r = client.post("/tts/generate", json={
        "jobId": "job1",
        "scripts": [{"key":"s01","text":long_text}],
    })
    assert r.status_code == 400
    assert "TTS_MAX_CHARS_PER_JOB" in r.json()["detail"]


def test_happy_path(client, tmp_path):
    fake_result = MagicMock(key="s01", path=Path("/tmp/x.mp3"), seconds=2.0, frames=60)
    mock_tts_instance = MagicMock()
    mock_tts_instance.synthesize.return_value = fake_result
    with patch("api.tts_routes._tts_client", return_value=mock_tts_instance):
        r = client.post("/tts/generate", json={
            "jobId":"job1",
            "scripts":[{"key":"s01","text":"hi"}],
        })
    assert r.status_code == 200
    assert r.json() == [{"key":"s01","file":"/tmp/x.mp3","seconds":2.0,"frames":60}]
