import os
import shutil
import subprocess
from pathlib import Path
import pytest

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


def _duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


from pipeline.concat import build_concat_filter


def test_build_concat_filter_two_inputs():
    f = build_concat_filter(2, 1920, 1080, 30)
    assert f.count("scale=1920:1080") == 2
    assert "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" in f


def test_build_concat_filter_three_inputs():
    f = build_concat_filter(3, 1280, 720, 25)
    assert f.count("aresample=async=1") == 3
    assert "concat=n=3:v=1:a=1[v][a]" in f


from pipeline.concat import concat_videos


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


@_needs_ffmpeg
def test_concat_mismatched_resolution_reencodes_to_first(tmp_path):
    a = tmp_path / "a.mp4"; _make_clip(a, 640, 360, 1.0)
    b = tmp_path / "b.mp4"; _make_clip(b, 320, 240, 1.0)
    dest = tmp_path / "out.mp4"
    concat_videos([str(a), str(b)], str(dest))
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", str(dest)],
        capture_output=True, text=True, check=True,
    )
    s = __import__("json").loads(out.stdout)["streams"][0]
    assert (s["width"], s["height"]) == (640, 360)
    assert abs(_duration(dest) - 2.0) < 0.4


def test_concat_empty_raises():
    with pytest.raises(ValueError):
        concat_videos([], "out.mp4")
