import shutil
from pathlib import Path

from pipeline.job import Job, write_json, load_json
from pipeline.probe import probe_video
from pipeline.silence import detect_silences, compute_kept_segments, cut_segments
from pipeline.transcribe import transcribe_audio
from pipeline.recipe import build_recipe


def stage_ingest(job: Job, src_path: str) -> None:
    dest = job.dir / "source.mp4"
    shutil.copy(src_path, dest)
    meta = probe_video(str(dest))
    write_json(job.dir / "probe.json",
               {"width": meta.width, "height": meta.height, "fps": meta.fps,
                "duration": meta.duration, "nb_frames": meta.nb_frames})


def stage_cut(job: Job) -> None:
    src = job.dir / "source.mp4"
    meta = load_json(job.dir / "probe.json")
    silences = detect_silences(str(src), job.config.silence_threshold_db, job.config.min_silence)
    kept = compute_kept_segments(silences, meta["duration"], job.config.padding, job.config.min_segment)
    write_json(job.dir / "cuts.json", [{"start": s.start, "end": s.end} for s in kept])
    cut_segments(str(src), kept, str(job.dir / "trimmed.mp4"))
    tmeta = probe_video(str(job.dir / "trimmed.mp4"))
    write_json(job.dir / "trimmed.probe.json",
               {"width": tmeta.width, "height": tmeta.height, "fps": tmeta.fps,
                "duration": tmeta.duration, "nb_frames": tmeta.nb_frames})


def stage_transcribe(job: Job) -> None:
    trimmed = job.dir / "trimmed.mp4"
    words = transcribe_audio(str(trimmed), job.config.whisper_model, job.config.language)
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
    recipe = build_recipe(
        width=meta["width"], height=meta["height"], fps=meta["fps"],
        trimmed_duration=trimmed_duration, words=words,
        hook=hook, hook_card_frames=job.config.hook_card_frames,
        max_chars=job.config.max_caption_chars, max_gap=job.config.max_caption_gap,
        trimmed_frames_actual=trimmed_frames_actual,
    )
    write_json(job.dir / "edit-recipe.json", recipe)
