import os
import shutil
import subprocess
from pathlib import Path
import pytest
from pipeline.silence import (
    parse_silences,
    compute_kept_segments,
    Segment,
    build_select_expr,
    detect_silences,
    invert_ranges,
    build_scale_filter,
)
from pipeline.job import init_job, write_json
from pipeline.stages import stage_cut
from pipeline.probe import probe_video

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg indisponível")


def test_parse_silences_pairs_starts_and_ends():
    stderr = (
        "[silencedetect @ 0x1] silence_start: 2.0\n"
        "[silencedetect @ 0x1] silence_end: 3.5 | silence_duration: 1.5\n"
        "[silencedetect @ 0x1] silence_start: 10.0\n"
        "[silencedetect @ 0x1] silence_end: 11.2 | silence_duration: 1.2\n"
    )
    silences = parse_silences(stderr)
    assert silences == [(2.0, 3.5), (10.0, 11.2)]


def test_compute_kept_segments_inverts_silences():
    silences = [(2.0, 3.5), (10.0, 11.2)]
    kept = compute_kept_segments(silences, duration=15.0, padding=0.0, min_segment=0.0)
    assert kept == [Segment(0.0, 2.0), Segment(3.5, 10.0), Segment(11.2, 15.0)]


def test_compute_kept_segments_drops_short_after_padding_merge():
    # silêncio curto entre duas falas some após padding e merge
    silences = [(2.0, 2.2)]
    kept = compute_kept_segments(silences, duration=10.0, padding=0.3, min_segment=0.3)
    assert len(kept) == 1
    assert kept[0].start == 0.0
    assert kept[0].end == 10.0


def test_compute_kept_segments_drops_tiny_segments():
    silences = [(0.0, 0.0), (0.1, 9.9)]  # sobra só [9.9, 10.0]
    kept = compute_kept_segments(silences, duration=10.0, padding=0.0, min_segment=0.3)
    assert kept == []


def test_build_select_expr_joins_segments():
    expr = build_select_expr([Segment(0.0, 2.0), Segment(3.5, 10.0)])
    assert expr == "between(t,0.000,2.000)+between(t,3.500,10.000)"


def test_build_scale_filter_downscales_4k_vertical():
    assert build_scale_filter(2160, 3840) == "scale=1080:1920"


def test_build_scale_filter_downscales_4k_landscape():
    assert build_scale_filter(3840, 2160) == "scale=1920:1080"


def test_build_scale_filter_none_when_within_limit():
    assert build_scale_filter(1920, 1080) is None
    assert build_scale_filter(1080, 1920) is None


def test_build_scale_filter_never_upscales():
    assert build_scale_filter(1280, 720) is None


def test_build_scale_filter_dims_are_even():
    s = build_scale_filter(1234, 4000)
    w, h = (int(x) for x in s.removeprefix("scale=").split(":"))
    assert w % 2 == 0 and h % 2 == 0 and h == 1920


def test_invert_ranges_middle():
    keep = invert_ranges([Segment(1.0, 2.0)], 3.0)
    assert [(s.start, s.end) for s in keep] == [(0.0, 1.0), (2.0, 3.0)]


def test_invert_ranges_empty_keeps_all():
    keep = invert_ranges([], 3.0)
    assert [(s.start, s.end) for s in keep] == [(0.0, 3.0)]


def test_invert_ranges_overlap_merged():
    keep = invert_ranges([Segment(1.0, 2.0), Segment(1.5, 2.5)], 3.0)
    assert [(s.start, s.end) for s in keep] == [(0.0, 1.0), (2.5, 3.0)]


def test_invert_ranges_edge():
    keep = invert_ranges([Segment(0.0, 1.0)], 3.0)
    assert [(s.start, s.end) for s in keep] == [(1.0, 3.0)]


def test_invert_ranges_beyond_duration_keeps_all():
    # trecho inteiramente além da duração: descartado, mantém o clipe inteiro
    keep = invert_ranges([Segment(5.0, 10.0)], 3.0)
    assert [(s.start, s.end) for s in keep] == [(0.0, 3.0)]


def test_cut_segments_uses_videotoolbox_and_scale(monkeypatch):
    import pipeline.silence as sil
    monkeypatch.setattr(sil, "_vt_available", lambda: True)
    captured = {}

    class FakeProc:
        returncode = 0
        stdout = iter(["out_time_us=1000000\n"])
        def wait(self): return 0

    def fake_popen(cmd, **kw):
        captured["cmd"] = cmd
        return FakeProc()

    monkeypatch.setattr(sil.subprocess, "Popen", fake_popen)
    sil.cut_segments("in.mp4", [Segment(0.0, 2.0)], "out.mp4", scale="scale=1080:1920")
    cmd = captured["cmd"]
    assert "-hwaccel" in cmd and "videotoolbox" in cmd
    assert "h264_videotoolbox" in cmd
    vf = cmd[cmd.index("-vf") + 1]
    assert "scale=1080:1920" in vf


def test_cut_segments_falls_back_to_libx264(monkeypatch):
    import pipeline.silence as sil
    monkeypatch.setattr(sil, "_vt_available", lambda: False)
    captured = {}

    class FakeProc:
        returncode = 0
        stdout = iter([])
        def wait(self): return 0

    monkeypatch.setattr(sil.subprocess, "Popen", lambda cmd, **kw: (captured.__setitem__("cmd", cmd) or FakeProc()))
    sil.cut_segments("in.mp4", [Segment(0.0, 2.0)], "out.mp4")
    cmd = captured["cmd"]
    assert "libx264" in cmd
    assert "-hwaccel" not in cmd


