import os
import shutil
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from api.jobs import (
    allowed_file_path, get_state, suggest_hook,
    update_config, update_hook_card_frames,
)
from api.models import CutParams, CutResult, CutSegmentOut, Hook
from pipeline.job import init_job, load_json, write_json
from pipeline.stages import stage_cut, stage_ingest, stage_recipe

router = APIRouter(prefix="/api")


def _roots() -> tuple[Path, Path, Path]:
    return (
        Path(os.environ.get("JOBS_ROOT", "jobs")),
        Path(os.environ.get("INPUT_ROOT", "input")),
        Path(os.environ.get("OUTPUT_ROOT", "output")),
    )


@router.post("/jobs")
async def create_job(file: UploadFile = File(...), slug: str = Form(default="job")):
    jobs_root, input_root, _ = _roots()
    input_root.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "").suffix or ".mp4"
    upload_path = input_root / f"{slug}{suffix}"
    with upload_path.open("wb") as out:
        shutil.copyfileobj(file.file, out)
    job = init_job(jobs_root, slug)
    try:
        stage_ingest(job, str(upload_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ingest falhou: {e}")
    state = get_state(slug, jobs_root)
    return {"slug": slug, "probe": state.probe.model_dump() if state.probe else None}


@router.get("/jobs/{slug}")
def read_job(slug: str):
    jobs_root, _, output_root = _roots()
    state = get_state(slug, jobs_root)
    state.has_render_16x9 = (output_root / f"{slug}-16x9.mp4").exists()
    state.has_render_9x16 = (output_root / f"{slug}-9x16.mp4").exists()
    return state.model_dump()


@router.post("/jobs/{slug}/cut")
def run_cut(slug: str, params: CutParams):
    jobs_root, *_ = _roots()
    update_config(slug, jobs_root, params)
    job = init_job(jobs_root, slug)
    try:
        stage_cut(job)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"cut falhou: {e}")
    cuts = load_json(job.dir / "cuts.json")
    probe = load_json(job.dir / "probe.json")
    tprobe = load_json(job.dir / "trimmed.probe.json")
    return CutResult(
        original_duration=probe["duration"],
        trimmed_duration=tprobe["duration"],
        segments=[CutSegmentOut(**c) for c in cuts],
    ).model_dump()


@router.get("/jobs/{slug}/transcript")
def get_transcript(slug: str):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "transcript.json"
    if not p.exists():
        raise HTTPException(status_code=404, detail="transcript inexistente")
    return load_json(p)


@router.put("/jobs/{slug}/transcript")
def put_transcript(slug: str, lines: list[dict]):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "transcript.json"
    write_json(p, lines)
    return {"ok": True}


@router.get("/jobs/{slug}/hook")
def get_hook(slug: str):
    jobs_root, *_ = _roots()
    job_dir = Path(jobs_root) / slug
    p = job_dir / "hook.json"
    if p.exists():
        d = load_json(p)
        return Hook(
            title=d["title"],
            subtitle=d.get("subtitle", ""),
            duration_frames=d.get("duration_frames", 90),
        ).model_dump()
    tpath = job_dir / "transcript.json"
    if tpath.exists():
        return suggest_hook(load_json(tpath)).model_dump()
    return Hook(title="", subtitle="").model_dump()


@router.put("/jobs/{slug}/hook")
def put_hook(slug: str, hook: Hook):
    jobs_root, *_ = _roots()
    write_json(
        Path(jobs_root) / slug / "hook.json",
        {
            "title": hook.title,
            "subtitle": hook.subtitle,
            "duration_frames": hook.duration_frames,
        },
    )
    update_hook_card_frames(slug, jobs_root, hook.duration_frames)
    return {"ok": True}


@router.post("/jobs/{slug}/recipe")
def run_recipe(slug: str):
    jobs_root, *_ = _roots()
    job = init_job(jobs_root, slug)
    try:
        stage_recipe(job)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"recipe falhou: {e}")
    return {"ok": True}


@router.get("/jobs/{slug}/files/{name}")
def get_file(slug: str, name: str):
    jobs_root, _, output_root = _roots()
    job_dir = Path(jobs_root) / slug
    p = allowed_file_path(job_dir, name)
    if p and p.exists():
        return FileResponse(p, media_type="video/mp4", filename=name)
    if name in {f"{slug}-16x9.mp4", f"{slug}-9x16.mp4"}:
        op = output_root / name
        if op.exists():
            return FileResponse(op, media_type="video/mp4", filename=name)
    raise HTTPException(status_code=404, detail="arquivo não disponível")
