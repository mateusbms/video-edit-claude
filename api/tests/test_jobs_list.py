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
    # mesmo conteúdo que _criar_job grava em job.config.json
    tamanho_config = len(json.dumps({"orientation": "9x16"}).encode("utf-8"))
    item = client.get("/api/jobs").json()[0]
    assert item["bytes_source"] == 100
    assert item["bytes_total"] == 100 + 50 + tamanho_config


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


def test_job_problematico_nao_derruba_a_listagem(client, tmp_root, monkeypatch):
    """Um render ou refine concorrente pode apagar um arquivo entre o
    iterdir() e o stat() de job_summary. Isso não pode derrubar a listagem
    inteira com 500 — só aquele job some desta resposta."""
    import api.jobs as jobs_mod

    _criar_job(tmp_root, "A1", {"trimmed.mp4": b"a"})
    _criar_job(tmp_root, "quebrado", {"trimmed.mp4": b"b"})

    original = jobs_mod.job_summary

    def instavel(job_dir, output_root):
        if job_dir.name == "quebrado":
            raise FileNotFoundError("arquivo sumiu durante a varredura")
        return original(job_dir, output_root)

    monkeypatch.setattr(jobs_mod, "job_summary", instavel)

    slugs = [j["slug"] for j in client.get("/api/jobs").json()]
    assert slugs == ["A1"]


def test_mais_recente_primeiro(client, tmp_root):
    import os
    _criar_job(tmp_root, "antigo", {"trimmed.mp4": b"a"})
    _criar_job(tmp_root, "novo", {"trimmed.mp4": b"b"})
    antigo = tmp_root / "jobs" / "antigo"
    for p in antigo.iterdir():
        os.utime(p, (1_000_000, 1_000_000))

    slugs = [j["slug"] for j in client.get("/api/jobs").json()]
    assert slugs == ["novo", "antigo"]


def test_reporta_o_tamanho_dos_renders_separado(client, tmp_root):
    """A tela precisa dizer o que "liberar espaço" libera e o que sobrevive."""
    _criar_job(tmp_root, "A1", {"source.mp4": b"x" * 100})
    (tmp_root / "output" / "A1-9x16.mp4").write_bytes(b"z" * 40)

    item = client.get("/api/jobs").json()[0]
    assert item["bytes_source"] == 100
    assert item["bytes_render"] == 40
    # bytes_total continua sendo só o diretório do job
    assert item["bytes_render"] not in (item["bytes_total"],)


def test_soma_os_dois_renders_quando_existem(client, tmp_root):
    _criar_job(tmp_root, "A1", {})
    (tmp_root / "output" / "A1-9x16.mp4").write_bytes(b"z" * 40)
    (tmp_root / "output" / "A1-16x9.mp4").write_bytes(b"w" * 60)
    assert client.get("/api/jobs").json()[0]["bytes_render"] == 100


def test_sem_render_o_tamanho_e_zero(client, tmp_root):
    _criar_job(tmp_root, "A1", {})
    assert client.get("/api/jobs").json()[0]["bytes_render"] == 0


def test_projeto_com_config_ilegivel_aparece_na_lista(client, tmp_root):
    """Sem aparecer, não há como apagá-lo — e ele bloqueia o upload com 409."""
    d = tmp_root / "jobs" / "quebrado"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text("{{{ isto não é json", encoding="utf-8")
    (d / "transcript.json").write_text("[]", encoding="utf-8")

    slugs = [j["slug"] for j in client.get("/api/jobs").json()]
    assert "quebrado" in slugs


def test_diretorio_vazio_continua_fora_da_lista(client, tmp_root):
    """Config ilegível e sem nenhum artefato não é projeto — não polui a lista."""
    d = tmp_root / "jobs" / "casca"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text("{{{", encoding="utf-8")
    assert client.get("/api/jobs").json() == []
