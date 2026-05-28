import json
import subprocess
from dataclasses import dataclass


@dataclass
class VideoMeta:
    width: int
    height: int
    fps: float
    duration: float


def parse_ffprobe(output: str) -> VideoMeta:
    data = json.loads(output)
    video = next(s for s in data["streams"] if s["codec_type"] == "video")
    num, den = video["r_frame_rate"].split("/")
    fps = float(num) / float(den)
    return VideoMeta(
        width=int(video["width"]),
        height=int(video["height"]),
        fps=fps,
        duration=float(data["format"]["duration"]),
    )


def probe_video(path: str) -> VideoMeta:
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", "-show_streams", path],
        capture_output=True, text=True, check=True,
    )
    return parse_ffprobe(result.stdout)
