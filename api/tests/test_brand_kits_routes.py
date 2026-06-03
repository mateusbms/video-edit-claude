import io
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test")
    monkeypatch.setattr("api.brand_kits_store.KITS_ROOT", tmp_path / "kits")
    monkeypatch.setattr("api.brand_kits_store.JOBS_ROOT", tmp_path / "jobs")
    from api.app import app
    return TestClient(app)


def _post_kit(client, name="Acme", logo=b"\x89PNG\r\n\x1a\n"):
    files = {"logo": ("logo.png", io.BytesIO(logo), "image/png")}
    data = {
        "name": name,
        "colors_bg": "#f5f5f0", "colors_card": "#ffffff", "colors_border": "#e2e2dc",
        "colors_foreground": "#262622", "colors_muted": "#757568",
        "colors_accent": "#16a34a", "colors_accentLight": "rgba(22,163,74,0.12)",
        "fonts_body": "Inter", "fonts_headline": "Instrument Serif",
    }
    return client.post("/brand-kits", data=data, files=files)


def test_list_empty(client):
    r = client.get("/brand-kits")
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_list(client):
    r = _post_kit(client, "Acme")
    assert r.status_code == 201
    assert r.json()["slug"] == "acme"
    assert client.get("/brand-kits").json()[0]["slug"] == "acme"


def test_delete_kit(client):
    _post_kit(client, "Acme")
    r = client.delete("/brand-kits/acme")
    assert r.status_code == 204
    assert client.get("/brand-kits").json() == []


def test_delete_unknown_404(client):
    r = client.delete("/brand-kits/nope")
    assert r.status_code == 404


def test_update_kit(client):
    _post_kit(client, "Acme")
    files = {"logo": ("new.png", io.BytesIO(b"\x89PNG\r\n\x1a\n"), "image/png")}
    data = {
        "name": "Acme Renamed",
        "colors_bg": "#000000", "colors_card": "#ffffff", "colors_border": "#e2e2dc",
        "colors_foreground": "#262622", "colors_muted": "#757568",
        "colors_accent": "#16a34a", "colors_accentLight": "rgba(22,163,74,0.12)",
        "fonts_body": "Inter", "fonts_headline": "Instrument Serif",
    }
    r = client.put("/brand-kits/acme", data=data, files=files)
    assert r.status_code == 200
    assert r.json()["name"] == "Acme Renamed"
    assert r.json()["colors"]["bg"] == "#000000"


def test_update_unknown_404(client):
    data = {
        "name": "X",
        "colors_bg": "#000000", "colors_card": "#ffffff", "colors_border": "#e2e2dc",
        "colors_foreground": "#262622", "colors_muted": "#757568",
        "colors_accent": "#16a34a", "colors_accentLight": "rgba(22,163,74,0.12)",
        "fonts_body": "Inter", "fonts_headline": "Instrument Serif",
    }
    r = client.put("/brand-kits/nope", data=data)
    assert r.status_code == 404
