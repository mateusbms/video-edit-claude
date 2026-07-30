"""DELETE de projeto e de source.

O render exportado em output/ sobrevive aos dois, de propósito: é o entregável,
e o usuário costuma apagar o projeto justamente por já tê-lo exportado.
"""

import json


def _criar_job(tmp_root, slug: str, arquivos: dict[str, bytes]) -> None:
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "job.config.json").write_text(json.dumps({"orientation": "9x16"}), encoding="utf-8")
    for nome, conteudo in arquivos.items():
        (d / nome).write_bytes(conteudo)


def test_apaga_o_projeto_inteiro(client, tmp_root):
    _criar_job(tmp_root, "d1", {"source.mp4": b"x", "transcript.json": b"[]"})
    r = client.delete("/api/jobs/d1")
    assert r.status_code == 200
    assert not (tmp_root / "jobs" / "d1").exists()


def test_apagar_o_projeto_preserva_o_render_exportado(client, tmp_root):
    _criar_job(tmp_root, "d2", {"source.mp4": b"x"})
    render = tmp_root / "output" / "d2-9x16.mp4"
    render.write_bytes(b"z")

    client.delete("/api/jobs/d2")
    assert render.exists(), "o render exportado não pode sumir junto"


def test_apagar_projeto_inexistente_responde_404(client, tmp_root):
    assert client.delete("/api/jobs/nunca-existiu").status_code == 404


def test_o_projeto_some_da_listagem(client, tmp_root):
    _criar_job(tmp_root, "d3", {"source.mp4": b"x"})
    assert "d3" in [j["slug"] for j in client.get("/api/jobs").json()]
    client.delete("/api/jobs/d3")
    assert "d3" not in [j["slug"] for j in client.get("/api/jobs").json()]


def test_libera_espaco_apagando_so_o_source(client, tmp_root):
    _criar_job(tmp_root, "d4", {
        "source.mp4": b"x" * 100,
        "trimmed.mp4": b"y" * 10,
        "transcript.json": b"[]",
        "overlays.json": b"[]",
    })
    r = client.delete("/api/jobs/d4/source")
    assert r.status_code == 200

    d = tmp_root / "jobs" / "d4"
    assert not (d / "source.mp4").exists()
    assert (d / "trimmed.mp4").exists()
    assert (d / "transcript.json").exists()
    assert (d / "overlays.json").exists()


def test_apos_liberar_espaco_a_lista_marca_sem_source(client, tmp_root):
    _criar_job(tmp_root, "d5", {"source.mp4": b"x" * 100, "trimmed.mp4": b"y"})
    client.delete("/api/jobs/d5/source")
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "d5"][0]
    assert item["has_source"] is False
    assert item["bytes_source"] == 0


def test_liberar_espaco_sem_source_responde_404(client, tmp_root):
    _criar_job(tmp_root, "d6", {"trimmed.mp4": b"y"})
    assert client.delete("/api/jobs/d6/source").status_code == 404


def test_slug_com_travessia_de_caminho_e_recusado(client, tmp_root):
    """`..` não pode escapar de jobs_root — apagar é irreversível.

    O `%2F` decodifica para uma barra literal, então o segmento deixa de casar
    com `{slug}` (que não aceita `/`) e a requisição cai no fallback SPA
    (`GET /{path:path}` em api/app.py), que devolve 405 por só aceitar GET —
    não 404. O importante, verificado abaixo, é que nada em `_job_dir_seguro`
    chega a ser exercitado por essa rota e o diretório vizinho sobrevive
    intacto; a proteção de fato (bloquear um slug ".." que chega até a rota)
    é coberta por unit tests diretos de `delete_job`/`delete_source` logo
    abaixo.
    """
    vitima = tmp_root / "jobs" / "vizinho"
    vitima.mkdir(parents=True)
    (vitima / "job.config.json").write_text("{}", encoding="utf-8")

    r = client.delete("/api/jobs/..%2Fvizinho")
    assert r.status_code in (400, 404, 405)
    assert vitima.exists()


def test_delete_job_recusa_slug_que_tenta_escapar_de_jobs_root(tmp_path):
    """Unit test direto de api.jobs.delete_job: um slug ".." não pode apagar
    o diretório pai de jobs_root, nem um "../vizinho" apagar um projeto irmão."""
    from api.jobs import delete_job

    jobs_root = tmp_path / "jobs"
    jobs_root.mkdir()
    vizinho = jobs_root.parent / "vizinho-fora-de-jobs"
    vizinho.mkdir()
    (vizinho / "marca.txt").write_text("nao pode sumir", encoding="utf-8")

    assert delete_job("..", jobs_root) is False
    assert delete_job("../vizinho-fora-de-jobs", jobs_root) is False
    assert vizinho.exists()


def test_delete_source_recusa_slug_que_tenta_escapar_de_jobs_root(tmp_path):
    """Mesma proteção para delete_source: sem escapar de jobs_root."""
    from api.jobs import delete_source

    jobs_root = tmp_path / "jobs"
    jobs_root.mkdir()
    vizinho = jobs_root.parent / "vizinho-fora-de-jobs"
    vizinho.mkdir()
    (vizinho / "source.mp4").write_bytes(b"nao pode sumir")

    assert delete_source("../vizinho-fora-de-jobs", jobs_root) is False
    assert (vizinho / "source.mp4").exists()
