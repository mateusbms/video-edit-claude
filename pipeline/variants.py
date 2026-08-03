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
from pipeline.stages import DERIVADOS_DO_TRIMMED
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


def _compor_variacao(var_dir: Path, matriz_dir: Path, hook_source: str,
                     cfg: dict, progress_cb=None) -> int:
    """Núcleo compartilhado por criar_variacao e recompor_hook.

    Corta o hook bruto (hook_source) com os sliders de `cfg`, compõe com o corpo
    INTOCADO da matriz, transcreve só o hook e funde/desloca os artefatos a
    partir da BASE da matriz (transcript/overlays/suggestions da matriz, nunca
    dos já deslocados da variação — evita drift em re-cortes sucessivos).

    Escreve em var_dir: trimmed.mp4, trimmed.probe.json, probe.json, cuts.json,
    transcript.json e (se a matriz tiver) overlays.json/suggestions.json/
    suggest-defaults.json. NÃO mexe em job.config.json nem preserva hook_source
    — isso é responsabilidade de cada caller.

    Devolve hook_linhas: quantas linhas iniciais de transcript.json são do hook.
    """
    corpo = matriz_dir / "trimmed.mp4"
    hook_cortado = var_dir / "hook_trimmed.tmp.mp4"
    try:
        # 1. corta as pausas do hook com os sliders de cfg
        silencios = detect_silences(hook_source,
                                    cfg.get("silence_threshold_db", -30.0),
                                    cfg.get("min_silence", 0.5))
        hook_meta = probe_video(hook_source)
        kept = compute_kept_segments(silencios, hook_meta.duration,
                                     cfg.get("padding", 0.1),
                                     cfg.get("min_segment", 0.3))
        scale = build_scale_filter(hook_meta.width, hook_meta.height)
        cut_segments(hook_source, kept, str(hook_cortado),
                     total_duration=sum(s.duration for s in kept),
                     progress_cb=progress_cb, scale=scale)
        delta = probe_video(str(hook_cortado)).duration  # do probe, nunca estimado

        # 2. compõe o trimmed da variação (corpo intocado)
        _concat_hook_e_corpo(str(hook_cortado), str(corpo), str(var_dir / "trimmed.mp4"))
        composto = probe_video(str(var_dir / "trimmed.mp4"))
        probe_dict = {"width": composto.width, "height": composto.height,
                      "fps": composto.fps, "duration": composto.duration,
                      "nb_frames": composto.nb_frames}
        write_json(var_dir / "trimmed.probe.json", probe_dict)
        # probe.json = probe do composto: cut_result exige probe.json para o
        # passo Cortes remontar o preview e os cortes manuais sobre o composto,
        # e o passo Textos lê fps/duração daqui. A variação não tem source.mp4.
        write_json(var_dir / "probe.json", probe_dict)
        # cuts.json sintético: o passo de Cortes remonta player e cortes manuais
        write_json(var_dir / "cuts.json", [{"start": 0, "end": composto.duration}])

        # 3. transcreve SÓ o hook e funde com o corpo deslocado
        hook_words = transcribe_audio(str(hook_cortado),
                                      cfg.get("whisper_model", "base"),
                                      cfg.get("language", "pt"),
                                      progress_cb=progress_cb)
        corpo_transcript = load_json(matriz_dir / "transcript.json")
        write_json(var_dir / "transcript.json",
                   fundir_transcricoes(hook_words, corpo_transcript, delta))

        # 4. textos e sugestões deslocados A PARTIR DA BASE DA MATRIZ; defaults
        #    copiados; hook.json NÃO é criado — o texto é o que o usuário digita
        fps = composto.fps
        for nome in ("overlays.json", "suggestions.json"):
            origem = matriz_dir / nome
            if origem.exists():
                write_json(var_dir / nome, deslocar_overlays(load_json(origem), delta, fps))
        if (matriz_dir / "suggest-defaults.json").exists():
            shutil.copy(matriz_dir / "suggest-defaults.json", var_dir / "suggest-defaults.json")

        return len(hook_words)
    finally:
        hook_cortado.unlink(missing_ok=True)


def criar_variacao(matriz_dir: Path, jobs_root: Path, novo_slug: str,
                   hook_path: str, progress_cb=None) -> None:
    """Cria jobs_root/novo_slug a partir da matriz + clipe de hook.

    Qualquer falha remove o diretório da variação (rollback): nenhum projeto
    meio-nascido aparece na lista. A rota valida ANTES (papel, trimmed,
    transcript, colisão) — aqui é só execução."""
    matriz_cfg = load_json(matriz_dir / "job.config.json")

    var = init_job(jobs_root, novo_slug)
    try:
        # preserva o clipe bruto do hook para re-corte futuro (edição escopada):
        # renomear em vez de copiar não gasta disco a mais além do arquivo em si
        hook_source = var.dir / "hook_source.mp4"
        Path(hook_path).replace(hook_source)

        hook_linhas = _compor_variacao(var.dir, matriz_dir, str(hook_source),
                                       matriz_cfg, progress_cb=progress_cb)

        # config herdado da matriz + identidade da variação + fronteira do hook
        cfg = dict(matriz_cfg)
        sufixo = novo_slug.removeprefix(matriz_dir.name).lstrip("-") or novo_slug
        cfg.update({
            "papel": "normal",
            "origem_matriz": matriz_dir.name,
            "title": f"{matriz_cfg.get('title') or matriz_dir.name} {sufixo}".strip(),
            "hook_linhas": hook_linhas,
        })
        write_json(var.dir / "job.config.json", cfg)
    except Exception:
        # rollback: nada meio-nascido na lista
        shutil.rmtree(var.dir, ignore_errors=True)
        raise


def recompor_hook(var_dir: Path, matriz_dir: Path, progress_cb=None) -> int:
    """Re-corta o hook de uma variação existente a partir do hook_source.mp4
    guardado e do corpo ATUAL da matriz, e recompõe. Reusa _compor_variacao
    (mesma base da matriz, sem drift). Invalida os derivados do trimmed (a
    transcrição/textos editados da variação + a recipe) — o texto do hook
    (hook.json) sobrevive de propósito, como no stage_cut. Grava o novo
    hook_linhas no config e o devolve. O caller (rota) já validou aptidão e
    persistiu os novos sliders no config."""
    cfg = load_json(var_dir / "job.config.json")
    hook_source = var_dir / "hook_source.mp4"
    # invalida os derivados do trimmed; _compor re-escreve os de conteúdo a
    # partir da base da matriz, sobrando só edit-recipe.json apagado
    for stale in DERIVADOS_DO_TRIMMED:
        (var_dir / stale).unlink(missing_ok=True)
    hook_linhas = _compor_variacao(var_dir, matriz_dir, str(hook_source),
                                   cfg, progress_cb=progress_cb)
    cfg["hook_linhas"] = hook_linhas
    write_json(var_dir / "job.config.json", cfg)
    return hook_linhas
