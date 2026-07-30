"""GET /jobs/{slug}/cuts — estado do corte para o passo 2 remontar.

O passo de Cortes é desmontado ao trocar de aba no wizard, então ele precisa
reconstruir o resultado do disco. Os testes escrevem os artefatos à mão porque o
pipeline real depende do ffprobe, que não está disponível neste ambiente (mesmo
motivo documentado em test_orientation_routes.py).
"""

import json


def _job_dir(client, tmp_root, slug: str):
    """Cria o diretório do job sem passar pelo pipeline."""
    client.put(f"/api/jobs/{slug}/orientation", json={"orientation": "9x16"})
    return tmp_root / "jobs" / slug


def _escrever_corte(job_dir, segmentos, original=121.288, trimmed=51.066):
    (job_dir / "probe.json").write_text(
        json.dumps({"width": 2160, "height": 3840, "fps": 30.0, "duration": original}),
        encoding="utf-8")
    (job_dir / "trimmed.probe.json").write_text(
        json.dumps({"width": 1080, "height": 1920, "fps": 30.0, "duration": trimmed}),
        encoding="utf-8")
    (job_dir / "cuts.json").write_text(json.dumps(segmentos), encoding="utf-8")


def test_sem_corte_devolve_null(client, tmp_root):
    _job_dir(client, tmp_root, "c1")
    r = client.get("/api/jobs/c1/cuts")
    assert r.status_code == 200
    assert r.json() is None


def test_reconstroi_o_resultado_do_disco(client, tmp_root):
    job_dir = _job_dir(client, tmp_root, "c2")
    _escrever_corte(job_dir, [{"start": 3.0, "end": 8.0}, {"start": 18.0, "end": 27.5}])

    body = client.get("/api/jobs/c2/cuts").json()
    assert body["original_duration"] == 121.288
    assert body["trimmed_duration"] == 51.066
    assert body["segments"] == [
        {"start": 3.0, "end": 8.0},
        {"start": 18.0, "end": 27.5},
    ]


def test_expoe_o_mtime_do_trimmed_para_versionar_o_preview(client, tmp_root):
    job_dir = _job_dir(client, tmp_root, "c3")
    _escrever_corte(job_dir, [{"start": 0.0, "end": 5.0}])
    (job_dir / "trimmed.mp4").write_bytes(b"x")

    antes = client.get("/api/jobs/c3/cuts").json()["trimmed_mtime"]
    assert antes > 0

    # o refino reescreve o arquivo no mesmo caminho: o mtime é o que distingue
    # as versões para o navegador não reusar o vídeo anterior
    import os
    os.utime(job_dir / "trimmed.mp4", (antes + 60, antes + 60))
    depois = client.get("/api/jobs/c3/cuts").json()["trimmed_mtime"]
    assert depois > antes


def test_mtime_zero_quando_o_trimmed_nao_existe(client, tmp_root):
    """Artefatos de detecção sem o vídeo: responde sem estourar."""
    job_dir = _job_dir(client, tmp_root, "c4")
    _escrever_corte(job_dir, [{"start": 0.0, "end": 5.0}])
    assert client.get("/api/jobs/c4/cuts").json()["trimmed_mtime"] == 0.0


def test_corte_parcial_em_disco_devolve_null(client, tmp_root):
    """Só cuts.json, sem os probes, não dá para montar durações — não invente."""
    job_dir = _job_dir(client, tmp_root, "c5")
    (job_dir / "cuts.json").write_text(json.dumps([{"start": 0.0, "end": 5.0}]), encoding="utf-8")
    assert client.get("/api/jobs/c5/cuts").json() is None
