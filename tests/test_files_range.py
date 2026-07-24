def test_files_endpoint_supports_range(tmp_path, monkeypatch):
    monkeypatch.setenv("JOBS_ROOT", str(tmp_path / "jobs"))
    monkeypatch.setenv("TTS_MODE", "mock")
    from starlette.testclient import TestClient
    from api.app import app

    jobdir = tmp_path / "jobs" / "v1"
    jobdir.mkdir(parents=True)
    (jobdir / "trimmed.mp4").write_bytes(b"0123456789")

    client = TestClient(app)
    r = client.get("/api/jobs/v1/files/trimmed.mp4", headers={"Range": "bytes=0-3"})
    assert r.status_code == 206
    assert r.content == b"0123"

    r404 = client.get("/api/jobs/v1/files/source.mp4")
    assert r404.status_code == 404
