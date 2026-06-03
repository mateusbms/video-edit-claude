import pytest
from fastapi.testclient import TestClient

# These tests use importlib.reload to re-exercise module-load env validation.
# When a reload raises mid-way (the failing-env cases), module globals defined
# AFTER the raise (ELEVENLABS_VOICE_ID, etc.) keep the values from the prior
# successful load. Pytest's collection order keeps this benign today, but if
# parallel execution or random order is introduced, switch to subprocess
# isolation (spawn a fresh python -c "import api.app" per test) to guarantee
# clean module state per case.


def test_app_startup_fails_without_elevenlabs_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    from importlib import reload
    from api import app as app_module
    with pytest.raises(RuntimeError, match="ELEVENLABS_API_KEY"):
        reload(app_module)


def test_app_startup_ok_with_elevenlabs_key(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    from importlib import reload
    from api import app as app_module
    reload(app_module)
    client = TestClient(app_module.app)
    assert client.get("/health").status_code == 200


def test_app_startup_fails_with_empty_elevenlabs_key(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "")
    from importlib import reload
    from api import app as app_module
    with pytest.raises(RuntimeError, match="ELEVENLABS_API_KEY"):
        reload(app_module)


def test_mock_mode_does_not_require_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.setenv("TTS_MODE", "mock")
    from importlib import reload
    from api import app as app_module
    reload(app_module)  # should NOT raise


def test_invalid_tts_mode_raises(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setenv("TTS_MODE", "google")
    from importlib import reload
    from api import app as app_module
    with pytest.raises(RuntimeError, match="Invalid TTS_MODE"):
        reload(app_module)
