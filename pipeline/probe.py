import json
import subprocess
from dataclasses import dataclass


@dataclass
class VideoMeta:
    width: int
    height: int
    fps: float
    duration: float
    nb_frames: int | None = None


def parse_ffprobe(output: str) -> VideoMeta:
    data = json.loads(output)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    num, den = video["r_frame_rate"].split("/")
    fps = float(num) / float(den)
    nb = video.get("nb_frames")
    try:
        nb_frames = int(nb) if nb not in (None, "N/A") else None
    except (TypeError, ValueError):
        nb_frames = None
    return VideoMeta(
        width=int(video["width"]),
        height=int(video["height"]),
        fps=fps,
        duration=float(data["format"]["duration"]),
        nb_frames=nb_frames,
    )


def probe_video(path: str) -> VideoMeta:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", "-show_streams", path],
        capture_output=True, text=True, check=True,
    )
    return parse_ffprobe(result.stdout)
