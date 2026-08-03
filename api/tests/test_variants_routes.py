"""Rota de variações: validações ANTES de gravar, SSE no happy path,
rollback quando o pipeline estoura no meio."""
from pathlib import Path

from pipeline.job import load_json, write_json


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


def _variacao(tmp_root, slug="corpo-h1", origem="corpo", com_hook_source=True):
    d = tmp_root / "jobs" / slug
    d.mkdir(parents=True)
    write_json(d / "job.config.json",
               {"papel": "normal", "origem_matriz": origem, "hook_linhas": 1})
    (d / "trimmed.mp4").write_bytes(b"composto")
    write_json(d / "trimmed.probe.json",
               {"width": 1080, "height": 1920, "fps": 30.0, "duration": 11.2, "nb_frames": 336})
    if com_hook_source:
        (d / "hook_source.mp4").write_bytes(b"hook bruto")
    return d


def _post_recut(client, slug="corpo-h1"):
    return client.post(f"/api/jobs/{slug}/recut-hook",
                       json={"silence_threshold_db": -30.0, "padding": 0.1, "min_silence": 0.5})


def test_recut_de_projeto_sem_hook_source_e_409(client, tmp_root):
    _variacao(tmp_root, com_hook_source=False)
    r = _post_recut(client)
    assert r.status_code == 409
    assert "não pode re-cortar" in r.json()["detail"]


def test_recut_com_matriz_excluida_e_409(client, tmp_root):
    _variacao(tmp_root)  # matriz "corpo" não existe
    r = _post_recut(client)
    assert r.status_code == 409
    assert "excluída" in r.json()["detail"]


def test_recut_happy_path_invalida_e_devolve_hook_linhas(client, tmp_root, monkeypatch):
    _matriz(tmp_root)                          # matriz "corpo" apta (helper existente)
    v = _variacao(tmp_root)
    write_json(v / "edit-recipe.json", {"stale": True})
    from api import routes
    def fake_recompor(var_dir, matriz_dir, progress_cb=None):
        (var_dir / "edit-recipe.json").unlink(missing_ok=True)  # simula invalidação
        cfg = load_json(var_dir / "job.config.json"); cfg["hook_linhas"] = 4
        write_json(var_dir / "job.config.json", cfg)
        return 4
    monkeypatch.setattr(routes, "recompor_hook", fake_recompor)

    r = _post_recut(client)
    assert r.status_code == 200                 # SSE abriu
    assert '"hook_linhas": 4' in r.text.replace("'", '"')
    assert not (v / "edit-recipe.json").exists()
    # sliders persistidos no config
    assert load_json(v / "job.config.json")["silence_threshold_db"] == -30.0
