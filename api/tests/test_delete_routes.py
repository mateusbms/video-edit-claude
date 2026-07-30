"""DELETE de projeto e de source.

O render exportado em output/ sobrevive aos dois, de propósito: é o entregável,
e o usuário costuma apagar o projeto justamente por já tê-lo exportado.
"""

import json

import pytest


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


def test_apagar_projeto_pelo_http_remove_as_partes_de_upload(client, tmp_root):
    """Mesmo teste do achado N4, mas pela rota HTTP: DELETE /api/jobs/{slug}
    precisa varrer input/ com o INPUT_ROOT resolvido por _roots(), não só a
    função de baixo nível."""
    _criar_job(tmp_root, "d8", {"source.mp4": b"x"})
    partes_root = tmp_root / "input"
    (partes_root / "d8-part0.mp4").write_bytes(b"parte0")
    (partes_root / "outro-part0.mp4").write_bytes(b"nao mexer")

    r = client.delete("/api/jobs/d8")
    assert r.status_code == 200
    assert not (partes_root / "d8-part0.mp4").exists()
    assert (partes_root / "outro-part0.mp4").exists()


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


def test_apagar_o_source_preserva_o_render_exportado(client, tmp_root):
    """Simétrico de test_apagar_o_projeto_preserva_o_render_exportado: liberar
    espaço apagando só o source também não pode levar o render junto."""
    _criar_job(tmp_root, "d7", {"source.mp4": b"x"})
    render = tmp_root / "output" / "d7-9x16.mp4"
    render.write_bytes(b"z")

    client.delete("/api/jobs/d7/source")
    assert render.exists(), "o render exportado não pode sumir junto"


def test_liberar_espaco_sem_source_responde_404(client, tmp_root):
    """Projeto existe, mas não tem source: 404 com mensagem específica —
    distinta da de "projeto não encontrado" (ver teste abaixo)."""
    _criar_job(tmp_root, "d6", {"trimmed.mp4": b"y"})
    r = client.delete("/api/jobs/d6/source")
    assert r.status_code == 404
    assert "vídeo original" in r.json()["detail"]


def test_liberar_espaco_de_projeto_inexistente_diz_que_o_projeto_nao_existe(client, tmp_root):
    """Diferente do caso acima: aqui o diretório do projeto nem existe, e a
    mensagem não pode afirmar falsamente "este projeto não tem vídeo
    original" — precisa dizer que o projeto não foi encontrado."""
    r = client.delete("/api/jobs/nunca-existiu/source")
    assert r.status_code == 404
    assert "não encontrado" in r.json()["detail"]
    assert "vídeo original" not in r.json()["detail"]


def test_slug_com_travessia_de_caminho_e_recusado(client, tmp_root):
    """`%2e%2e` decodifica para o segmento literal ".." sem introduzir barra
    nenhuma, então casa normalmente com `{slug}` e chega até a rota — ao
    contrário de `..%2F...` (barra codificada), que quebra o segmento e cai no
    fallback SPA antes de alcançar o guard (ver histórico deste arquivo). Este
    caso exercita o guard de verdade: se `_job_dir_seguro` fosse removido, a
    resposta deixaria de ser 404.
    """
    r = client.delete("/api/jobs/%2e%2e")
    assert r.status_code == 404


def test_slug_com_barra_invertida_nao_apaga_subdiretorio_do_projeto(client, tmp_root):
    """Cenário real do achado: `\\` é separador de path no Windows, então um
    slug "projeto\\audio" resolve para dentro de jobs_root/projeto/audio, que
    está *contido* em jobs_root mas não é o diretório de um projeto — é a
    subpasta onde a locução da ElevenLabs é gravada (api/animated_routes.py,
    api/tts_routes.py). Checar só contenção deixava isso passar com 200 e
    apagava a locução paga; o guard agora exige que o slug seja exatamente um
    segmento dentro de jobs_root.
    """
    d = tmp_root / "jobs" / "projeto"
    d.mkdir(parents=True)
    (d / "job.config.json").write_text("{}", encoding="utf-8")
    (d / "audio").mkdir()
    (d / "audio" / "narracao.mp3").write_bytes(b"caro")

    r = client.delete("/api/jobs/projeto%5Caudio")
    assert r.status_code == 404
    assert (d / "audio" / "narracao.mp3").exists()


