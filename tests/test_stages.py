import json
import os
import shutil
import subprocess
from pathlib import Path
import pytest
from pipeline.job import init_job, write_json, load_json
from pipeline.stages import stage_recipe, stage_ingest, stage_cut

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg indisponível")


def _clip(path: Path, w: int, h: int, dur: float) -> None:
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", f"testsrc=size={w}x{h}:rate=30:duration={dur}",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={dur}",
         "-shortest", "-pix_fmt", "yuv420p", str(path)],
        capture_output=True, check=True,
    )


def _ingest_falso(monkeypatch, job):
    """stage_ingest sem ffmpeg: só escreve o source e devolve um probe fixo."""
    from pipeline import stages

    def fake_concat(_srcs, dest):
        Path(dest).write_bytes(b"novo source")

    class _Meta:
        width, height, fps, duration, nb_frames = 1080, 1920, 30.0, 10.0, 300

    monkeypatch.setattr(stages, "concat_videos", fake_concat)
    monkeypatch.setattr(stages, "probe_video", lambda _p: _Meta())
    stage_ingest(job, ["qualquer.mp4"])


def test_reenviar_para_o_mesmo_slug_apaga_o_trabalho_do_video_anterior(tmp_path, monkeypatch):
    """Subir outro vídeo no mesmo slug deixava corte e transcrição órfãos.

    O passo de Cortes relê o servidor ao abrir, então esse corte órfão voltava
    na tela: o usuário subia um vídeo novo e via o antigo.
    """
    job = init_job(tmp_path / "jobs", "v1")
    for nome in ("cuts.json", "transcript.json", "hook.json", "overlays.json",
                 "suggestions.json", "edit-recipe.json"):
        write_json(job.dir / nome, {"do": "vídeo antigo"})
    (job.dir / "trimmed.mp4").write_bytes(b"video antigo")
    (job.dir / "trimmed.probe.json").write_text("{}", encoding="utf-8")
    (job.dir / "render.log").write_text("log antigo", encoding="utf-8")

    _ingest_falso(monkeypatch, job)

    for nome in ("cuts.json", "trimmed.mp4", "trimmed.probe.json", "transcript.json",
                 "hook.json", "overlays.json", "suggestions.json", "edit-recipe.json",
                 "render.log"):
        assert not (job.dir / nome).exists(), f"{nome} sobreviveu ao vídeo novo"


def test_reenviar_preserva_as_preferencias_do_job(tmp_path, monkeypatch):
    """Sliders, estilo de legenda e marca não descrevem o vídeo — não se perdem."""
    job = init_job(tmp_path / "jobs", "v2")
    config_antes = (job.dir / "job.config.json").read_text(encoding="utf-8")
    write_json(job.dir / "suggest-defaults.json", {"x": 0.5, "y": 0.12})

    _ingest_falso(monkeypatch, job)

    assert (job.dir / "job.config.json").read_text(encoding="utf-8") == config_antes
    assert load_json(job.dir / "suggest-defaults.json") == {"x": 0.5, "y": 0.12}


def test_primeiro_upload_nao_estoura_sem_derivados(tmp_path, monkeypatch):
    job = init_job(tmp_path / "jobs", "v3")
    _ingest_falso(monkeypatch, job)
    assert (job.dir / "source.mp4").exists()
    assert load_json(job.dir / "probe.json")["height"] == 1920


