import pytest
from fastapi.testclient import TestClient


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
