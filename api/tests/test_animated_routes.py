import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test")
    monkeypatch.setattr("api.brand_kits_store.KITS_ROOT", tmp_path / "kits")
    monkeypatch.setattr("api.brand_kits_store.JOBS_ROOT", tmp_path / "jobs")
    monkeypatch.setattr("api.animated_routes.JOBS_ROOT", tmp_path / "jobs")
    monkeypatch.setattr("api.tts_routes.JOBS_ROOT", tmp_path / "jobs")
    from api.models import BrandKit, BrandColors, BrandFonts
    from api.brand_kits_store import save_kit
    save_kit(BrandKit(
        version=1, slug="acme", name="Acme", logo="logo.png",
        colors=BrandColors(bg="#f5f5f0", card="#ffffff", border="#e2e2dc",
            foreground="#262622", muted="#757568",
            accent="#16a34a", accentLight="rgba(22,163,74,0.12)"),
        fonts=BrandFonts(body="Inter", headline="Instrument Serif"),
    ))
    from importlib import reload
    from api import app as app_module
    reload(app_module)
    return TestClient(app_module.app)


def _scripts():
    keys = ["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"]
    return [{"key": k, "text": f"text {k}"} for k in keys]


def test_unknown_brand_kit_404(client):
    r = client.post("/jobs/animated", json={
        "brandKitSlug": "nope", "scripts": _scripts(), "orientation": "16x9",
    })
    assert r.status_code == 404


def test_happy_path_writes_recipe_and_dispatches_render(client, tmp_path):
    fake_results = [
        MagicMock(key=k, path=Path(f"/tmp/{k}.mp3"), seconds=2.0, frames=60)
        for k in ["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"]
    ]
    with patch("api.animated_routes.ElevenLabsClient") as Client, \
         patch("api.animated_routes.dispatch_render") as dispatch:
        Client.return_value.synthesize.side_effect = fake_results
        r = client.post("/jobs/animated", json={
            "brandKitSlug": "acme",
            "scripts": _scripts(),
            "orientation": "16x9",
        })
    assert r.status_code == 201
    job_id = r.json()["jobId"]
    recipe_path = tmp_path / "jobs" / job_id / "recipe.json"
    assert recipe_path.exists()
    recipe = json.loads(recipe_path.read_text())
    assert recipe["kind"] == "animated"
    assert recipe["orientation"] == "16x9"
    assert len(recipe["scenes"]) == 11
    dispatch.assert_called_once()
