"""POST /api/jobs não pode sobrescrever um projeto em silêncio.

O campo de nome no passo 1 vem preenchido com o slug atual, então reusar o nome
do projeto anterior é o caminho de menor esforço — foi assim que um upload
trocou o source de um job que já tinha transcrição e textos.
"""

import json


def _criar_job_com_trabalho(tmp_root, slug: str) -> None:
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / "job.config.json").write_text(json.dumps({"orientation": "9x16"}), encoding="utf-8")
    (d / "source.mp4").write_bytes(b"video antigo")
    (d / "trimmed.mp4").write_bytes(b"cortado")
    (d / "transcript.json").write_text("[]", encoding="utf-8")


def _upload(client, slug: str, sample_mp4, overwrite=None):
    data = {"slug": slug}
    if overwrite is not None:
        data["overwrite"] = str(overwrite).lower()
    return client.post(
        "/api/jobs",
        files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
        data=data,
    )


def test_recusa_upload_para_slug_que_ja_tem_trabalho(client, tmp_root, sample_mp4):
    _criar_job_com_trabalho(tmp_root, "A1")
    r = _upload(client, "A1", sample_mp4)
    assert r.status_code == 409


def test_o_409_diz_o_que_existe_naquele_projeto(client, tmp_root, sample_mp4):
    """A UI monta o diálogo com isso, sem uma segunda chamada."""
    _criar_job_com_trabalho(tmp_root, "A1")
    detail = _upload(client, "A1", sample_mp4).json()["detail"]
    assert detail["slug"] == "A1"
    assert detail["has_transcript"] is True
    assert detail["has_trimmed"] is True


def test_nao_toca_no_projeto_ao_recusar(client, tmp_root, sample_mp4):
    _criar_job_com_trabalho(tmp_root, "A1")
    _upload(client, "A1", sample_mp4)
    assert (tmp_root / "jobs" / "A1" / "source.mp4").read_bytes() == b"video antigo"
    assert (tmp_root / "jobs" / "A1" / "transcript.json").exists()


def test_overwrite_explicito_passa(client, tmp_root, sample_mp4):
    _criar_job_com_trabalho(tmp_root, "A1")
    r = _upload(client, "A1", sample_mp4, overwrite=True)
    assert r.status_code == 200
    assert (tmp_root / "jobs" / "A1" / "source.mp4").read_bytes() != b"video antigo"


def test_slug_novo_nao_precisa_de_overwrite(client, tmp_root, sample_mp4):
    assert _upload(client, "novissimo", sample_mp4).status_code == 200


def test_slug_existente_mas_vazio_nao_bloqueia(client, tmp_root, sample_mp4):
    """Só job.config.json: não há trabalho a perder."""
    d = tmp_root / "jobs" / "vazio"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text(json.dumps({}), encoding="utf-8")
    assert _upload(client, "vazio", sample_mp4).status_code == 200


def test_config_corrompido_nao_desliga_a_guarda(client, tmp_root, sample_mp4):
    """job_summary devolve None para um job.config.json ilegível — e None não
    pode ser lido como "o slug não existe": o diretório pode ter transcrição
    e textos de verdade, que um config corrompido não apaga."""
    d = tmp_root / "jobs" / "A1"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text("{{{", encoding="utf-8")
    (d / "transcript.json").write_text("[]", encoding="utf-8")

    r = _upload(client, "A1", sample_mp4)

    assert r.status_code == 409
    assert (d / "transcript.json").exists()


def test_guarda_conta_overlays_como_trabalho(client, tmp_root, sample_mp4):
    """stage_ingest apaga overlays.json; a guarda precisa protegê-lo."""
    d = tmp_root / "jobs" / "ov"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text(json.dumps({}), encoding="utf-8")
    (d / "overlays.json").write_text("[]", encoding="utf-8")
    assert _upload(client, "ov", sample_mp4).status_code == 409


def test_guarda_conta_sugestoes_como_trabalho(client, tmp_root, sample_mp4):
    d = tmp_root / "jobs" / "sg"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text(json.dumps({}), encoding="utf-8")
    (d / "suggestions.json").write_text("[]", encoding="utf-8")
    assert _upload(client, "sg", sample_mp4).status_code == 409


def test_projeto_apagado_entre_a_checagem_e_o_resumo_nao_derruba_o_upload(
    client, tmp_root, sample_mp4, monkeypatch
):
    """Corrida com o DELETE: tem_trabalho() viu True, mas os arquivos sumiram
    antes de montar o 409 — existente fica None e o upload precisa seguir, não
    estourar 500 num .model_dump() de None. E o upload precisa ter acontecido
    de verdade, não só devolvido 200 sem gravar nada (estilo
    test_overwrite_explicito_passa)."""
    import api.routes as routes_mod

    _criar_job_com_trabalho(tmp_root, "A1")
    monkeypatch.setattr(routes_mod, "job_summary", lambda job_dir, output_root: None)
    monkeypatch.setattr(routes_mod, "job_summary_minimo", lambda job_dir: None)

    r = _upload(client, "A1", sample_mp4)

    assert r.status_code == 200
    assert (tmp_root / "jobs" / "A1" / "source.mp4").read_bytes() != b"video antigo"


def test_projeto_apagado_entre_a_checagem_e_o_resumo_com_erro_tambem_nao_derruba_o_upload(
    client, tmp_root, sample_mp4, monkeypatch
):
    """Mesma corrida, mas pegando o caso em que job_summary não devolve None e
    sim levanta: um rmtree em andamento pode derrubar iterdir()/stat() no meio
    da leitura (FileNotFoundError). list_jobs já se blinda assim; create_job
    precisa do mesmo cuidado."""
    import api.routes as routes_mod

    def _levanta(*args, **kwargs):
        raise FileNotFoundError("arquivo sumiu no meio da leitura")

    _criar_job_com_trabalho(tmp_root, "A1")
    monkeypatch.setattr(routes_mod, "job_summary", _levanta)
    monkeypatch.setattr(routes_mod, "job_summary_minimo", _levanta)

    r = _upload(client, "A1", sample_mp4)

    assert r.status_code == 200
    assert (tmp_root / "jobs" / "A1" / "source.mp4").read_bytes() != b"video antigo"
