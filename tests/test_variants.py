"""Golden do deslocamento — a única matemática nova das variações de hook.
Errar aqui é ressuscitar a corrupção silenciosa de legendas (spec 2026-08-01)."""
from pathlib import Path

import pytest

from pipeline.job import init_job, load_json, write_json
from pipeline.variants import deslocar_overlays, fundir_transcricoes


def _linha(texto, start, end):
    return {"text": texto, "start": start, "end": end,
            "words": [{"word": texto, "start": start, "end": end}]}


def test_fundir_desloca_o_corpo_pela_duracao_do_hook():
    hook = [_linha("oi", 0.0, 0.8)]
    corpo = [_linha("corpo", 1.0, 2.0)]
    out = fundir_transcricoes(hook, corpo, delta=3.2)
    assert out[0] == _linha("oi", 0.0, 0.8)                      # hook intacto
    assert out[1]["start"] == 4.2 and out[1]["end"] == 5.2       # 1.0+3.2
    assert out[1]["words"][0]["start"] == 4.2


def test_fundir_nao_muta_as_entradas():
    corpo = [_linha("corpo", 1.0, 2.0)]
    fundir_transcricoes([], corpo, delta=2.0)
    assert corpo[0]["start"] == 1.0


def test_fundir_com_hook_vazio_so_desloca():
    out = fundir_transcricoes([], [_linha("a", 0.5, 1.0)], delta=1.5)
    assert [round(out[0]["start"], 3), round(out[0]["end"], 3)] == [2.0, 2.5]


def test_deslocar_overlays_soma_frames_e_preserva_o_resto():
    ovs = [{"id": "ov_a", "type": "text", "text": "M", "fromFrame": 30,
            "durationInFrames": 20, "x": 0.5}]
    out = deslocar_overlays(ovs, delta=3.2, fps=30.0)
    assert out[0]["fromFrame"] == 30 + 96                        # round(3.2*30)
    assert out[0]["durationInFrames"] == 20 and out[0]["x"] == 0.5
    assert ovs[0]["fromFrame"] == 30                             # não muta


def _matriz_pronta(tmp_path):
    """Matriz mínima: trimmed + probe + transcript + textos + config."""
    jobs_root = tmp_path / "jobs"
    m = init_job(jobs_root, "corpo")
    (m.dir / "trimmed.mp4").write_bytes(b"corpo trimmed")
    write_json(m.dir / "trimmed.probe.json",
               {"width": 1080, "height": 1920, "fps": 30.0, "duration": 8.0, "nb_frames": 240})
    write_json(m.dir / "transcript.json", [_linha("corpo", 1.0, 2.0)])
    write_json(m.dir / "overlays.json", [{"id": "ov_a", "type": "text", "text": "M",
                                          "fromFrame": 30, "durationInFrames": 20}])
    write_json(m.dir / "suggestions.json", [{"id": "sug_a", "text": "S",
                                             "fromFrame": 60, "durationInFrames": 30}])
    write_json(m.dir / "suggest-defaults.json", {"x": 0.5, "y": 0.12})
    cfg = load_json(m.dir / "job.config.json")
    cfg.update({"papel": "matriz", "title": "Meu corpo", "silence_threshold_db": -35.0})
    write_json(m.dir / "job.config.json", cfg)
    return jobs_root, m


def _variacao_falsa(monkeypatch, dur_hook=3.2, dur_composto=11.2):
    """Mocka ffmpeg/whisper de pipeline.variants; devolve os probes usados."""
    from pipeline import variants

    class _Meta:
        width, height, fps = 1080, 1920, 30.0
        def __init__(self, duration): self.duration = duration; self.nb_frames = int(duration * 30)

    probes = {}
    def fake_probe(p):
        # hook cortado tem dur_hook; qualquer outro (o composto) tem dur_composto
        meta = _Meta(dur_hook if "hook" in Path(p).name else dur_composto)
        probes[Path(p).name] = meta
        return meta

    monkeypatch.setattr(variants, "detect_silences", lambda *a, **k: [])
    monkeypatch.setattr(variants, "cut_segments",
                        lambda src, seg, dest, **k: Path(dest).write_bytes(b"hook cortado"))
    monkeypatch.setattr(variants, "probe_video", fake_probe)
    monkeypatch.setattr(variants, "_concat_hook_e_corpo",
                        lambda hook, corpo, dest: Path(dest).write_bytes(b"composto"))
    monkeypatch.setattr(variants, "transcribe_audio",
                        lambda *a, **k: [_linha("oi", 0.0, 0.8)])
    return probes


