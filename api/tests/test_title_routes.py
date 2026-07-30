"""PUT /jobs/{slug}/title — nome legível do projeto.

O slug segue sendo o nome da pasta e do arquivo exportado; o título é só para
a pessoa se achar na lista semanas depois.
"""

import json


def _job(client, slug: str):
    """Cria o diretório do job sem passar pelo pipeline."""
    client.put(f"/api/jobs/{slug}/orientation", json={"orientation": "9x16"})


def test_grava_o_titulo(client, tmp_root):
    _job(client, "t1")
    r = client.put("/api/jobs/t1/title", json={"title": "Check-up da carteira"})
    assert r.status_code == 200
    cfg = json.loads((tmp_root / "jobs" / "t1" / "job.config.json").read_text(encoding="utf-8"))
    assert cfg["title"] == "Check-up da carteira"


def test_o_titulo_aparece_na_listagem(client, tmp_root):
    _job(client, "t2")
    client.put("/api/jobs/t2/title", json={"title": "Anúncio de julho"})
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "t2"][0]
    assert item["title"] == "Anúncio de julho"


def test_titulo_vazio_volta_a_usar_o_slug(client, tmp_root):
    _job(client, "t3")
    client.put("/api/jobs/t3/title", json={"title": "Alguma coisa"})
    client.put("/api/jobs/t3/title", json={"title": ""})
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "t3"][0]
    assert item["title"] == ""


def test_espacos_em_volta_sao_descartados(client, tmp_root):
    _job(client, "t4")
    client.put("/api/jobs/t4/title", json={"title": "   Só espaços em volta   "})
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "t4"][0]
    assert item["title"] == "Só espaços em volta"


def test_titulo_so_de_espacos_vira_vazio(client, tmp_root):
    """Senão a lista mostraria um nome em branco em vez de cair no slug."""
    _job(client, "t5")
    client.put("/api/jobs/t5/title", json={"title": "     "})
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "t5"][0]
    assert item["title"] == ""


def test_titulo_nao_mexe_no_resto_do_config(client, tmp_root):
    _job(client, "t6")
    antes = json.loads((tmp_root / "jobs" / "t6" / "job.config.json").read_text(encoding="utf-8"))
    client.put("/api/jobs/t6/title", json={"title": "Novo nome"})
    depois = json.loads((tmp_root / "jobs" / "t6" / "job.config.json").read_text(encoding="utf-8"))
    del depois["title"]
    antes.pop("title", None)
    assert depois == antes


def test_config_antigo_sem_a_chave_le_com_default(client, tmp_root):
    """Projetos criados antes desta feature não têm `title` no config."""
    d = tmp_root / "jobs" / "antigo"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text(json.dumps({"orientation": "9x16"}), encoding="utf-8")
    item = [j for j in client.get("/api/jobs").json() if j["slug"] == "antigo"][0]
    assert item["title"] == ""
