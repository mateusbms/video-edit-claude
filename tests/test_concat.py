import json
import os
import shutil
import subprocess
from pathlib import Path
import pytest

from pipeline.concat import concat_videos

_REPO_BIN = Path(__file__).resolve().parents[1] / "bin"
os.environ["PATH"] = f"{_REPO_BIN}{os.pathsep}{os.environ.get('PATH', '')}"
_FFMPEG = shutil.which("ffmpeg")
_needs_ffmpeg = pytest.mark.skipif(_FFMPEG is None, reason="ffmpeg indisponível")


def _make_clip(path: Path, w: int, h: int, dur: float) -> None:
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", f"testsrc=size={w}x{h}:rate=30:duration={dur}",
         "-f", "lavfi", "-i", f"sine=frequency=440:duration={dur}",
         "-shortest", "-pix_fmt", "yuv420p", str(path)],
        capture_output=True, check=True,
    )


def _make_clip_no_audio(path: Path, w: int, h: int, dur: float) -> None:
    subprocess.run(
        ["ffmpeg", "-y",
         "-f", "lavfi", "-i", f"testsrc=size={w}x{h}:rate=30:duration={dur}",
         "-an", "-pix_fmt", "yuv420p", str(path)],
        capture_output=True, check=True,
    )


def _duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def _has_audio(path: Path) -> bool:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-select_streams", "a",
         "-show_entries", "stream=index", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return bool(out.stdout.strip())


def _video_dims(path: Path) -> tuple:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    s = json.loads(out.stdout)["streams"][0]
    return (s["width"], s["height"])


@_needs_ffmpeg
def test_concat_single_file_copies(tmp_path):
    a = tmp_path / "a.mp4"; _make_clip(a, 640, 360, 1.0)
    dest = tmp_path / "out.mp4"
    concat_videos([str(a)], str(dest))
    assert dest.exists()
    assert abs(_duration(dest) - 1.0) < 0.3


@_needs_ffmpeg
def test_concat_uniform_sums_duration(tmp_path):
    a = tmp_path / "a.mp4"; _make_clip(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _make_clip(b, 640, 360, 1.0)
    dest = tmp_path / "out.mp4"
    concat_videos([str(a), str(b)], str(dest))
    assert abs(_duration(dest) - 2.0) < 0.4
    assert _has_audio(dest)


@_needs_ffmpeg
def test_concat_mismatched_resolution_reencodes_to_first(tmp_path):
    a = tmp_path / "a.mp4"; _make_clip(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _make_clip(b, 320, 240, 1.0)
    dest = tmp_path / "out.mp4"
    concat_videos([str(a), str(b)], str(dest))
    assert _video_dims(dest) == (640, 360)
    assert abs(_duration(dest) - 2.0) < 0.4


@_needs_ffmpeg
def test_concat_input_missing_audio_does_not_crash_and_stays_synced(tmp_path):
    """Regressão: um clipe sem áudio não pode causar crash nem áudio truncado.
    O resultado deve ter áudio cobrindo a duração inteira (silêncio na parte muda)."""
    a = tmp_path / "a.mp4"; _make_clip(a, 640, 360, 1.0)          # com áudio
    b = tmp_path / "b.mp4"; _make_clip_no_audio(b, 640, 360, 1.0)  # sem áudio
    dest = tmp_path / "out.mp4"
    concat_videos([str(a), str(b)], str(dest))
    assert dest.exists()
    assert _has_audio(dest)
    assert abs(_duration(dest) - 2.0) < 0.5


@_needs_ffmpeg
def test_concat_uniform_without_audio(tmp_path):
    a = tmp_path / "a.mp4"; _make_clip_no_audio(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _make_clip_no_audio(b, 640, 360, 1.0)
    dest = tmp_path / "out.mp4"
    concat_videos([str(a), str(b)], str(dest))
    assert abs(_duration(dest) - 2.0) < 0.4


def test_concat_empty_raises():
    with pytest.raises(ValueError):
        concat_videos([], "out.mp4")
