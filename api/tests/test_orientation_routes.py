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


def test_put_orientation_de_slug_novo_cria_o_projeto_implicitamente(client, tmp_root):
    """update_orientation continua criando o projeto para um slug nunca
    visto — fora do escopo do 404 de slug inexistente (pendência 4 do
    handoff): esta é a única rota de update usada para criar um job sem
    passar por upload em vários outros testes deste arquivo."""
    r = client.put("/api/jobs/o5/orientation", json={"orientation": "9x16"})
    assert r.status_code == 200
    assert (tmp_root / "jobs" / "o5").is_dir()


def test_put_orientation_slug_com_travessia_responde_404(client, tmp_root):
    """update_orientation passa a montar o caminho via _job_dir_seguro: um
    slug de travessia (que não decodifica para o path original) vira 404,
    não uma escrita silenciosa fora de jobs_root."""
    r = client.put("/api/jobs/%2e%2e/orientation", json={"orientation": "9x16"})
    assert r.status_code == 404


def _caption_bottom(tmp_root, slug: str) -> int:
    import json
    cfg = tmp_root / "jobs" / slug / "job.config.json"
    return json.loads(cfg.read_text(encoding="utf-8"))["caption_bottom"]


def test_trocar_para_horizontal_baixa_a_legenda_para_dentro_do_frame(client, tmp_root):
    """`caption_bottom` é px do frame final: 1500 cabe no 9x16 (altura 1920) e
    joga a legenda para fora do 16x9 (altura 1080)."""
    client.put("/api/jobs/cb1/orientation", json={"orientation": "9x16"})
    client.put("/api/jobs/cb1/caption-style",
               json={"fontSize": 48, "bottom": 1500, "color": "",
                     "highlightColor": "", "fontFamily": ""})
    assert _caption_bottom(tmp_root, "cb1") == 1500

    client.put("/api/jobs/cb1/orientation", json={"orientation": "16x9"})
    assert _caption_bottom(tmp_root, "cb1") == int(1080 - 48 * 1.6)  # 1003


def test_trocar_o_formato_nao_mexe_numa_legenda_que_ja_cabe(client, tmp_root):
    client.put("/api/jobs/cb2/orientation", json={"orientation": "9x16"})
    client.put("/api/jobs/cb2/caption-style",
               json={"fontSize": 48, "bottom": 120, "color": "",
                     "highlightColor": "", "fontFamily": ""})
    client.put("/api/jobs/cb2/orientation", json={"orientation": "16x9"})
    assert _caption_bottom(tmp_root, "cb2") == 120


def test_put_sem_mudar_a_orientacao_efetiva_preserva_a_legenda(client, tmp_root):
    """Só a mudança de formato justifica mexer no que o usuário escolheu."""
    client.put("/api/jobs/cb3/orientation", json={"orientation": "9x16"})
    client.put("/api/jobs/cb3/caption-style",
               json={"fontSize": 48, "bottom": 1500, "color": "",
                     "highlightColor": "", "fontFamily": ""})
    client.put("/api/jobs/cb3/orientation", json={"orientation": "9x16"})
    assert _caption_bottom(tmp_root, "cb3") == 1500


class FakeProc:
    """Duble do processo do Remotion mockado — só o suficiente para o gen() da rota."""

    def __init__(self, lines):
        self._lines = list(lines)
        self.stdout = self
        self.returncode = 0

    async def readline(self):
        if self._lines:
            return (self._lines.pop(0) + "\n").encode()
        return b""

    async def wait(self):
        return 0


def _preparar_job_sem_pipeline(client, tmp_root, slug: str, orientation: str) -> None:
    """Leva o job a ter edit-recipe.json sem passar pelo pipeline real.

    Desvio do brief: o helper `_preparar_job` sugerido (upload -> /cut ->
    /transcript -> /hook -> /recipe) depende do ffprobe, que não está
    disponível neste ambiente. Sem ele, /cut nunca produz probe.json/
    trimmed.mp4 e o job nunca chega a ter edit-recipe.json — é exatamente
    por isso que `test_sse.py::test_still_renders_png` já falha hoje com
    `assert 409 == 200`. Para não depender do ffprobe, contornamos o
    pipeline: `PUT /orientation` já chama `init_job` (cria o diretório do
    job e o job.config.json) e aqui escrevemos `trimmed.mp4` (para
    `_publish_remotion_assets` ter o que copiar) e `edit-recipe.json`
    diretamente — o `run_remotion` é mockado nos testes e nunca lê o
    conteúdo real desses arquivos.
    """
    client.put(f"/api/jobs/{slug}/orientation", json={"orientation": orientation})
    job_dir = tmp_root / "jobs" / slug
    (job_dir / "trimmed.mp4").write_bytes(b"x")
    (job_dir / "edit-recipe.json").write_text("{}", encoding="utf-8")


