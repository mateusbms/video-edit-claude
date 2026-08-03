import functools
import re
import subprocess
import sys
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


def fronteira_local(silences, center, w0, w1, default_raio: float = 0.15) -> dict:
    """Fronteira de corte em torno de `center`, dado os silêncios (absolutos,
    ordenados) detectados na janela [w0, w1].

    Corta no MEIO da micro-pausa imediatamente à esquerda e imediatamente à
    direita do instante apontado — o ponto mais silencioso de cada lado. Se o
    clique cai dentro de uma pausa, os "à esquerda/à direita" já são as pausas
    vizinhas (a que contém o clique não é totalmente de um lado só), então o
    mesmo cálculo expande para elas. Sem pausa de um lado (fala contínua), a
    borda vira `center ± default_raio` (clampada à janela) e `limpo_*` fica
    False para o front oferecer o nudge frame-a-frame.
    """
    esquerda = [s for s in silences if s[1] < center]
    direita = [s for s in silences if s[0] > center]
    s_esq = esquerda[-1] if esquerda else None
    s_dir = direita[0] if direita else None
    start = (s_esq[0] + s_esq[1]) / 2 if s_esq else max(w0, center - default_raio)
    end = (s_dir[0] + s_dir[1]) / 2 if s_dir else min(w1, center + default_raio)
    return {
        "start": round(start, 3),
        "end": round(end, 3),
        "limpo_inicio": s_esq is not None,
        "limpo_fim": s_dir is not None,
    }


def invert_ranges(remove: list[Segment], duration: float) -> list[Segment]:
    """Trechos a MANTER = complemento de `remove` sobre [0, duration]."""
    clamped = [
        Segment(max(0.0, min(duration, r.start)), max(0.0, min(duration, r.end)))
        for r in remove
    ]
    rs = sorted((s for s in clamped if s.end > s.start), key=lambda s: s.start)
    keep: list[Segment] = []
    cursor = 0.0
    for r in rs:
        if r.start > cursor:
            keep.append(Segment(cursor, r.start))
        cursor = max(cursor, r.end)
    if cursor < duration:
        keep.append(Segment(cursor, duration))
    return keep


def build_select_expr(segments: list[Segment]) -> str:
    return "+".join(f"between(t,{s.start:.3f},{s.end:.3f})" for s in segments)


def build_scale_filter(width: int, height: int, max_long_edge: int = 1920) -> str | None:
    """Filtro ffmpeg 'scale=W:H' pra caber o lado maior em max_long_edge (só reduz).

    Preserva aspecto/orientação e garante dimensões pares (exigência do H.264).
    Retorna None quando não precisa reduzir (não amplia vídeos menores).
    """
    long_edge = max(width, height)
    if long_edge <= max_long_edge:
        return None
    factor = max_long_edge / long_edge
    w = int(round(width * factor))
    h = int(round(height * factor))
    w -= w % 2
    h -= h % 2
    return f"scale={w}:{h}"


def detect_silences(path: str, noise_db: float = -30.0, min_silence: float = 0.5) -> list[tuple[float, float]]:
    result = subprocess.run(
        ["ffmpeg", "-i", path, "-vn", "-af",
         f"silencedetect=noise={noise_db}dB:d={min_silence}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    # silencedetect escreve no stderr
    return parse_silences(result.stderr)


def detect_silences_janela(path: str, center: float, raio: float = 1.0,
                           noise_db: float = -30.0, min_silence: float = 0.08):
    """silencedetect só na janela [center-raio, center+raio] de `path`.

    Usa -ss/-t ANTES de -i: o ffmpeg reseta o PTS da fatia, então os
    silence_start/end vêm relativos ao início da janela — somamos `inicio` para
    voltar ao tempo absoluto do trimmed. min_silence pequeno de propósito: pega
    micro-pausas que o corte global (min_silence dos sliders) ignora."""
    inicio = max(0.0, center - raio)
    dur = 2 * raio
    result = subprocess.run(
        ["ffmpeg", "-ss", f"{inicio:.3f}", "-t", f"{dur:.3f}", "-i", path,
         "-vn", "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    return [(s + inicio, e + inicio) for s, e in parse_silences(result.stderr)]


def parse_ffmpeg_progress(line: str) -> float | None:
    """Segundos processados a partir de uma linha `out_time_us=` do -progress do ffmpeg."""
    line = line.strip()
    if line.startswith("out_time_us="):
        try:
            return int(line.split("=", 1)[1]) / 1_000_000
        except ValueError:
            return None
    return None


@functools.lru_cache(maxsize=1)
def _vt_available() -> bool:
    """True em macOS com o encoder h264_videotoolbox disponível no ffmpeg."""
    if sys.platform != "darwin":
        return False
    try:
        out = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"],
                             capture_output=True, text=True)
        return "h264_videotoolbox" in out.stdout
    except Exception:
        return False


def _decode_args() -> list[str]:
    return ["-hwaccel", "videotoolbox"] if _vt_available() else []


def _video_encoder_args(bitrate: str = "10M") -> list[str]:
    if _vt_available():
        return ["-c:v", "h264_videotoolbox", "-b:v", bitrate]
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20"]


def cut_segments(src, segments, out_path, total_duration=None, progress_cb=None, scale=None) -> None:
    if not segments:
        raise ValueError("nenhum segmento para cortar")
    between = build_select_expr(segments)
    vf = f"select='{between}',setpts=N/FRAME_RATE/TB"
    if scale:
        vf += f",{scale}"
    af = f"aselect='{between}',asetpts=N/SR/TB"
    cmd = ["ffmpeg", "-y", *_decode_args(), "-i", src,
           "-vf", vf, "-af", af, *_video_encoder_args(), "-c:a", "aac",
           "-progress", "pipe:1", "-nostats", out_path]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    for line in proc.stdout:
        t = parse_ffmpeg_progress(line)
        if t is not None and progress_cb and total_duration:
            progress_cb(min(t, total_duration), total_duration)
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg cut falhou (rc={proc.returncode})")