def test_stage_recipe_writes_edit_recipe(tmp_path):
    job = init_job(tmp_path / "jobs", "v1")
    write_json(job.dir / "probe.json", {"width": 1920, "height": 1080, "fps": 30, "duration": 2.0})
    write_json(job.dir / "transcript.json",
               [{"text": "ola", "start": 0.0, "end": 0.5,
                 "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}])
    hook = {"title": "Hook", "subtitle": "x"}
    write_json(job.dir / "hook.json", hook)

    stage_recipe(job)

    recipe = load_json(job.dir / "edit-recipe.json")
    # Fase B: sem card; hook vira overlay animado sobre o vídeo, legendas sem offset
    assert all(s["type"] != "card" for s in recipe["segments"])
    assert recipe["segments"][0]["type"] == "clip"
    assert recipe["captions"][0]["fromFrame"] == 0
    assert recipe["overlays"][0]["type"] == "hook"
    assert recipe["overlays"][0]["text"] == "Hook"
    assert recipe["overlays"][0]["maxWidthPct"] == 80


@_needs_ffmpeg
def test_stage_ingest_joins_multiple(tmp_path):
    a = tmp_path / "a.mp4"; _clip(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _clip(b, 640, 360, 1.0)
    job = init_job(tmp_path / "jobs", "v1")
    stage_ingest(job, [str(a), str(b)])
    assert (job.dir / "source.mp4").exists()
    probe = load_json(job.dir / "probe.json")
    assert probe["width"] == 640
    assert probe["duration"] > 1.5


def test_stage_recipe_includes_manual_overlays(tmp_path):
    job = init_job(tmp_path / "jobs", "c1")
    write_json(job.dir / "probe.json", {"width": 1920, "height": 1080, "fps": 30, "duration": 2.0})
    write_json(job.dir / "transcript.json",
               [{"text": "ola", "start": 0.0, "end": 0.5,
                 "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}])
    write_json(job.dir / "hook.json", {"title": "H", "subtitle": ""})
    write_json(job.dir / "overlays.json", [{
        "id": "ov_a", "type": "text", "text": "Manual",
        "fromFrame": 10, "durationInFrames": 20,
        "x": 0.5, "y": 0.3, "anchor": "center", "fontSize": 64,
        "color": "", "highlightColor": "", "fontFamily": "",
        "enter": "fade", "exit": "fade",
        "enterDurationInFrames": 12, "exitDurationInFrames": 12,
    }])
    stage_recipe(job)
    recipe = load_json(job.dir / "edit-recipe.json")
    assert any(o["text"] == "Manual" for o in recipe["overlays"])
    assert recipe["overlays"][0]["type"] == "hook"  # hook ainda primeiro


@_needs_ffmpeg
def test_stage_refine_deletes_overlays_json(tmp_path):
    from pipeline.stages import stage_refine
    from pipeline.silence import Segment
    from pipeline.probe import probe_video
    job = init_job(tmp_path / "jobs", "c2")
    trimmed = job.dir / "trimmed.mp4"
    _clip(trimmed, 320, 240, 2.0)
    tm = probe_video(str(trimmed))
    write_json(job.dir / "trimmed.probe.json",
               {"width": tm.width, "height": tm.height, "fps": tm.fps,
                "duration": tm.duration, "nb_frames": tm.nb_frames})
    write_json(job.dir / "overlays.json", [{"id": "ov_a", "type": "text", "text": "m",
                                            "fromFrame": 0, "durationInFrames": 10}])
    # remove um pequeno trecho no meio; sobra vídeo suficiente
    stage_refine(job, [Segment(0.5, 1.0)])
    assert not (job.dir / "overlays.json").exists()


@_needs_ffmpeg
def test_stage_refine_deletes_suggestions_keeps_suggest_defaults(tmp_path):
    from pipeline.stages import stage_refine
    from pipeline.silence import Segment
    from pipeline.probe import probe_video
    job = init_job(tmp_path / "jobs", "c3")
    trimmed = job.dir / "trimmed.mp4"
    _clip(trimmed, 320, 240, 2.0)
    tm = probe_video(str(trimmed))
    write_json(job.dir / "trimmed.probe.json",
               {"width": tm.width, "height": tm.height, "fps": tm.fps,
                "duration": tm.duration, "nb_frames": tm.nb_frames})
    write_json(job.dir / "suggestions.json", [{"id": "sug_a", "text": "s",
                                               "fromFrame": 0, "durationInFrames": 10}])
    write_json(job.dir / "suggest-defaults.json", {"x": 0.5, "y": 0.12})
    # remove um pequeno trecho no meio; sobra vídeo suficiente
    stage_refine(job, [Segment(0.5, 1.0)])
    assert not (job.dir / "suggestions.json").exists()
    assert (job.dir / "suggest-defaults.json").exists()


def _cut_falso(monkeypatch, job):
    """stage_cut sem ffmpeg: sem silêncios (mantém o vídeo inteiro), corte e
    probe mockados. Segue o padrão do _ingest_falso."""
    from pipeline import stages

    class _Meta:
        width, height, fps, duration, nb_frames = 1080, 1920, 30.0, 8.0, 240

    def fake_cut(_src, _kept, dest, total_duration=None, progress_cb=None, scale=None):
        Path(dest).write_bytes(b"trimmed novo")

    monkeypatch.setattr(stages, "detect_silences", lambda *_a, **_k: [])
    monkeypatch.setattr(stages, "cut_segments", fake_cut)
    monkeypatch.setattr(stages, "probe_video", lambda _p: _Meta())
    stage_cut(job)


def test_stage_cut_apaga_os_derivados_do_trimmed(tmp_path, monkeypatch):
    """Re-detectar pausas reescreve o trimmed.mp4. Transcrição, textos,
    sugestões e receita descrevem a timeline antiga — sem invalidá-los, o
    render sai com legendas fora de sincronia, em silêncio. Mesma invalidação
    que o stage_refine já faz."""
    job = init_job(tmp_path / "jobs", "c4")
    (job.dir / "source.mp4").write_bytes(b"source")
    write_json(job.dir / "probe.json",
               {"width": 1080, "height": 1920, "fps": 30.0, "duration": 8.0})
    for nome in ("transcript.json", "edit-recipe.json", "overlays.json", "suggestions.json"):
        write_json(job.dir / nome, {"da": "timeline antiga"})
    write_json(job.dir / "hook.json", {"title": "H", "subtitle": ""})
    write_json(job.dir / "suggest-defaults.json", {"x": 0.5})

    _cut_falso(monkeypatch, job)

    for nome in ("transcript.json", "edit-recipe.json", "overlays.json", "suggestions.json"):
        assert not (job.dir / nome).exists(), f"{nome} sobreviveu ao corte novo"
    # hook e preferências não descrevem a timeline — sobrevivem (como no refino)
    assert (job.dir / "hook.json").exists()
    assert (job.dir / "suggest-defaults.json").exists()
    # e o corte em si foi escrito
    assert (job.dir / "cuts.json").exists()
    assert (job.dir / "trimmed.mp4").exists()
    assert (job.dir / "trimmed.probe.json").exists()


def test_stage_cut_sem_derivados_nao_falha(tmp_path, monkeypatch):
    """Primeiro corte de um projeto: não há nada para invalidar."""
    job = init_job(tmp_path / "jobs", "c5")
    (job.dir / "source.mp4").write_bytes(b"source")
    write_json(job.dir / "probe.json",
               {"width": 1080, "height": 1920, "fps": 30.0, "duration": 8.0})
    _cut_falso(monkeypatch, job)
    assert (job.dir / "trimmed.mp4").exists()


def test_stage_recipe_sem_hook_json_nao_estoura(tmp_path):
    """Achado Critical da revisão das variações de hook: a matriz nunca passa
    pelo passo de Hook, então hook.json não existe — e o Concluir do wizard
    (que salva os textos e gera a recipe) estourava com FileNotFoundError →
    500, prendendo o usuário no passo Textos. Sem hook.json, a recipe nasce
    com o overlay de hook vazio (invisível), como um título vazio já nascia."""
    job = init_job(tmp_path / "jobs", "m1")
    write_json(job.dir / "probe.json", {"width": 1920, "height": 1080, "fps": 30, "duration": 2.0})
    write_json(job.dir / "transcript.json",
               [{"text": "ola", "start": 0.0, "end": 0.5,
                 "words": [{"word": "ola", "start": 0.0, "end": 0.5}]}])

    stage_recipe(job)

    recipe = load_json(job.dir / "edit-recipe.json")
    assert recipe["overlays"][0]["type"] == "hook"
    assert recipe["overlays"][0]["text"] == ""
