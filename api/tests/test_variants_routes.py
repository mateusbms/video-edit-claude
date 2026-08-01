"""Rota de variações: validações ANTES de gravar, SSE no happy path,
rollback quando o pipeline estoura no meio."""
from pathlib import Path

from pipeline.job import write_json


def _matriz(tmp_root, slug="corpo", papel="matriz", com_transcript=True):
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True)
    write_json(d / "job.config.json", {"papel": papel, "title": "Corpo"})
    (d / "trimmed.mp4").write_bytes(b"corpo")
    write_json(d / "trimmed.probe.json",
               {"width": 1080, "height": 1920, "fps": 30.0, "duration": 8.0, "nb_frames": 240})
    if com_transcript:
        write_json(d / "transcript.json", [])
    return d


def _post(client, slug, novo="corpo-h1"):
    return client.post(f"/api/jobs/{slug}/variants",
                       data={"novo_slug": novo},
                       files=[("file", ("hook.mov", b"hook bruto", "video/quicktime"))])


def test_variacao_de_projeto_normal_e_409(client, tmp_root):
    _matriz(tmp_root, papel="normal")
    r = _post(client, "corpo")
    assert r.status_code == 409
    assert "matriz" in r.json()["detail"]


def test_variacao_de_matriz_sem_transcript_e_409(client, tmp_root):
    _matriz(tmp_root, com_transcript=False)
    r = _post(client, "corpo")
    assert r.status_code == 409
    assert "transcreva" in r.json()["detail"]


def test_variacao_de_matriz_inexistente_e_404(client, tmp_root):
    assert _post(client, "nunca-existiu").status_code == 404


def test_variacao_com_nome_colidindo_e_409(client, tmp_root):
    _matriz(tmp_root)
    ocupado = tmp_root / "jobs" / "corpo-h1"
    ocupado.mkdir()
    write_json(ocupado / "job.config.json", {})
    (ocupado / "transcript.json").write_text("[]", encoding="utf-8")
    r = _post(client, "corpo")
    assert r.status_code == 409


def test_variacao_happy_path_cria_e_devolve_o_slug(client, tmp_root, monkeypatch):
    _matriz(tmp_root)
    from api import routes
    def fake_criar(matriz_dir, jobs_root, novo_slug, hook_path, progress_cb=None):
        d = Path(jobs_root) / novo_slug
        d.mkdir(parents=True, exist_ok=True)
        write_json(d / "job.config.json", {"origem_matriz": "corpo"})
        assert Path(hook_path).exists(), "o upload precisa estar salvo antes do pipeline"
    monkeypatch.setattr(routes, "criar_variacao", fake_criar)

    r = _post(client, "corpo")
    assert r.status_code == 200
    corpo_resposta = r.text
    assert '"slug": "corpo-h1"' in corpo_resposta.replace("'", '"') or "corpo-h1" in corpo_resposta


def test_variacao_com_erro_no_pipeline_vira_evento_error(client, tmp_root, monkeypatch):
    _matriz(tmp_root)
    from api import routes
    def explode(*a, **k): raise RuntimeError("ffmpeg caiu")
    monkeypatch.setattr(routes, "criar_variacao", explode)
    r = _post(client, "corpo")
    assert r.status_code == 200          # SSE já abriu; o erro vai no stream
    assert "ffmpeg caiu" in r.text
