"""Testes das rotas SSE (transcribe, render) e still — com subprocesso/whisper mockados."""


def _upload(client, sample_mp4, slug):
    with open(sample_mp4, "rb") as f:
        return client.post(
            "/api/jobs",
            data={"slug": slug},
            files={"file": ("s.mp4", f, "video/mp4")},
        )


def test_transcribe_sse_returns_done_event(client, sample_mp4, monkeypatch):
    from pipeline import stages
    fake = [{"text": "ola", "start": 0.0, "end": 0.5,
             "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}]
    monkeypatch.setattr(stages, "transcribe_audio", lambda *a, **k: fake)

    _upload(client, sample_mp4, "s1")
    client.post(
        "/api/jobs/s1/cut",
        json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3},
    )

    with client.stream(
        "POST", "/api/jobs/s1/transcribe",
        json={"model_size": "tiny", "language": "pt"},
    ) as r:
        events = []
        for chunk in r.iter_lines():
            if chunk.startswith("event:"):
                events.append(chunk.split(":", 1)[1].strip())
    assert "done" in events

    r2 = client.get("/api/jobs/s1/transcript")
    assert r2.status_code == 200
    assert r2.json()[0]["text"] == "ola"


def test_render_sse_emits_progress_and_done(client, sample_mp4, monkeypatch):
    from api import render as render_mod

    class FakeProc:
        def __init__(self, lines):
            self._lines = list(lines)
            self.stdout = self
            self.returncode = 0

        async def readline(self):
            if self._lines:
                return (self._lines.pop(0) + "\n").encode()
            return b""

        async def wait(self):
            return 0

    fake_lines = ["Rendered 0/2", "Encoded 1/2", "Encoded 2/2"]

    async def fake_run(composition, out_path, props_path, remotion_dir, env):
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"x")
        return FakeProc(fake_lines.copy())

    monkeypatch.setattr(render_mod, "run_remotion", fake_run)

    # prepara o job: upload, cut, transcript (via PUT), hook, recipe
    _upload(client, sample_mp4, "s2")
    client.post(
        "/api/jobs/s2/cut",
        json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3},
    )
    client.put(
        "/api/jobs/s2/transcript",
        json=[{"text": "ola", "start": 0.0, "end": 0.5,
               "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}],
    )
    client.put("/api/jobs/s2/hook",
               json={"title": "T", "subtitle": "S", "duration_frames": 60})
    client.post("/api/jobs/s2/recipe")

    with client.stream("POST", "/api/jobs/s2/render") as r:
        events = []
        for line in r.iter_lines():
            if line.startswith("event:"):
                events.append(line.split(":", 1)[1].strip())
    assert events.count("progress") >= 2
    assert events[-1] == "done"


def test_still_renders_png(client, sample_mp4, monkeypatch):
    from api import render as render_mod

    class FakeProc:
        returncode = 0

    async def fake_run_still(comp, out_path, frame, props_path, remotion_dir, env):
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"\x89PNG\r\n\x1a\nfake")
        return FakeProc()

    monkeypatch.setattr(render_mod, "run_remotion_still", fake_run_still)

    _upload(client, sample_mp4, "s3")
    client.post(
        "/api/jobs/s3/cut",
        json={"silence_threshold_db": -30.0, "padding": 0.05, "min_silence": 0.3},
    )
    client.put(
        "/api/jobs/s3/transcript",
        json=[{"text": "ola", "start": 0.0, "end": 0.5,
               "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}],
    )
    client.put("/api/jobs/s3/hook",
               json={"title": "T", "subtitle": "S", "duration_frames": 60})
    client.post("/api/jobs/s3/recipe")

    r = client.get("/api/jobs/s3/still?frame=30&format=main16x9")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/png"
    assert r.content.startswith(b"\x89PNG")