def test_criar_variacao_monta_o_projeto_completo(tmp_path, monkeypatch):
    from pipeline.variants import criar_variacao
    jobs_root, m = _matriz_pronta(tmp_path)
    _variacao_falsa(monkeypatch)
    (tmp_path / "hook.mov").write_bytes(b"hook bruto")

    criar_variacao(m.dir, jobs_root, "corpo-h1", str(tmp_path / "hook.mov"))

    v = jobs_root / "corpo-h1"
    assert (v / "trimmed.mp4").read_bytes() == b"composto"
    assert not (v / "source.mp4").exists()                       # sem source, de propósito
    probe = load_json(v / "trimmed.probe.json")
    assert probe["duration"] == 11.2
    assert load_json(v / "cuts.json") == [{"start": 0, "end": 11.2}]

    t = load_json(v / "transcript.json")
    assert t[0]["text"] == "oi"                                  # hook primeiro
    assert t[1]["start"] == 1.0 + 3.2                            # corpo deslocado
    assert load_json(v / "overlays.json")[0]["fromFrame"] == 30 + round(3.2 * 30)
    assert load_json(v / "suggestions.json")[0]["fromFrame"] == 60 + round(3.2 * 30)
    assert load_json(v / "suggest-defaults.json") == {"x": 0.5, "y": 0.12}
    assert not (v / "hook.json").exists()                        # texto fica para o usuário

    cfg = load_json(v / "job.config.json")
    assert cfg["papel"] == "normal"
    assert cfg["origem_matriz"] == "corpo"
    assert cfg["silence_threshold_db"] == -35.0                  # sliders herdados
    assert cfg["title"] == "Meu corpo h1"                        # título + sufixo do slug
    # temporários limpos
    assert not any(p.name.startswith("hook") for p in v.iterdir())


def test_criar_variacao_falha_no_meio_faz_rollback(tmp_path, monkeypatch):
    from pipeline.variants import criar_variacao
    jobs_root, m = _matriz_pronta(tmp_path)
    _variacao_falsa(monkeypatch)
    from pipeline import variants
    def explode(*a, **k): raise RuntimeError("whisper caiu")
    monkeypatch.setattr(variants, "transcribe_audio", explode)
    (tmp_path / "hook.mov").write_bytes(b"hook bruto")

    with pytest.raises(RuntimeError, match="whisper caiu"):
        criar_variacao(m.dir, jobs_root, "corpo-h2", str(tmp_path / "hook.mov"))
    assert not (jobs_root / "corpo-h2").exists()                 # nada meio-nascido


def test_criar_variacao_matriz_sem_overlays_nao_estoura(tmp_path, monkeypatch):
    from pipeline.variants import criar_variacao
    jobs_root, m = _matriz_pronta(tmp_path)
    (m.dir / "overlays.json").unlink()
    (m.dir / "suggestions.json").unlink()
    (m.dir / "suggest-defaults.json").unlink()
    _variacao_falsa(monkeypatch)
    (tmp_path / "hook.mov").write_bytes(b"hook bruto")
    criar_variacao(m.dir, jobs_root, "corpo-h3", str(tmp_path / "hook.mov"))
    v = jobs_root / "corpo-h3"
    assert not (v / "overlays.json").exists()
    assert (v / "transcript.json").exists()


def test_concat_nao_reencoda_o_corpo_quando_assinaturas_batem(monkeypatch, tmp_path):
    """A promessa central da abordagem A: o corpo da matriz nunca passa por
    reencode. Assinaturas iguais → copy-concat direto, sem normalizar nada."""
    from pipeline import variants

    chamadas = {"copy": [], "normalize": []}
    monkeypatch.setattr(variants, "_probe_stream_info", lambda p: {"path": "x"})
    monkeypatch.setattr(variants, "_signature", lambda info: ("igual",))
    monkeypatch.setattr(variants, "_try_copy_concat",
                        lambda paths, dest: (chamadas["copy"].append(list(paths)), True)[1])
    monkeypatch.setattr(variants, "_normalize_clip",
                        lambda *a, **k: chamadas["normalize"].append(a))

    variants._concat_hook_e_corpo("hook.mp4", "corpo.mp4", str(tmp_path / "out.mp4"))

    assert chamadas["copy"] == [["hook.mp4", "corpo.mp4"]]
    assert chamadas["normalize"] == []


