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