def test_delete_job_recusa_slug_que_tenta_escapar_de_jobs_root(tmp_path):
    """Unit test direto de api.jobs.delete_job: um slug ".." não pode apagar
    o diretório pai de jobs_root, nem um "../vizinho" apagar um projeto irmão."""
    from api.jobs import delete_job

    jobs_root = tmp_path / "jobs"
    jobs_root.mkdir()
    input_root = tmp_path / "input"
    vizinho = jobs_root.parent / "vizinho-fora-de-jobs"
    vizinho.mkdir()
    (vizinho / "marca.txt").write_text("nao pode sumir", encoding="utf-8")

    assert delete_job("..", jobs_root, input_root) is False
    assert delete_job("../vizinho-fora-de-jobs", jobs_root, input_root) is False
    assert vizinho.exists()


def test_delete_job_recusa_barra_invertida_para_subdiretorio(tmp_path):
    """Fixa a propriedade central do achado Important 1: um slug com "\\"
    (separador de path no Windows) não pode apagar uma subpasta do projeto
    como se fosse o projeto inteiro."""
    from api.jobs import delete_job

    jobs_root = tmp_path / "jobs"
    jobs_root.mkdir()
    input_root = tmp_path / "input"
    projeto = jobs_root / "a"
    projeto.mkdir()
    sub = projeto / "b"
    sub.mkdir()
    (sub / "narracao.mp3").write_bytes(b"caro")

    assert delete_job("a\\b", jobs_root, input_root) is False
    assert (sub / "narracao.mp3").exists()


def test_delete_job_apaga_as_partes_de_upload_originais(tmp_path):
    """create_job grava uma cópia de cada arquivo enviado em
    input/<slug>-part*.mp4 antes de concatená-las em source.mp4. Excluir o
    projeto sem apagar essas cópias deixa duas cópias invisíveis do vídeo
    original em disco — numa tela cuja razão de existir é o disco não crescer
    sem limite."""
    from api.jobs import delete_job

    jobs_root = tmp_path / "jobs"
    jobs_root.mkdir()
    input_root = tmp_path / "input"
    input_root.mkdir()

    projeto = jobs_root / "d9"
    projeto.mkdir()
    (projeto / "job.config.json").write_text("{}", encoding="utf-8")

    (input_root / "d9-part0.mp4").write_bytes(b"parte0")
    (input_root / "d9-part1.mp4").write_bytes(b"parte1")
    alheia = input_root / "outro-part0.mp4"
    alheia.write_bytes(b"nao pode sumir")

    assert delete_job("d9", jobs_root, input_root) is True
    assert not (input_root / "d9-part0.mp4").exists()
    assert not (input_root / "d9-part1.mp4").exists()
    assert alheia.exists()


def test_delete_job_escapa_caracteres_de_glob_no_slug_ao_apagar_partes(tmp_path):
    """Sem glob.escape, um slug com colchetes vira uma classe de caracteres no
    padrão glob e pode casar com o prefixo de outro projeto em input/ — aqui
    "x[yz]" sem escape casaria com "xy-part0.mp4" ou "xz-part0.mp4"."""
    from api.jobs import delete_job

    jobs_root = tmp_path / "jobs"
    jobs_root.mkdir()
    input_root = tmp_path / "input"
    input_root.mkdir()

    slug = "x[yz]"
    projeto = jobs_root / slug
    projeto.mkdir()
    (projeto / "job.config.json").write_text("{}", encoding="utf-8")

    alheia = input_root / "xy-part0.mp4"
    alheia.write_bytes(b"pertence a outro projeto")

    assert delete_job(slug, jobs_root, input_root) is True
    assert alheia.exists(), "glob sem escape no slug apagou parte de outro projeto"