def test_render_usa_so_a_orientacao_do_job(client, tmp_root, monkeypatch):
    """Um job marcado como vertical renderiza 9x16 e mais nada."""
    from api import render as render_mod

    chamadas = []

    async def fake_run(composition, out_path, props_path, remotion_dir, env):
        chamadas.append((composition, out_path.name))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"x")
        return FakeProc(["Rendered 1/1", "Encoded 1/1"])

    monkeypatch.setattr(render_mod, "run_remotion", fake_run)

    _preparar_job_sem_pipeline(client, tmp_root, "r1", "9x16")

    with client.stream("POST", "/api/jobs/r1/render") as r:
        eventos = [ln.split(":", 1)[1].strip()
                   for ln in r.iter_lines() if ln.startswith("event:")]

    assert len(chamadas) == 1, f"esperava 1 render, veio {chamadas}"
    assert chamadas[0] == ("Recorded9x16", "r1-9x16.mp4")
    assert eventos[-1] == "done"


def _escrever_recipe(tmp_root, slug: str, conteudo: str) -> None:
    (tmp_root / "jobs" / slug / "edit-recipe.json").write_text(conteudo, encoding="utf-8")


def test_render_recusa_recipe_de_outra_orientacao(client, tmp_root, monkeypatch):
    """Fluxo que quebrava: trocar o formato e pular direto para Renderizar sem
    passar por Hook/Textos (que são quem chama /recipe)."""
    from api import render as render_mod

    async def nunca(*a, **k):
        raise AssertionError("não deveria chegar a rodar o Remotion")

    monkeypatch.setattr(render_mod, "run_remotion", nunca)

    _preparar_job_sem_pipeline(client, tmp_root, "d1", "9x16")
    _escrever_recipe(tmp_root, "d1", '{"orientation": "16x9", "formats": {"main16x9": {}}}')

    r = client.post("/api/jobs/d1/render")
    assert r.status_code == 409
    detalhe = r.json()["detail"]
    assert "16x9" in detalhe and "9x16" in detalhe and "/recipe" in detalhe


def test_render_aceita_recipe_legada_sem_orientation(client, tmp_root, monkeypatch):
    """Recipes de antes desta feature não têm a chave — não podem virar 409."""
    from api import render as render_mod

    chamadas = []

    async def fake_run(composition, out_path, props_path, remotion_dir, env):
        chamadas.append(composition)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"x")
        return FakeProc(["Rendered 1/1"])

    monkeypatch.setattr(render_mod, "run_remotion", fake_run)

    _preparar_job_sem_pipeline(client, tmp_root, "d2", "9x16")
    _escrever_recipe(
        tmp_root, "d2",
        '{"formats": {"main16x9": {}, "vertical9x16": {}}}',
    )

    with client.stream("POST", "/api/jobs/d2/render") as r:
        list(r.iter_lines())
    assert chamadas == ["Recorded9x16"]


def test_still_recusa_recipe_de_outra_orientacao(client, tmp_root, monkeypatch):
    from api import render as render_mod

    async def nunca(*a, **k):
        raise AssertionError("não deveria chegar a rodar o Remotion")

    monkeypatch.setattr(render_mod, "run_remotion_still", nunca)

    _preparar_job_sem_pipeline(client, tmp_root, "d3", "16x9")
    _escrever_recipe(tmp_root, "d3", '{"orientation": "9x16"}')

    r = client.get("/api/jobs/d3/still?frame=0")
    assert r.status_code == 409
    assert "/recipe" in r.json()["detail"]


def test_trocar_o_formato_invalida_a_recipe_pela_rota(client, tmp_root):
    """A ponta HTTP do mesmo comportamento: PUT /orientation apaga a recipe."""
    _preparar_job_sem_pipeline(client, tmp_root, "d4", "16x9")
    recipe = tmp_root / "jobs" / "d4" / "edit-recipe.json"
    assert recipe.exists()

    client.put("/api/jobs/d4/orientation", json={"orientation": "9x16"})
    assert not recipe.exists()

    r = client.post("/api/jobs/d4/render")
    assert r.status_code == 409
    assert "/recipe" in r.json()["detail"]


def test_render_de_job_horizontal_usa_16x9(client, tmp_root, monkeypatch):
    """Job marcado explicitamente como 16x9 renderiza só esse formato."""
    from api import render as render_mod

    chamadas = []

    async def fake_run(composition, out_path, props_path, remotion_dir, env):
        chamadas.append((composition, out_path.name))
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(b"x")
        return FakeProc(["Rendered 1/1"])

    monkeypatch.setattr(render_mod, "run_remotion", fake_run)

    # explícito em vez de depender do fallback (probe é None sem ffprobe)
    _preparar_job_sem_pipeline(client, tmp_root, "r2", "16x9")

    with client.stream("POST", "/api/jobs/r2/render") as r:
        list(r.iter_lines())

    assert len(chamadas) == 1
    assert chamadas[0] == ("Recorded16x9", "r2-16x9.mp4")
