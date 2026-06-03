import asyncio
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
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


# --- F3: render is actually scheduled (background task) ---

def test_render_is_scheduled_as_background_task(client, tmp_path):
    """POST /jobs/animated must schedule dispatch_render via BackgroundTasks,
    not fire-and-forget (unawaited coroutine).  We verify that the mock is
    called exactly once — if dispatch_render were just returned without
    scheduling, the TestClient would not call it at all because FastAPI
    BackgroundTasks run after the response is delivered (TestClient runs
    them synchronously before returning).
    """
    fake_results = [
        MagicMock(key=k, path=Path(f"/tmp/{k}.mp3"), seconds=2.0, frames=60)
        for k in ["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"]
    ]
    # Use an AsyncMock so FastAPI's BackgroundTasks can await it.
    dispatch_mock = AsyncMock()
    with patch("api.animated_routes.ElevenLabsClient") as Client, \
         patch("api.animated_routes.dispatch_render", dispatch_mock):
        Client.return_value.synthesize.side_effect = fake_results
        r = client.post("/jobs/animated", json={
            "brandKitSlug": "acme",
            "scripts": _scripts(),
            "orientation": "16x9",
        })
    assert r.status_code == 201
    # BackgroundTasks are executed before TestClient.post() returns.
    dispatch_mock.assert_awaited_once()


# --- F1: SSE endpoint exists and returns 200 text/event-stream ---

def test_sse_events_endpoint_exists_for_animated_job(client, tmp_path, monkeypatch):
    """GET /jobs/{jobId}/events must return a streaming SSE response (200,
    text/event-stream) for a valid job_id.  We inject a pre-populated queue
    so the generator terminates immediately instead of blocking.
    """
    import asyncio
    from api.job_queues import JOB_QUEUES, sse_event_dict

    job_id = "testjob0001"
    job_dir = tmp_path / "jobs" / job_id
    job_dir.mkdir(parents=True)

    # Pre-populate queue with a done event so the generator stops.
    q: asyncio.Queue = asyncio.Queue()
    q.put_nowait(sse_event_dict("done", {"ok": True}))
    JOB_QUEUES[job_id] = q

    r = client.get(f"/jobs/{job_id}/events")
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")
    body = r.text
    assert "event: done" in body

    # Cleanup
    del JOB_QUEUES[job_id]


# --- F2: Download endpoint exists ---

def test_output_download_endpoint_serves_mp4(client, tmp_path):
    """GET /jobs/{jobId}/output must return the rendered MP4 with status 200."""
    job_id = "testjob0002"
    job_dir = tmp_path / "jobs" / job_id
    job_dir.mkdir(parents=True)
    mp4 = job_dir / "final.mp4"
    mp4.write_bytes(b"\x00" * 16)  # dummy bytes

    r = client.get(f"/jobs/{job_id}/output")
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("video/mp4")


def test_output_download_returns_404_when_not_ready(client, tmp_path):
    """GET /jobs/{jobId}/output must return 404 when final.mp4 is absent."""
    job_id = "testjob0003"
    job_dir = tmp_path / "jobs" / job_id
    job_dir.mkdir(parents=True)

    r = client.get(f"/jobs/{job_id}/output")
    assert r.status_code == 404
