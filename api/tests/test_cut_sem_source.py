"""POST /jobs/{slug}/cut sem o vídeo original, e as flags que a tela precisa.

O stage_cut é o único leitor do source.mp4. Depois do botão "Liberar espaço"
da fase 2, um projeto pode legitimamente não ter mais o original — e aí a
detecção de pausas precisa recusar com uma frase, não estourar no ffmpeg.
"""

import json


def _criar_job(tmp_root, slug: str, arquivos: dict[str, bytes]) -> None:
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "job.config.json").write_text(json.dumps({"orientation": "9x16"}), encoding="utf-8")
    for nome, conteudo in arquivos.items():
        (d / nome).write_bytes(conteudo)


CORTE = {"silence_threshold_db": -30.0, "padding": 0.1, "min_silence": 0.5}


def test_cortar_sem_source_responde_409(client, tmp_root):
    _criar_job(tmp_root, "s1", {"trimmed.mp4": b"y"})
    r = client.post("/api/jobs/s1/cut", json=CORTE)
    assert r.status_code == 409


def test_a_mensagem_explica_o_que_aconteceu_e_o_que_sobra(client, tmp_root):
    _criar_job(tmp_root, "s2", {"trimmed.mp4": b"y"})
    detalhe = client.post("/api/jobs/s2/cut", json=CORTE).json()["detail"]
    assert "original" in detalhe.lower()
    assert "manual" in detalhe.lower()


def test_recusar_nao_grava_os_parametros(client, tmp_root):
    """Não persiste a escolha de um corte que não vai acontecer."""
    _criar_job(tmp_root, "s3", {"trimmed.mp4": b"y"})
    antes = (tmp_root / "jobs" / "s3" / "job.config.json").read_text(encoding="utf-8")
    client.post("/api/jobs/s3/cut", json={"silence_threshold_db": -44.0,
                                          "padding": 0.4, "min_silence": 1.9})
    assert (tmp_root / "jobs" / "s3" / "job.config.json").read_text(encoding="utf-8") == antes


def test_projeto_inexistente_tambem_recusa(client, tmp_root):
    r = client.post("/api/jobs/nunca-existiu/cut", json=CORTE)
    assert r.status_code == 409
    assert not (tmp_root / "jobs" / "nunca-existiu").exists(), "recusar não pode criar o job"


def test_o_estado_do_job_expoe_o_que_o_refino_vai_apagar(client, tmp_root):
    _criar_job(tmp_root, "s4", {
        "source.mp4": b"x",
        "overlays.json": b"[]",
        "suggestions.json": b"[]",
    })
    body = client.get("/api/jobs/s4").json()
    assert body["has_source"] is True
    assert body["has_overlays"] is True
    assert body["has_suggestions"] is True


def test_as_flags_novas_sao_falsas_quando_os_arquivos_nao_existem(client, tmp_root):
    _criar_job(tmp_root, "s5", {"trimmed.mp4": b"y"})
    body = client.get("/api/jobs/s5").json()
    assert body["has_source"] is False
    assert body["has_overlays"] is False
    assert body["has_suggestions"] is False