def test_concat_divergente_normaliza_so_o_hook(monkeypatch, tmp_path):
    """Assinaturas diferentes: SÓ o hook é normalizado (para os parâmetros do
    corpo) e o concat roda com o hook normalizado + corpo original."""
    from pipeline import variants

    chamadas = {"copy": [], "normalize": []}
    infos = {"hook.mp4": {"w": 1, "has_audio": True},
             "corpo.mp4": {"w": 2, "fps": 30.0, "has_audio": True}}
    monkeypatch.setattr(variants, "_probe_stream_info", lambda p: infos[p])
    monkeypatch.setattr(variants, "_signature", lambda info: tuple(sorted(info.items())))
    monkeypatch.setattr(variants, "_display_dims", lambda info: (1080, 1920))

    def fake_normalize(src, dst, w, h, fps, has_audio):
        chamadas["normalize"].append((src, w, h, fps))
    monkeypatch.setattr(variants, "_normalize_clip", fake_normalize)

    def fake_copy(paths, dest):
        chamadas["copy"].append(list(paths))
        return True
    monkeypatch.setattr(variants, "_try_copy_concat", fake_copy)

    variants._concat_hook_e_corpo("hook.mp4", "corpo.mp4", str(tmp_path / "out.mp4"))

    assert len(chamadas["normalize"]) == 1
    assert chamadas["normalize"][0][0] == "hook.mp4"           # só o hook
    assert chamadas["normalize"][0][1:] == (1080, 1920, 30.0)  # parâmetros do corpo
    # o concat final usa o hook normalizado + o corpo ORIGINAL
    assert chamadas["copy"][-1][1] == "corpo.mp4"


def test_concat_que_falha_mesmo_normalizado_estoura(monkeypatch, tmp_path):
    import pytest as _pytest

    from pipeline import variants

    monkeypatch.setattr(variants, "_probe_stream_info",
                        lambda p: {"p": p, "fps": 30.0, "has_audio": True})
    monkeypatch.setattr(variants, "_signature", lambda info: info["p"])
    monkeypatch.setattr(variants, "_display_dims", lambda info: (1080, 1920))
    monkeypatch.setattr(variants, "_normalize_clip", lambda *a, **k: None)
    monkeypatch.setattr(variants, "_try_copy_concat", lambda *a, **k: False)

    with _pytest.raises(RuntimeError, match="concat"):
        variants._concat_hook_e_corpo("hook.mp4", "corpo.mp4", str(tmp_path / "out.mp4"))


def test_paridade_captions_da_variacao_sao_as_da_matriz_deslocadas():
    """Legenda da variação = legenda da matriz deslocada por delta, medida no
    produto final (frames da recipe do Remotion), não na transcrição
    intermediária. build_recipe é keyword-only (pipeline/recipe.py)."""
    from pipeline.recipe import build_recipe
    from pipeline.variants import fundir_transcricoes
    fps = 30.0
    delta = 3.2
    base = {"width": 1080, "height": 1920, "fps": fps,
            "hook": {"title": "", "subtitle": ""}, "hook_card_frames": 0}

    palavras_corpo = [{"word": "corpo", "start": 1.0, "end": 2.0}]
    r_matriz = build_recipe(trimmed_duration=8.0, words=palavras_corpo, **base)

    fundida = fundir_transcricoes([_linha("oi", 0.0, 0.8)],
                                  [_linha("corpo", 1.0, 2.0)], delta)
    palavras_fundidas = [w for linha in fundida for w in linha["words"]]
    r_var = build_recipe(trimmed_duration=8.0 + delta, words=palavras_fundidas, **base)

    # o gap hook→corpo (0.8s vs 4.2s) é maior que max_gap (0.6s), então o
    # corpo vira caption própria nas duas recipes — comparável 1:1
    assert (r_var["captions"][-1]["fromFrame"] - r_matriz["captions"][0]["fromFrame"]
            == round(delta * fps))
