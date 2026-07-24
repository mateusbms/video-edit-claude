import json
import shutil
import subprocess
from pathlib import Path


def build_concat_filter(n: int, width: int, height: int, fps: float) -> str:
    """String -filter_complex que escala/preenche cada input para width x height
    a `fps`, depois concatena vídeo + áudio de todos os inputs."""
    parts = []
    for i in range(n):
        parts.append(
            f"[{i}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}[v{i}];"
            f"[{i}:a]aresample=async=1[a{i}];"
        )
    streams = "".join(f"[v{i}][a{i}]" for i in range(n))
    parts.append(f"{streams}concat=n={n}:v=1:a=1[v][a]")
    return "".join(parts)


def _probe_params(path: str) -> tuple:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,r_frame_rate,codec_name",
         "-of", "json", path],
        capture_output=True, text=True, check=True,
    )
    try:
        s = json.loads(result.stdout)["streams"][0]
    except (IndexError, KeyError):
        raise ValueError(f"arquivo sem stream de vídeo: {path}")
    num, den = s["r_frame_rate"].split("/")
    fps = round(float(num) / float(den), 3)
    return (s["width"], s["height"], fps, s["codec_name"])


def _try_copy_concat(paths: list[str], dest: str) -> bool:
    listfile = Path(dest).with_suffix(".concat.txt")
    listfile.write_text(
        "".join(f"file '{Path(p).resolve()}'\n" for p in paths), encoding="utf-8"
    )
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listfile),
             "-c", "copy", dest],
            capture_output=True, check=True,
        )
        return True
    except subprocess.CalledProcessError:
        return False
    finally:
        listfile.unlink(missing_ok=True)


def _reencode_concat(paths: list[str], dest: str, first_params: tuple) -> None:
    width, height, fps, _codec = first_params
    filt = build_concat_filter(len(paths), width, height, fps)
    cmd = ["ffmpeg", "-y"]
    for p in paths:
        cmd += ["-i", p]
    cmd += ["-filter_complex", filt, "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-c:a", "aac", dest]
    subprocess.run(cmd, capture_output=True, check=True)


def concat_videos(paths: list[str], dest: str) -> None:
    """Concatena `paths` em `dest`. 1 arquivo → cópia. N iguais → concat -c copy.
    N divergentes (ou copy falha) → re-encode normalizando para o 1º arquivo."""
    if not paths:
        raise ValueError("nenhum arquivo para concatenar")
    if len(paths) == 1:
        shutil.copy(paths[0], dest)
        return
    params = [_probe_params(p) for p in paths]
    uniform = all(p == params[0] for p in params)
    if uniform and _try_copy_concat(paths, dest):
        return
    _reencode_concat(paths, dest, params[0])
