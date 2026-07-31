from pathlib import Path

from pipeline.job import Job, write_json, load_json
from pipeline.probe import probe_video
from pipeline.silence import detect_silences, compute_kept_segments, cut_segments, invert_ranges, build_scale_filter
from pipeline.transcribe import transcribe_audio
from pipeline.recipe import brand_of_kit, build_recipe
from pipeline.concat import concat_videos


# Tudo que descreve o conteúdo do source: um vídeo novo invalida todos.
# job.config.json e suggest-defaults.json ficam de fora de propósito — são
# preferências (sliders, estilo de legenda, marca), não conteúdo do vídeo.
DERIVADOS_DO_SOURCE = (
    "cuts.json", "trimmed.mp4", "trimmed.probe.json",
    "transcript.json", "hook.json", "overlays.json", "suggestions.json",
    "edit-recipe.json", "render.log",
)

# Tudo que foi derivado do trimmed.mp4: reescrevê-lo deixa esses arquivos
# apontando para a timeline antiga — legendas fora de sincronia no render.
# hook.json fica de fora de propósito: o texto do hook não é sincronizado
# com a timeline.
DERIVADOS_DO_TRIMMED = (
    "transcript.json", "edit-recipe.json", "overlays.json", "suggestions.json",
)


def stage_ingest(job: Job, src_paths: list[str]) -> None:
    dest = job.dir / "source.mp4"
    concat_videos([str(p) for p in src_paths], str(dest))
    meta = probe_video(str(dest))
    write_json(job.dir / "probe.json",
               {"width": meta.width, "height": meta.height, "fps": meta.fps,
                "duration": meta.duration, "nb_frames": meta.nb_frames})
    # Reenviar para um slug que já existe troca o vídeo, mas deixava o corte, a
    # transcrição e os textos do vídeo anterior em disco. O passo de Cortes relê
    # o servidor ao abrir e restaurava esse corte órfão — o usuário subia um
    # vídeo novo e via o antigo. Mesmo tratamento que stage_refine dá quando o
    # trimmed muda, estendido aos artefatos do corte.
    for stale in DERIVADOS_DO_SOURCE:
        (job.dir / stale).unlink(missing_ok=True)


def stage_cut(job: Job, progress_cb=None) -> None:
    src = job.dir / "source.mp4"
    meta = load_json(job.dir / "probe.json")
    silences = detect_silences(str(src), job.config.silence_threshold_db, job.config.min_silence)
    kept = compute_kept_segments(silences, meta["duration"], job.config.padding, job.config.min_segment)
    write_json(job.dir / "cuts.json", [{"start": s.start, "end": s.end} for s in kept])
    total = sum(s.duration for s in kept)
    scale = build_scale_filter(meta["width"], meta["height"])
    cut_segments(str(src), kept, str(job.dir / "trimmed.mp4"),
                 total_duration=total, progress_cb=progress_cb, scale=scale)
    tmeta = probe_video(str(job.dir / "trimmed.mp4"))
    write_json(job.dir / "trimmed.probe.json",
               {"width": tmeta.width, "height": tmeta.height, "fps": tmeta.fps,
                "duration": tmeta.duration, "nb_frames": tmeta.nb_frames})
    # o trimmed mudou: mesma invalidação do stage_refine — sem ela, re-detectar
    # pausas num projeto transcrito deixava as legendas da timeline antiga
    # entrarem no render, fora de sincronia e sem aviso.
    for stale in DERIVADOS_DO_TRIMMED:
        (job.dir / stale).unlink(missing_ok=True)


def stage_refine(job: Job, remove_ranges: list, progress_cb=None) -> float:
    trimmed = job.dir / "trimmed.mp4"
    tp = load_json(job.dir / "trimmed.probe.json")
    dur = tp["duration"]
    keep = invert_ranges(remove_ranges, dur)
    if not keep:
        raise ValueError("nada sobraria após os cortes manuais")
    tmp = job.dir / "trimmed.refined.mp4"
    total = sum(s.duration for s in keep)
    scale = build_scale_filter(tp["width"], tp["height"])
    cut_segments(str(trimmed), keep, str(tmp), total_duration=total, progress_cb=progress_cb, scale=scale)
    tmp.replace(trimmed)
    tmeta = probe_video(str(trimmed))
    write_json(job.dir / "trimmed.probe.json",
               {"width": tmeta.width, "height": tmeta.height, "fps": tmeta.fps,
                "duration": tmeta.duration, "nb_frames": tmeta.nb_frames})
    # o trimmed mudou: invalida artefatos derivados para não renderizar legendas
    # dessincronizadas se o usuário refinar depois de transcrever.
    for stale in DERIVADOS_DO_TRIMMED:
        (job.dir / stale).unlink(missing_ok=True)
    return tmeta.duration


def stage_transcribe(job: Job, progress_cb=None) -> None:
    trimmed = job.dir / "trimmed.mp4"
    words = transcribe_audio(str(trimmed), job.config.whisper_model,
                             job.config.language, progress_cb=progress_cb)
    write_json(job.dir / "transcript.json", words)


def stage_recipe(job: Job) -> None:
    meta = load_json(job.dir / "probe.json")
    transcript = load_json(job.dir / "transcript.json")
    hook = load_json(job.dir / "hook.json")
    # achatar palavras de todas as linhas
    words = []
    for line in transcript:
        words.extend(line["words"])
    trimmed_probe_path = job.dir / "trimmed.probe.json"
    trimmed_frames_actual = None
    if trimmed_probe_path.exists():
        tp = load_json(trimmed_probe_path)
        trimmed_duration = tp["duration"]
        trimmed_frames_actual = tp.get("nb_frames")
    else:
        trimmed_duration = words[-1]["end"] if words else 0.0
    brand = brand_of_kit(job.config.brand_kit_slug)
    manual_overlays = None
    overlays_path = job.dir / "overlays.json"
    if overlays_path.exists():
        manual_overlays = load_json(overlays_path)
    recipe = build_recipe(
        width=meta["width"], height=meta["height"], fps=meta["fps"],
        trimmed_duration=trimmed_duration, words=words,
        hook=hook,
        orientation=job.config.orientation,
        max_chars=job.config.max_caption_chars, max_gap=job.config.max_caption_gap,
        trimmed_frames_actual=trimmed_frames_actual,
        caption_style={
            "fontSize": job.config.caption_font_size,
            "bottom": job.config.caption_bottom,
            "color": job.config.caption_color,
            "highlightColor": job.config.caption_highlight,
            "fontFamily": job.config.caption_font,
        },
        brand=brand,
        overlays=manual_overlays,
    )
    write_json(job.dir / "edit-recipe.json", recipe)
