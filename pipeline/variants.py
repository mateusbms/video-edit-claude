"""Variações de hook (spec 2026-08-01): fusão/deslocamento + orquestração.

A variação nasce com trimmed próprio (hook cortado + corpo da matriz) e
artefatos fundidos; depois disso é um projeto normal. delta é SEMPRE a
duração do hook cortado lida do probe — nunca estimada."""
import copy
import logging
import shutil
from pathlib import Path

from pipeline.concat import (
    _display_dims,
    _normalize_clip,
    _probe_stream_info,
    _signature,
    _try_copy_concat,
)
from pipeline.job import init_job, load_json, write_json
from pipeline.probe import probe_video
from pipeline.silence import (
    build_scale_filter,
    compute_kept_segments,
    cut_segments,
    detect_silences,
)
from pipeline.transcribe import transcribe_audio

logger = logging.getLogger(__name__)


def fundir_transcricoes(hook: list, corpo: list, delta: float) -> list:
    """hook ++ corpo com start/end (linhas e palavras) somados de delta."""
    deslocado = []
    for linha in corpo:
        nova = copy.deepcopy(linha)
        nova["start"] = linha["start"] + delta
        nova["end"] = linha["end"] + delta
        for w in nova["words"]:
            w["start"] += delta
            w["end"] += delta
        deslocado.append(nova)
    return list(hook) + deslocado


def deslocar_overlays(overlays: list, delta: float, fps: float) -> list:
    """fromFrame += round(delta*fps); serve para overlays e sugestões."""
    frames = round(delta * fps)
    out = []
    for ov in overlays:
        novo = copy.deepcopy(ov)
        novo["fromFrame"] = ov["fromFrame"] + frames
        out.append(novo)
    return out


def _concat_hook_e_corpo(hook: str, corpo: str, dest: str) -> None:
    """Concatena SEM tocar no corpo: assinaturas iguais → copy direto; senão
    normaliza SÓ o hook para os parâmetros do corpo e tenta de novo. O corpo
    da matriz nunca é re-encodado — é a promessa central da abordagem A."""
    ih, ic = _probe_stream_info(hook), _probe_stream_info(corpo)
    if _signature(ih) == _signature(ic) and _try_copy_concat([hook, corpo], dest):
        return
    logger.warning("hook difere do corpo (%s vs %s): normalizando só o hook",
                   _signature(ih), _signature(ic))
    w, h = _display_dims(ic)
    normalizado = str(Path(dest).with_suffix(".hooknorm.mp4"))
    try:
        _normalize_clip(hook, normalizado, w, h, ic["fps"], ih["has_audio"])
        if not _try_copy_concat([normalizado, corpo], dest):
            raise RuntimeError("concat do hook normalizado com o corpo falhou")
    finally:
        Path(normalizado).unlink(missing_ok=True)


def criar_variacao(matriz_dir: Path, jobs_root: Path, novo_slug: str,
                   hook_path: str, progress_cb=None) -> None:
    """Cria jobs_root/novo_slug a partir da matriz + clipe de hook.

    Qualquer falha remove o diretório da variação (rollback): nenhum projeto
    meio-nascido aparece na lista. A rota valida ANTES (papel, trimmed,
    transcript, colisão) — aqui é só execução."""
    matriz_cfg = load_json(matriz_dir / "job.config.json")
    corpo = matriz_dir / "trimmed.mp4"

    var = init_job(jobs_root, novo_slug)
    try:
        # 1. corta as pausas do hook com os sliders da matriz
        hook_cortado = var.dir / "hook_trimmed.tmp.mp4"
        silencios = detect_silences(hook_path,
                                    matriz_cfg.get("silence_threshold_db", -30.0),
                                    matriz_cfg.get("min_silence", 0.5))
        hook_meta = probe_video(hook_path)
        kept = compute_kept_segments(silencios, hook_meta.duration,
                                     matriz_cfg.get("padding", 0.1),
                                     matriz_cfg.get("min_segment", 0.3))
        scale = build_scale_filter(hook_meta.width, hook_meta.height)
        cut_segments(hook_path, kept, str(hook_cortado),
                     total_duration=sum(s.duration for s in kept),
                     progress_cb=progress_cb, scale=scale)
        delta = probe_video(str(hook_cortado)).duration  # do probe, nunca estimado

        # 2. compõe o trimmed da variação (corpo intocado)
        _concat_hook_e_corpo(str(hook_cortado), str(corpo), str(var.dir / "trimmed.mp4"))
        composto = probe_video(str(var.dir / "trimmed.mp4"))
        write_json(var.dir / "trimmed.probe.json",
                   {"width": composto.width, "height": composto.height,
                    "fps": composto.fps, "duration": composto.duration,
                    "nb_frames": composto.nb_frames})
        # cuts.json sintético: o passo de Cortes remonta player e cortes manuais
        write_json(var.dir / "cuts.json", [{"start": 0, "end": composto.duration}])

        # 3. transcreve SÓ o hook e funde com o corpo deslocado
        hook_words = transcribe_audio(str(hook_cortado),
                                      matriz_cfg.get("whisper_model", "base"),
                                      matriz_cfg.get("language", "pt"),
                                      progress_cb=progress_cb)
        corpo_transcript = load_json(matriz_dir / "transcript.json")
        write_json(var.dir / "transcript.json",
                   fundir_transcricoes(hook_words, corpo_transcript, delta))

        # 4. textos e sugestões deslocados; defaults copiados; hook.json NÃO
        #    é criado — o texto é o que o usuário vai digitar
        fps = composto.fps
        for nome in ("overlays.json", "suggestions.json"):
            origem = matriz_dir / nome
            if origem.exists():
                write_json(var.dir / nome, deslocar_overlays(load_json(origem), delta, fps))
        if (matriz_dir / "suggest-defaults.json").exists():
            shutil.copy(matriz_dir / "suggest-defaults.json", var.dir / "suggest-defaults.json")

        # 5. config herdado da matriz + identidade da variação
        cfg = dict(matriz_cfg)
        sufixo = novo_slug.removeprefix(matriz_dir.name).lstrip("-") or novo_slug
        cfg.update({
            "papel": "normal",
            "origem_matriz": matriz_dir.name,
            "title": f"{matriz_cfg.get('title') or matriz_dir.name} {sufixo}".strip(),
        })
        write_json(var.dir / "job.config.json", cfg)

        hook_cortado.unlink(missing_ok=True)
        Path(hook_path).unlink(missing_ok=True)
    except Exception:
        # rollback: nada meio-nascido na lista
        shutil.rmtree(var.dir, ignore_errors=True)
        raise
