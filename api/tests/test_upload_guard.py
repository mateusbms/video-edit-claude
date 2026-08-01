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


def test_409_com_config_corrompido_reporta_tamanho_real(client, tmp_root, sample_mp4):
    """O 409 desta guarda também passa por job_summary_minimo quando o config
    está corrompido. Antes de job_summary_minimo receber output_root (N2), o
    detail vinha com bytes_source e bytes_render zerados mesmo com o source
    intacto no disco — a UI monta o diálogo direto deste corpo, sem outra
    chamada."""
    d = tmp_root / "jobs" / "A1"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text("{{{", encoding="utf-8")
    (d / "source.mp4").write_bytes(b"x" * 100)

    detail = _upload(client, "A1", sample_mp4).json()["detail"]
    assert detail["bytes_source"] == 100


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


def test_permission_error_isolada_em_output_nao_libera_a_sobrescrita(
    client, tmp_root, sample_mp4, monkeypatch
):
    """Achado B (fechado pela raiz): reprodução ponta a ponta do revisor. Uma
    PermissionError isolada no stat de output/A1-16x9.mp4 — arquivo que
    tem_trabalho() nem toca — bastava para o `except Exception: existente =
    None` da guarda concluir "não existe projeto" e liberar a sobrescrita.
    Mas tem_trabalho() já tinha confirmado, antes deste bloco rodar, que há
    trabalho em disco (transcript.json, overlays.json): uma exceção ao
    montar o resumo não pode reverter essa conclusão, só significa "não
    consigo dizer o que tem lá", e isso tem que recusar, não liberar."""
    from pathlib import Path as _Path

    _criar_job_com_trabalho(tmp_root, "A1")
    (tmp_root / "jobs" / "A1" / "overlays.json").write_text("[]", encoding="utf-8")
    render = tmp_root / "output" / "A1-16x9.mp4"
    render.write_bytes(b"z")

    original_stat = _Path.stat

    def _stat_recusa_no_render(self, *args, **kwargs):
        if self.name == "A1-16x9.mp4":
            raise PermissionError(13, "Access is denied")
        return original_stat(self, *args, **kwargs)

    monkeypatch.setattr(_Path, "stat", _stat_recusa_no_render)

    r = _upload(client, "A1", sample_mp4)

    assert r.status_code == 409
    assert (tmp_root / "jobs" / "A1" / "transcript.json").exists()
    assert (tmp_root / "jobs" / "A1" / "overlays.json").exists()


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
    monkeypatch.setattr(routes_mod, "job_summary", lambda job_dir, input_root, output_root: None)
    monkeypatch.setattr(routes_mod, "job_summary_minimo", lambda job_dir, input_root, output_root: None)

    r = _upload(client, "A1", sample_mp4)

    assert r.status_code == 200
    assert (tmp_root / "jobs" / "A1" / "source.mp4").read_bytes() != b"video antigo"


def test_tem_trabalho_estourando_vira_409_nao_500(client, tmp_root, sample_mp4, monkeypatch):
    """tem_trabalho() agora roda dentro do mesmo try que job_summary/
    job_summary_minimo: uma exceção ali é o mesmo "não sei, então recuso"
    dos dois — não pode vazar como 500 cru (pendência 4 do handoff)."""
    import api.routes as routes_mod

    _criar_job_com_trabalho(tmp_root, "A1")

    def _levanta(job_dir):
        raise OSError("falha simulada ao checar tem_trabalho")

    monkeypatch.setattr(routes_mod, "tem_trabalho", _levanta)

    r = _upload(client, "A1", sample_mp4)

    assert r.status_code == 409
    assert (tmp_root / "jobs" / "A1" / "source.mp4").read_bytes() == b"video antigo"


def test_slug_invalido_no_upload_responde_400(client, tmp_root, sample_mp4):
    """create_job passa a montar o caminho da guarda de sobrescrita via
    _job_dir_seguro: um slug de travessia não pode virar um 404/500
    confuso — 400 "nome inválido" explica o problema de verdade. O slug vem
    de um campo de formulário (não da URL), então ".." literal chega sem
    nenhuma decodificação de rota no meio."""
    vizinho = tmp_root / "vizinho-fora-de-jobs"
    r = client.post(
        "/api/jobs",
        files={"files": ("a.mp4", sample_mp4.read_bytes(), "video/mp4")},
        data={"slug": "../vizinho-fora-de-jobs"},
    )
    assert r.status_code == 400
    assert "inválido" in r.json()["detail"]
    assert not vizinho.exists()


def test_as_duas_funcoes_de_resumo_levantando_recusa_em_vez_de_liberar(
    client, tmp_root, sample_mp4, monkeypatch
):
    """Antes do achado B ser fechado pela raiz, este teste documentava o
    comportamento oposto (200: "levantar também não derruba o upload") — só
    porque `except Exception: existente = None` tratava "não consegui saber"
    e "confirmei que não há mais nada" como a mesma coisa. Não são: quando as
    duas funções levantam (em vez de devolverem None de forma limpa), não dá
    para distinguir daqui "rmtree concorrente apagou tudo mesmo" de "um erro
    qualquer no meio da leitura, com o projeto intacto" — e tem_trabalho() já
    tinha visto True antes deste bloco. Sem informação para desempatar, a
    guarda recusa (409); a corrida legítima com um DELETE concorrente que
    conclui de verdade que não sobrou nada é coberta pelo teste acima, em
    que as duas funções devolvem None sem levantar."""
    import api.routes as routes_mod

    def _levanta(*args, **kwargs):
        raise FileNotFoundError("arquivo sumiu no meio da leitura")

    _criar_job_com_trabalho(tmp_root, "A1")
    monkeypatch.setattr(routes_mod, "job_summary", _levanta)
    monkeypatch.setattr(routes_mod, "job_summary_minimo", _levanta)

    r = _upload(client, "A1", sample_mp4)

    assert r.status_code == 409
    assert (tmp_root / "jobs" / "A1" / "source.mp4").read_bytes() == b"video antigo"
