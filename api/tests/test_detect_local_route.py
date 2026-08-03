"""Rota analyze-only: propõe a fronteira, não corta. Reusa fixtures client/tmp_root."""
from pipeline.job import write_json


def _projeto_cortado(tmp_root, slug="v1"):
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True)
    write_json(d / "job.config.json", {"silence_threshold_db": -28.0})
    (d / "trimmed.mp4").write_bytes(b"trimmed")
    write_json(d / "trimmed.probe.json",
               {"width": 1920, "height": 1080, "fps": 30.0, "duration": 40.0, "nb_frames": 1200})
    return d


def test_detect_local_devolve_fronteira(client, tmp_root, monkeypatch):
    _projeto_cortado(tmp_root)
    from api import routes
    # a janela devolve duas micro-pausas que bracketam o clique
    monkeypatch.setattr(routes, "detect_silences_janela",
                        lambda path, center, raio, noise_db, min_silence: [(21.1, 21.5), (22.4, 22.8)])
    r = client.post("/api/jobs/v1/detect-local", json={"center": 22.0})
    assert r.status_code == 200
    body = r.json()
    assert body == {"start": 21.3, "end": 22.6, "limpo_inicio": True, "limpo_fim": True}


def test_detect_local_usa_o_noise_do_job_e_clampa_o_centro(client, tmp_root, monkeypatch):
    _projeto_cortado(tmp_root)
    from api import routes
    capturado = {}
    def fake(path, center, raio, noise_db, min_silence):
        capturado.update(center=center, noise_db=noise_db)
        return []
    monkeypatch.setattr(routes, "detect_silences_janela", fake)
    # center além do fim (40s) é clampado; noise vem do config (-28.0)
    r = client.post("/api/jobs/v1/detect-local", json={"center": 999.0})
    assert r.status_code == 200
    assert capturado["center"] == 40.0
    assert capturado["noise_db"] == -28.0


def test_detect_local_sem_trimmed_e_409(client, tmp_root):
    d = tmp_root / "jobs" / "v2"
    d.mkdir(parents=True)
    write_json(d / "job.config.json", {})
    r = client.post("/api/jobs/v2/detect-local", json={"center": 1.0})
    assert r.status_code == 409


def test_detect_local_slug_inexistente_e_404(client, tmp_root):
    assert client.post("/api/jobs/nunca/detect-local", json={"center": 1.0}).status_code == 404
