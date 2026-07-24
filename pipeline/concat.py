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
