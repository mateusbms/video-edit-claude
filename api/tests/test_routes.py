"""Testes das rotas síncronas. SSE (transcribe, render) e still ficam em test_sse.py."""


def _upload(client, sample_mp4, slug):
    with open(sample_mp4, "rb") as f:
        return client.post(
            "/api/jobs",
            data={"slug": slug},
            files=[("files", ("s.mp4", f, "video/mp4"))],
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


def test_get_job_inexistente_nao_cria_diretorio(client, tmp_root):
    """Consultar um slug que nunca foi enviado não pode ressuscitá-lo no
    disco — um slug obsoleto no localStorage do front não pode fazer o
    projeto reaparecer na lista só por ter sido consultado."""
    r = client.get("/api/jobs/inexistente")
    assert r.status_code == 200
    assert not (tmp_root / "jobs" / "inexistente").exists()


def test_cut_after_ingest(client, sample_mp4):
    _upload(client, sample_mp4, "t3")
    import json
    with client.stream(
        "POST", "/api/jobs/t3/cut",
        json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3},
    ) as r:
        assert r.status_code == 200
        last_data = None
        got_done = False
        for line in r.iter_lines():
            if line.startswith("event:") and line.split(":", 1)[1].strip() == "done":
                got_done = True
            elif line.startswith("data:"):
                last_data = line.split(":", 1)[1].strip()
        assert got_done
        done = json.loads(last_data)
    assert done["original_duration"] > 0
    assert done["trimmed_duration"] >= 0
    assert isinstance(done["segments"], list)


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


def test_caption_style_persists(client, sample_mp4):
    _upload(client, sample_mp4, "cs1")
    r = client.put("/api/jobs/cs1/caption-style",
                   json={"fontSize": 72, "bottom": 200, "color": "#ff0000",
                         "highlightColor": "#00ff00", "fontFamily": "Poppins"})
    assert r.status_code == 200
    s = client.get("/api/jobs/cs1").json()
    assert s["captionStyle"]["fontSize"] == 72
    assert s["captionStyle"]["fontFamily"] == "Poppins"


def test_put_and_get_overlays_roundtrip(client, sample_mp4):
    _upload(client, sample_mp4, "ov1")
    payload = [{
        "id": "ov_a", "type": "text", "text": "Oferta",
        "fromFrame": 30, "durationInFrames": 60,
        "x": 0.5, "y": 0.3, "anchor": "center", "fontSize": 72,
        "color": "#ffcc00", "highlightColor": "", "fontFamily": "Poppins",
        "enter": "pop", "exit": "fade",
        "enterDurationInFrames": 10, "exitDurationInFrames": 10,
    }]
    r = client.put("/api/jobs/ov1/overlays", json=payload)
    assert r.status_code == 200, r.text
    r2 = client.get("/api/jobs/ov1/overlays")
    assert r2.status_code == 200
    got = r2.json()
    assert got[0]["text"] == "Oferta"
    assert got[0]["color"] == "#ffcc00"
    assert got[0]["enter"] == "pop"


def test_get_overlays_empty_when_absent(client, sample_mp4):
    _upload(client, sample_mp4, "ov2")
    r = client.get("/api/jobs/ov2/overlays")
    assert r.status_code == 200
    assert r.json() == []


def test_put_overlays_rejects_invalid_hex(client, sample_mp4):
    _upload(client, sample_mp4, "ov3")
    bad = [{"text": "x", "fromFrame": 0, "durationInFrames": 10, "color": "nope"}]
    r = client.put("/api/jobs/ov3/overlays", json=bad)
    assert r.status_code == 422


def test_overlays_accept_max_width_pct(client, sample_mp4):
    _upload(client, sample_mp4, "mw1")
    items = [{"id": "ov1", "text": "x", "fromFrame": 0, "durationInFrames": 30, "maxWidthPct": 55}]
    assert client.put("/api/jobs/mw1/overlays", json=items).status_code == 200
    got = client.get("/api/jobs/mw1/overlays").json()
    assert got[0]["maxWidthPct"] == 55


def test_hook_put_get_persists_style(client, sample_mp4):
    _upload(client, sample_mp4, "hk1")
    body = {"title": "T", "subtitle": "", "duration_frames": 90,
            "x": 0.3, "y": 0.6, "fontSize": 100, "fontFamily": "Poppins",
            "color": "#ff0000", "anchor": "left"}
    r = client.put("/api/jobs/hk1/hook", json=body)
    assert r.status_code == 200, r.text
    got = client.get("/api/jobs/hk1/hook").json()
    assert got["x"] == 0.3 and got["y"] == 0.6 and got["fontSize"] == 100
    assert got["fontFamily"] == "Poppins" and got["color"] == "#ff0000" and got["anchor"] == "left"


def test_suggestions_get_empty_returns_list(client, sample_mp4):
    _upload(client, sample_mp4, "sug1")
    r = client.get("/api/jobs/sug1/suggestions")
    assert r.status_code == 200
    assert r.json() == []


def test_suggestions_put_get_roundtrip(client, sample_mp4):
    _upload(client, sample_mp4, "sug2")
    items = [{
        "id": "sug_01", "text": "R$ 6-15 mil / ano",
        "fromFrame": 810, "durationInFrames": 60,
        "kind": "short", "angle": "urgency", "source": "custa de 6 a 15 mil por ano",
    }]
    assert client.put("/api/jobs/sug2/suggestions", json=items).status_code == 200
    got = client.get("/api/jobs/sug2/suggestions").json()
    assert len(got) == 1 and got[0]["text"] == "R$ 6-15 mil / ano" and got[0]["kind"] == "short"


def test_suggest_defaults_get_default_when_absent(client, sample_mp4):
    _upload(client, sample_mp4, "sug3")
    d = client.get("/api/jobs/sug3/suggest-defaults").json()
    assert d["x"] == 0.5 and d["y"] == 0.12 and d["fontSize"] == 64 and d["anchor"] == "center"


def test_suggest_defaults_roundtrip(client, sample_mp4):
    _upload(client, sample_mp4, "sug4")
    d = {"x": 0.5, "y": 0.8, "anchor": "center", "fontSize": 80, "fontFamily": "Poppins", "color": "#ffffff"}
    assert client.put("/api/jobs/sug4/suggest-defaults", json=d).status_code == 200
    assert client.get("/api/jobs/sug4/suggest-defaults").json()["y"] == 0.8


def test_suggest_defaults_accepts_animation_fields(client, sample_mp4):
    _upload(client, sample_mp4, "sd1")
    d = {"x": 0.5, "y": 0.12, "anchor": "center", "fontSize": 64, "fontFamily": "", "color": "",
         "enter": "pop", "exit": "slide-down", "durationInFrames": 90, "maxWidthPct": 70}
    assert client.put("/api/jobs/sd1/suggest-defaults", json=d).status_code == 200
    got = client.get("/api/jobs/sd1/suggest-defaults").json()
    assert got["enter"] == "pop" and got["durationInFrames"] == 90 and got["maxWidthPct"] == 70
