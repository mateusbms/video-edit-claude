import json
import shutil
import subprocess
from pathlib import Path


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    """Roda um comando ffmpeg/ffprobe; em falha, levanta RuntimeError com o
    final do stderr (senão o erro chega como 'exit status 1' sem motivo)."""
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        tail = "\n".join((proc.stderr or "").strip().splitlines()[-8:])
        raise RuntimeError(f"{cmd[0]} falhou: {tail}")
    return proc


def _rotation(vstream: dict) -> int:
    tags = vstream.get("tags", {})
    if "rotate" in tags:
        try:
            return int(tags["rotate"]) % 360
        except (TypeError, ValueError):
            pass
    for sd in vstream.get("side_data_list", []):
        if "rotation" in sd:
            try:
                return int(sd["rotation"]) % 360
            except (TypeError, ValueError):
                pass
    return 0


def _probe_stream_info(path: str) -> dict:
    """Parâmetros de vídeo + presença/codec de áudio de um arquivo."""
    result = _run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path]
    )
    data = json.loads(result.stdout)
    vstreams = [s for s in data.get("streams", []) if s.get("codec_type") == "video"]
    if not vstreams:
        raise ValueError(f"arquivo sem stream de vídeo: {path}")
    v = vstreams[0]
    astreams = [s for s in data.get("streams", []) if s.get("codec_type") == "audio"]
    num, den = v["r_frame_rate"].split("/")
    fps = round(float(num) / float(den), 3)
    return {
        "width": int(v["width"]),
        "height": int(v["height"]),
        "fps": fps,
        "vcodec": v.get("codec_name"),
        "pix_fmt": v.get("pix_fmt"),
        "sar": v.get("sample_aspect_ratio", "1:1"),
        "rotation": _rotation(v),
        "has_audio": bool(astreams),
        "acodec": astreams[0].get("codec_name") if astreams else None,
    }


def _signature(info: dict) -> tuple:
    """Assinatura estrita: qualquer diferença força o re-encode (evita o copy
    rápido produzir junções com glitch ou áudio dessincronizado)."""
    return (
        info["width"], info["height"], info["fps"], info["vcodec"],
        info["pix_fmt"], info["sar"], info["rotation"],
        info["has_audio"], info["acodec"],
    )


def _display_dims(info: dict) -> tuple:
    """Dimensões como exibidas — troca W/H quando há rotação de 90°/270°
    (ffmpeg auto-rotaciona os frames antes dos filtros)."""
    if info["rotation"] in (90, 270):
        return info["height"], info["width"]
    return info["width"], info["height"]


def _quote(path: str) -> str:
    """Escapa aspas simples para o formato do concat demuxer."""
    return str(Path(path).resolve()).replace("'", "'\\''")


def _try_copy_concat(paths: list[str], dest: str) -> bool:
    """Concatena sem recodificar (instantâneo). Retorna False se o ffmpeg
    recusar, para o chamador cair no re-encode."""
    listfile = Path(dest).with_suffix(".concat.txt")
    listfile.write_text(
        "".join(f"file '{_quote(p)}'\n" for p in paths), encoding="utf-8"
    )
    try:
        proc = subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listfile),
             "-c", "copy", dest],
            capture_output=True, text=True,
        )
        return proc.returncode == 0
    finally:
        listfile.unlink(missing_ok=True)


def _normalize_clip(src: str, dst: str, width: int, height: int,
                    fps: float, has_audio: bool) -> None:
    """Re-encoda um clipe para (width x height, fps, H.264/AAC), preenchendo
    com barras para preservar o aspecto e sintetizando silêncio se não houver
    áudio — deixando todos os clipes com parâmetros idênticos."""
    cmd = ["ffmpeg", "-y", "-i", src]
    if not has_audio:
        cmd += ["-f", "lavfi", "-i",
                "anullsrc=channel_layout=stereo:sample_rate=48000", "-shortest"]
    vf = (f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
          f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1")
    cmd += ["-vf", vf, "-r", str(fps),
            "-c:v", "libx264", "-c:a", "aac", "-ar", "48000",
            "-map", "0:v:0", "-map", ("1:a:0" if not has_audio else "0:a:0"),
            dst]
    _run(cmd)


def _reencode_concat(paths: list[str], infos: list[dict], dest: str) -> None:
    """Normaliza cada clipe para os parâmetros de exibição do primeiro e então
    concatena por cópia. Robusto a resolução/fps/codec/rotação/áudio distintos."""
    width, height = _display_dims(infos[0])
    fps = infos[0]["fps"]
    tmpdir = Path(dest).parent / f".{Path(dest).stem}.parts"
    tmpdir.mkdir(parents=True, exist_ok=True)
    try:
        normalized: list[str] = []
        for i, (p, info) in enumerate(zip(paths, infos)):
            out = tmpdir / f"part{i}.mp4"
            _normalize_clip(p, str(out), width, height, fps, info["has_audio"])
            normalized.append(str(out))
        if not _try_copy_concat(normalized, dest):
            raise RuntimeError("concat dos clipes normalizados falhou")
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def concat_videos(paths: list[str], dest: str) -> None:
    """Concatena `paths` em `dest`.
    - 1 arquivo → cópia.
    - N com parâmetros idênticos → concat -c copy (instantâneo).
    - N divergentes (ou copy falha) → normaliza cada um e concatena.

    Limitação conhecida: clipes com orientações (rotação) diferentes entre si
    são normalizados para a orientação do primeiro clipe."""
    if not paths:
        raise ValueError("nenhum arquivo para concatenar")
    if len(paths) == 1:
        shutil.copy(paths[0], dest)
        return
    infos = [_probe_stream_info(p) for p in paths]
    uniform = all(_signature(info) == _signature(infos[0]) for info in infos)
    if uniform and _try_copy_concat(paths, dest):
        return
    _reencode_concat(paths, infos, dest)