def test_delete_source_recusa_slug_que_tenta_escapar_de_jobs_root(tmp_path):
    """Mesma proteção para delete_source: sem escapar de jobs_root. Como o
    alvo nem existe dentro de jobs_root, é o caso "projeto não encontrado" —
    ProjetoNaoEncontradoError, não um False silencioso (ver Important 3)."""
    from api.jobs import ProjetoNaoEncontradoError, delete_source

    jobs_root = tmp_path / "jobs"
    jobs_root.mkdir()
    vizinho = jobs_root.parent / "vizinho-fora-de-jobs"
    vizinho.mkdir()
    (vizinho / "source.mp4").write_bytes(b"nao pode sumir")

    with pytest.raises(ProjetoNaoEncontradoError):
        delete_source("../vizinho-fora-de-jobs", jobs_root)
    assert (vizinho / "source.mp4").exists()


def test_delete_job_traduz_erro_de_arquivo_em_uso(client, tmp_root, monkeypatch):
    """No Windows, ffmpeh rodando em background (api/progress.py) pode manter
    source.mp4/trimmed.mp4 abertos; rmtree estoura PermissionError e a árvore
    pode ficar parcialmente apagada. Isso não pode virar um 500 cru — a rota
    precisa traduzir para um 409 explicando o motivo."""
    import api.jobs as jobs_mod

    _criar_job(tmp_root, "trava", {"source.mp4": b"x"})

    def _rmtree_falha(*args, **kwargs):
        raise PermissionError("[WinError 32] arquivo em uso por outro processo")

    monkeypatch.setattr(jobs_mod.shutil, "rmtree", _rmtree_falha)

    r = client.delete("/api/jobs/trava")
    assert r.status_code == 409
    assert "processo" in r.json()["detail"].lower()


def test_delete_source_traduz_erro_de_arquivo_em_uso(client, tmp_root, monkeypatch):
    """Mesmo cuidado no unlink do source: sem destruição parcial aqui, mas o
    500 cru é igual e precisa virar 409."""
    import api.jobs as jobs_mod

    _criar_job(tmp_root, "trava2", {"source.mp4": b"x"})

    def _unlink_falha(self, *args, **kwargs):
        raise PermissionError("[WinError 32] arquivo em uso por outro processo")

    monkeypatch.setattr(jobs_mod.Path, "unlink", _unlink_falha)

    r = client.delete("/api/jobs/trava2/source")
    assert r.status_code == 409
    assert "processo" in r.json()["detail"].lower()


def test_delete_job_concorrente_no_mesmo_slug_devolve_404_nao_409(client, tmp_root, monkeypatch):
    """Duas requisições DELETE concorrentes no mesmo slug: a segunda encontra
    o diretório já sumido durante o rmtree. FileNotFoundError não é "arquivo
    em uso" — é "não havia o que apagar", o mesmo 404 de um slug que nunca
    existiu. Antes desta correção, `except OSError` capturava
    FileNotFoundError (subclasse de OSError) junto com PermissionError e
    respondia 409 para as duas."""
    import api.jobs as jobs_mod

    _criar_job(tmp_root, "concorrente", {"source.mp4": b"x"})

    def _rmtree_sumiu(*args, **kwargs):
        raise FileNotFoundError(2, "não é possível localizar o arquivo especificado")

    monkeypatch.setattr(jobs_mod.shutil, "rmtree", _rmtree_sumiu)

    r = client.delete("/api/jobs/concorrente")
    assert r.status_code == 404


def test_delete_source_concorrente_no_mesmo_slug_devolve_404_nao_409(client, tmp_root, monkeypatch):
    """Simétrico do teste acima para /source: um FileNotFoundError no unlink
    (a segunda de duas chamadas concorrentes) não pode virar 409."""
    import api.jobs as jobs_mod

    _criar_job(tmp_root, "concorrente2", {"source.mp4": b"x"})

    def _unlink_sumiu(self, *args, **kwargs):
        raise FileNotFoundError(2, "não é possível localizar o arquivo especificado")

    monkeypatch.setattr(jobs_mod.Path, "unlink", _unlink_sumiu)

    r = client.delete("/api/jobs/concorrente2/source")
    assert r.status_code == 404
