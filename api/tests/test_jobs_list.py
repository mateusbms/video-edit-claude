"""GET /api/jobs — a lista de projetos salvos.

Os artefatos são escritos à mão: o pipeline real depende de ffmpeg e o que
está sob teste é a varredura do diretório, não o processamento de vídeo.
"""

import json


def _criar_job(tmp_root, slug: str, arquivos: dict[str, bytes]) -> None:
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "job.config.json").write_text(json.dumps({"orientation": "9x16"}), encoding="utf-8")
    for nome, conteudo in arquivos.items():
        (d / nome).write_bytes(conteudo)


def test_sem_projetos_devolve_lista_vazia(client, tmp_root):
    assert client.get("/api/jobs").json() == []


def test_lista_os_projetos_com_o_progresso_de_cada_um(client, tmp_root):
    _criar_job(tmp_root, "A1", {
        "source.mp4": b"x" * 100,
        "trimmed.mp4": b"y" * 50,
        "transcript.json": b"[]",
    })

    body = client.get("/api/jobs").json()
    assert len(body) == 1
    item = body[0]
    assert item["slug"] == "A1"
    assert item["orientation"] == "9x16"
    assert item["has_source"] is True
    assert item["has_trimmed"] is True
    assert item["has_transcript"] is True
    assert item["has_hook"] is False
    assert item["has_recipe"] is False


def test_reporta_o_espaco_ocupado(client, tmp_root):
    _criar_job(tmp_root, "A1", {"source.mp4": b"x" * 100, "trimmed.mp4": b"y" * 50})
    item = client.get("/api/jobs").json()[0]
    assert item["bytes_source"] == 100
    # 100 + 50 + o job.config.json
    assert item["bytes_total"] > 150


def test_marca_os_renders_ja_exportados(client, tmp_root):
    _criar_job(tmp_root, "A1", {"trimmed.mp4": b"y"})
    (tmp_root / "output" / "A1-9x16.mp4").write_bytes(b"z")

    item = client.get("/api/jobs").json()[0]
    assert item["has_render_9x16"] is True
    assert item["has_render_16x9"] is False


def test_ignora_arquivos_soltos_e_pastas_que_nao_sao_job(client, tmp_root):
    _criar_job(tmp_root, "A1", {})
    (tmp_root / "jobs" / "leiame.txt").write_text("nao sou um job", encoding="utf-8")
    (tmp_root / "jobs" / "lixo").mkdir()

    slugs = [j["slug"] for j in client.get("/api/jobs").json()]
    assert slugs == ["A1"]


def test_listar_nao_cria_diretorio_para_slug_inexistente(client, tmp_root):
    """init_job cria diretório; a listagem não pode usá-lo."""
    client.get("/api/jobs")
    assert list((tmp_root / "jobs").iterdir()) == []


def test_mais_recente_primeiro(client, tmp_root):
    import os
    _criar_job(tmp_root, "antigo", {"trimmed.mp4": b"a"})
    _criar_job(tmp_root, "novo", {"trimmed.mp4": b"b"})
    antigo = tmp_root / "jobs" / "antigo"
    for p in antigo.iterdir():
        os.utime(p, (1_000_000, 1_000_000))

    slugs = [j["slug"] for j in client.get("/api/jobs").json()]
    assert slugs == ["novo", "antigo"]
