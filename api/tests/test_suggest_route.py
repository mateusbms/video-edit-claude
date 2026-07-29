"""Testa POST /api/jobs/{slug}/suggest com run_claude mockado — nunca chama o CLI."""

import json
from pathlib import Path

import pytest

from api import routes
from api.claude_cli import ClaudeCLINotFound, ClaudeCLITimeout, ClaudeCLIError

TRANSCRIPT = [
    {"text": "Custa de 6 a 15 mil por ano.", "start": 27.0, "end": 30.0, "words": []},
    {"text": "Rendeu 12% ao ano.", "start": 40.0, "end": 43.0, "words": []},
]

VALID_RESULT = json.dumps([
    {"id": "sug_01", "text": "R$ 6-15 mil / ano", "fromFrame": 810,
     "durationInFrames": 60, "kind": "short", "angle": "urgency",
     "source": "Custa de 6 a 15 mil por ano."},
])


def _job_dir(tmp_root: Path, slug: str) -> Path:
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write_transcript(tmp_root: Path, slug: str) -> Path:
    d = _job_dir(tmp_root, slug)
    (d / "transcript.json").write_text(json.dumps(TRANSCRIPT), encoding="utf-8")
    return d


def test_suggest_writes_file_and_returns_list(client, tmp_root, monkeypatch):
    d = _write_transcript(tmp_root, "sg1")
    monkeypatch.setattr(routes, "run_claude", lambda prompt, timeout=180: VALID_RESULT)

    r = client.post("/api/jobs/sg1/suggest")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body) == 1 and body[0]["text"] == "R$ 6-15 mil / ano"

    saved = json.loads((d / "suggestions.json").read_text(encoding="utf-8"))
    assert saved[0]["id"] == "sug_01"


def test_suggest_missing_transcript_returns_409(client, tmp_root, monkeypatch):
    _job_dir(tmp_root, "sg2")  # sem transcript.json
    monkeypatch.setattr(routes, "run_claude", lambda prompt, timeout=180: VALID_RESULT)
    r = client.post("/api/jobs/sg2/suggest")
    assert r.status_code == 409


def test_suggest_missing_cli_returns_503(client, tmp_root, monkeypatch):
    _write_transcript(tmp_root, "sg3")

    def boom(prompt, timeout=180):
        raise ClaudeCLINotFound("no claude")
    monkeypatch.setattr(routes, "run_claude", boom)
    r = client.post("/api/jobs/sg3/suggest")
    assert r.status_code == 503


def test_suggest_timeout_returns_504(client, tmp_root, monkeypatch):
    _write_transcript(tmp_root, "sg4")

    def boom(prompt, timeout=180):
        raise ClaudeCLITimeout("slow")
    monkeypatch.setattr(routes, "run_claude", boom)
    r = client.post("/api/jobs/sg4/suggest")
    assert r.status_code == 504


def test_suggest_cli_error_returns_502(client, tmp_root, monkeypatch):
    _write_transcript(tmp_root, "sg5")

    def boom(prompt, timeout=180):
        raise ClaudeCLIError("is_error")
    monkeypatch.setattr(routes, "run_claude", boom)
    r = client.post("/api/jobs/sg5/suggest")
    assert r.status_code == 502


def test_suggest_bad_shape_returns_422_and_keeps_previous(client, tmp_root, monkeypatch):
    d = _write_transcript(tmp_root, "sg6")
    previous = [{"id": "sug_old", "text": "antiga", "fromFrame": 0,
                 "durationInFrames": 60, "kind": "short", "angle": "", "source": ""}]
    (d / "suggestions.json").write_text(json.dumps(previous), encoding="utf-8")

    # falta o campo obrigatório `text`
    monkeypatch.setattr(routes, "run_claude",
                        lambda prompt, timeout=180: json.dumps([{"id": "x", "fromFrame": 1}]))
    r = client.post("/api/jobs/sg6/suggest")
    assert r.status_code == 422

    kept = json.loads((d / "suggestions.json").read_text(encoding="utf-8"))
    assert kept == previous  # anterior sobrevive à falha


def test_suggest_invalid_json_returns_422(client, tmp_root, monkeypatch):
    _write_transcript(tmp_root, "sg7")
    monkeypatch.setattr(routes, "run_claude", lambda prompt, timeout=180: "isto não é json")
    r = client.post("/api/jobs/sg7/suggest")
    assert r.status_code == 422


def test_suggest_leaves_overlays_untouched(client, tmp_root, monkeypatch):
    d = _write_transcript(tmp_root, "sg8")
    overlays = [{"id": "ov_a", "text": "meu texto", "fromFrame": 10, "durationInFrames": 30}]
    (d / "overlays.json").write_text(json.dumps(overlays), encoding="utf-8")

    monkeypatch.setattr(routes, "run_claude", lambda prompt, timeout=180: VALID_RESULT)
    assert client.post("/api/jobs/sg8/suggest").status_code == 200

    still = json.loads((d / "overlays.json").read_text(encoding="utf-8"))
    assert still == overlays
