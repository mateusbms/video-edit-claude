import re
import subprocess
from dataclasses import dataclass


@dataclass
class Segment:
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


def parse_silences(stderr: str) -> list[tuple[float, float]]:
    starts = [float(x) for x in re.findall(r"silence_start:\s*([0-9.]+)", stderr)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([0-9.]+)", stderr)]
    return list(zip(starts, ends))


def compute_kept_segments(
    silences: list[tuple[float, float]],
    duration: float,
    padding: float = 0.1,
    min_segment: float = 0.3,
) -> list[Segment]:
    # inverter silêncios -> segmentos de fala
    speech: list[Segment] = []
    cursor = 0.0
    for s_start, s_end in silences:
        if s_start > cursor:
            speech.append(Segment(cursor, s_start))
        cursor = max(cursor, s_end)
    if cursor < duration:
        speech.append(Segment(cursor, duration))

    # aplicar padding com clamp
    padded = [
        Segment(max(0.0, s.start - padding), min(duration, s.end + padding))
        for s in speech
    ]

    # merge de sobreposições
    merged: list[Segment] = []
    for s in padded:
        if merged and s.start <= merged[-1].end:
            merged[-1] = Segment(merged[-1].start, max(merged[-1].end, s.end))
        else:
            merged.append(s)

    # descartar segmentos curtos
    return [s for s in merged if s.duration >= min_segment]


def build_select_expr(segments: list[Segment]) -> str:
    return "+".join(f"between(t,{s.start:.3f},{s.end:.3f})" for s in segments)


def detect_silences(path: str, noise_db: float = -30.0, min_silence: float = 0.5) -> list[tuple[float, float]]:
    result = subprocess.run(
        ["ffmpeg", "-i", path, "-af",
         f"silencedetect=noise={noise_db}dB:d={min_silence}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    # silencedetect escreve no stderr
    return parse_silences(result.stderr)


def cut_segments(src: str, segments: list[Segment], out_path: str) -> None:
    if not segments:
        raise ValueError("nenhum segmento para cortar")
    between = build_select_expr(segments)
    vf = f"select='{between}',setpts=N/FRAME_RATE/TB"
    af = f"aselect='{between}',asetpts=N/SR/STB"
    subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-vf", vf, "-af", af, out_path],
        check=True,
    )
