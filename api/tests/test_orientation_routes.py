"""Rota de orientação do job. Usa as fixtures de api/tests/conftest.py."""


def test_get_job_expoe_a_orientacao_detectada(client, sample_mp4):
    client.post("/api/jobs", files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
                data={"slug": "o1"})
    body = client.get("/api/jobs/o1").json()
    assert body["orientation"] in ("16x9", "9x16")


def test_put_troca_a_orientacao(client, sample_mp4):
    client.post("/api/jobs", files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
                data={"slug": "o2"})
    r = client.put("/api/jobs/o2/orientation", json={"orientation": "9x16"})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "orientation": "9x16"}
    assert client.get("/api/jobs/o2").json()["orientation"] == "9x16"


def test_put_vazio_volta_ao_auto(client, sample_mp4):
    client.post("/api/jobs", files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
                data={"slug": "o3"})
    auto = client.get("/api/jobs/o3").json()["orientation"]
    outra = "9x16" if auto == "16x9" else "16x9"
    client.put("/api/jobs/o3/orientation", json={"orientation": outra})
    assert client.get("/api/jobs/o3").json()["orientation"] == outra
    r = client.put("/api/jobs/o3/orientation", json={"orientation": ""})
    assert r.status_code == 200
    assert client.get("/api/jobs/o3").json()["orientation"] == auto


def test_put_rejeita_valor_invalido(client, sample_mp4):
    client.post("/api/jobs", files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
                data={"slug": "o4"})
    r = client.put("/api/jobs/o4/orientation", json={"orientation": "banana"})
    assert r.status_code == 422
