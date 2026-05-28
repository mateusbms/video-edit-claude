"""Testes das rotas síncronas. SSE (transcribe, render) e still ficam em test_sse.py."""


def _upload(client, sample_mp4, slug):
    with open(sample_mp4, "rb") as f:
        return client.post(
            "/api/jobs",
            data={"slug": slug},
            files={"file": ("s.mp4", f, "video/mp4")},
        )


def test_post_jobs_uploads_and_ingests(client, sample_mp4):
    r = _upload(client, sample_mp4, "t1")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["slug"] == "t1"
    assert body["probe"]["width"] > 0
    assert body["probe"]["height"] > 0
    assert body["probe"]["duration"] > 0


def test_get_job_state_after_upload(client, sample_mp4):
    _upload(client, sample_mp4, "t2")
    r = client.get("/api/jobs/t2")
    assert r.status_code == 200
    s = r.json()
    assert s["slug"] == "t2"
    assert s["probe"]["width"] > 0
    assert s["has_trimmed"] is False


def test_cut_after_ingest(client, sample_mp4):
    _upload(client, sample_mp4, "t3")
    r = client.post(
        "/api/jobs/t3/cut",
        json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["original_duration"] > 0
    assert body["trimmed_duration"] >= 0
    assert isinstance(body["segments"], list)


def test_put_and_get_transcript(client, sample_mp4):
    _upload(client, sample_mp4, "t4")
    new = [{"text": "ola", "start": 0.0, "end": 0.5,
            "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}]
    r = client.put("/api/jobs/t4/transcript", json=new)
    assert r.status_code == 200
    r2 = client.get("/api/jobs/t4/transcript")
    assert r2.json()[0]["text"] == "ola"


def test_hook_get_suggests_then_put_saves(client, sample_mp4):
    _upload(client, sample_mp4, "t5")
    # escreve transcrição direto (sem rodar whisper)
    client.put(
        "/api/jobs/t5/transcript",
        json=[{"text": "Por que isso funciona? Eu explico.",
               "start": 0.0, "end": 2.5,
               "words": [{"word": "Por", "start": 0.0, "end": 0.2}]}],
    )
    r = client.get("/api/jobs/t5/hook")
    assert r.status_code == 200
    assert r.json()["title"] == "Por que isso funciona?"

    r2 = client.put("/api/jobs/t5/hook",
                    json={"title": "Outro título", "subtitle": "sub", "duration_frames": 60})
    assert r2.status_code == 200

    r3 = client.get("/api/jobs/t5/hook")
    assert r3.json()["title"] == "Outro título"
    assert r3.json()["duration_frames"] == 60


def test_recipe_after_cut_transcript_hook(client, sample_mp4):
    _upload(client, sample_mp4, "t6")
    client.post(
        "/api/jobs/t6/cut",
        json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3},
    )
    # escreve transcrição direto e hook
    client.put(
        "/api/jobs/t6/transcript",
        json=[{"text": "ola", "start": 0.0, "end": 0.5,
               "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}],
    )
    client.put("/api/jobs/t6/hook",
               json={"title": "T", "subtitle": "S", "duration_frames": 60})
    r = client.post("/api/jobs/t6/recipe")
    assert r.status_code == 200
    s = client.get("/api/jobs/t6")
    assert s.json()["has_recipe"] is True


def test_files_serves_trimmed_only(client, sample_mp4):
    _upload(client, sample_mp4, "t7")
    client.post(
        "/api/jobs/t7/cut",
        json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3},
    )
    r = client.get("/api/jobs/t7/files/trimmed.mp4")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("video/")
    r2 = client.get("/api/jobs/t7/files/source.mp4")
    assert r2.status_code == 404