@_needs_ffmpeg
def test_detect_silences_finds_gap(tmp_path):
    clip = tmp_path / "c.mp4"
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", "color=c=black:s=320x240:d=3",
         "-f", "lavfi", "-i", "sine=frequency=440:d=3",
         "-af", "volume='if(lt(t,1)+gt(t,2),1,0)':eval=frame",
         "-shortest", "-pix_fmt", "yuv420p", str(clip)],
        capture_output=True, check=True,
    )
    silences = detect_silences(str(clip), noise_db=-30.0, min_silence=0.3)
    assert len(silences) >= 1
    s_start, s_end = silences[0]
    assert 0.8 < s_start < 1.6


@_needs_ffmpeg
def test_stage_cut_reports_progress(tmp_path):
    src = tmp_path / "jobs" / "v1" / "source.mp4"
    src.parent.mkdir(parents=True)
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", "color=c=black:s=320x240:d=3",
         "-f", "lavfi", "-i", "sine=frequency=440:d=3",
         "-af", "volume='if(lt(t,1)+gt(t,2),1,0)':eval=frame",
         "-shortest", "-pix_fmt", "yuv420p", str(src)],
        capture_output=True, check=True,
    )
    job = init_job(tmp_path / "jobs", "v1")
    m = probe_video(str(src))
    write_json(job.dir / "probe.json",
               {"width": m.width, "height": m.height, "fps": m.fps,
                "duration": m.duration, "nb_frames": m.nb_frames})

    calls = []
    stage_cut(job, progress_cb=lambda n, total: calls.append((n, total)))

    assert (job.dir / "trimmed.mp4").exists()
    assert calls, "progress_cb não foi chamado"
    n, total = calls[-1]
    assert total > 0 and 0 <= n <= total


from pipeline.silence import fronteira_local


def test_fronteira_pega_o_meio_das_pausas_que_bracketam_o_clique():
    # pausas (start,end) absolutas dentro da janela [21,23]; clique em 22 (no ruído)
    silencios = [(21.1, 21.5), (22.4, 22.8)]
    r = fronteira_local(silencios, center=22.0, w0=21.0, w1=23.0)
    assert r["start"] == 21.3            # meio de (21.1,21.5)
    assert r["end"] == 22.6              # meio de (22.4,22.8)
    assert r["limpo_inicio"] is True and r["limpo_fim"] is True


def test_fronteira_clique_dentro_de_pausa_expande_para_vizinhas():
    # clique em 22.0 cai DENTRO de (21.8,22.2); expande para as pausas vizinhas
    silencios = [(21.0, 21.2), (21.8, 22.2), (22.7, 22.9)]
    r = fronteira_local(silencios, center=22.0, w0=21.0, w1=23.0)
    assert r["start"] == 21.1            # meio da pausa à esquerda da que contém
    assert r["end"] == 22.8             # meio da pausa à direita da que contém


def test_fronteira_sem_pausa_de_um_lado_usa_default_e_marca_nao_limpo():
    silencios = [(21.1, 21.5)]          # só à esquerda
    r = fronteira_local(silencios, center=22.0, w0=21.0, w1=23.0, default_raio=0.15)
    assert r["start"] == 21.3
    assert r["end"] == 22.15            # center + default_raio
    assert r["limpo_inicio"] is True and r["limpo_fim"] is False


def test_fronteira_sem_pausa_nenhuma_cai_no_default_dos_dois_lados():
    r = fronteira_local([], center=22.0, w0=21.0, w1=23.0, default_raio=0.15)
    assert r["start"] == 21.85 and r["end"] == 22.15
    assert r["limpo_inicio"] is False and r["limpo_fim"] is False


def test_fronteira_default_clampa_nas_bordas_da_janela():
    r = fronteira_local([], center=21.05, w0=21.0, w1=23.0, default_raio=0.15)
    assert r["start"] == 21.0           # max(w0, center-default_raio)


def test_detect_janela_desloca_timestamps_para_o_absoluto(monkeypatch):
    from pipeline import silence

    class _R:
        # silencedetect reporta relativo ao slice (-ss antes de -i zera o PTS)
        stderr = ("[silencedetect] silence_start: 0.100\n"
                  "[silencedetect] silence_end: 0.500 | silence_duration: 0.4\n")

    capturado = {}
    def fake_run(cmd, capture_output, text):
        capturado["cmd"] = cmd
        return _R()
    monkeypatch.setattr(silence.subprocess, "run", fake_run)

    out = silence.detect_silences_janela("trimmed.mp4", center=22.0, raio=1.0,
                                         noise_db=-30.0, min_silence=0.08)
    # janela começa em 21.0 → 0.1/0.5 viram 21.1/21.5
    assert out == [(21.1, 21.5)]
    # a fatia foi pedida com -ss/-t e o filtro certo
    cmd = capturado["cmd"]
    assert "-ss" in cmd and "21.000" in cmd
    assert "-t" in cmd and "2.000" in cmd
    assert any("silencedetect=noise=-30.0dB:d=0.08" in a for a in cmd)


def test_detect_janela_clampa_o_inicio_em_zero(monkeypatch):
    from pipeline import silence
    class _R: stderr = ""
    cap = {}
    monkeypatch.setattr(silence.subprocess, "run",
                        lambda cmd, capture_output, text: (cap.setdefault("cmd", cmd), _R())[1])
    silence.detect_silences_janela("t.mp4", center=0.3, raio=1.0)
    assert "0.000" in cap["cmd"]        # -ss não fica negativo
