import asyncio
import os
import shutil
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from api import render as render_mod
from api.jobs import (
    allowed_file_path, get_state, suggest_hook,
    update_brand_kit, update_caption_style, update_config,
    update_hook_card_frames, update_whisper_model,
)
from api.models import (
    CaptionStyleParams, CutParams, CutResult, CutSegmentOut,
    Hook, OverlayParams, RefineParams, RenderParams,
    SuggestDefaults, Suggestion, TranscribeParams,
)
from api.progress import run_with_progress
from api.sse import sse_event
from pipeline.job import init_job, load_json, write_json
from pipeline.silence import Segment
from pipeline.stages import stage_cut, stage_ingest, stage_recipe, stage_refine, stage_transcribe

router = APIRouter(prefix="/api")


def _roots() -> tuple[Path, Path, Path]:
    return (
        Path(os.environ.get("JOBS_ROOT", "jobs")),
        Path(os.environ.get("INPUT_ROOT", "input")),
        Path(os.environ.get("OUTPUT_ROOT", "output")),
    )


@router.post("/jobs")
async def create_job(
    files: list[UploadFile] = File(...), slug: str = Form(default="job")
):
    jobs_root, input_root, _ = _roots()
    input_root.mkdir(parents=True, exist_ok=True)
    if not files:
        raise HTTPException(status_code=400, detail="envie ao menos um arquivo")
    paths: list[str] = []
    for i, f in enumerate(files):
        suffix = Path(f.filename or "").suffix or ".mp4"
        upload_path = input_root / f"{slug}-part{i}{suffix}"
        with upload_path.open("wb") as out:
            shutil.copyfileobj(f.file, out)
        paths.append(str(upload_path))
    job = init_job(jobs_root, slug)
    try:
        stage_ingest(job, paths)
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

    def work(progress_cb):
        stage_cut(job, progress_cb=progress_cb)
        cuts = load_json(job.dir / "cuts.json")
        probe = load_json(job.dir / "probe.json")
        tprobe = load_json(job.dir / "trimmed.probe.json")
        return CutResult(
            original_duration=probe["duration"],
            trimmed_duration=tprobe["duration"],
            segments=[CutSegmentOut(**c) for c in cuts],
        ).model_dump()

    return StreamingResponse(run_with_progress(work), media_type="text/event-stream")


@router.post("/jobs/{slug}/refine")
def run_refine(slug: str, params: RefineParams):
    jobs_root, *_ = _roots()
    job = init_job(jobs_root, slug)
    remove = [Segment(r.start, r.end) for r in params.remove]
    if not remove:
        raise HTTPException(status_code=400, detail="nenhum trecho para remover")

    def work(progress_cb):
        new_dur = stage_refine(job, remove, progress_cb=progress_cb)
        return {"trimmed_duration": new_dur}

    return StreamingResponse(run_with_progress(work), media_type="text/event-stream")


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


@router.get("/jobs/{slug}/overlays")
def get_overlays(slug: str):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "overlays.json"
    if not p.exists():
        return []
    return load_json(p)


@router.put("/jobs/{slug}/overlays")
def put_overlays(slug: str, overlays: list[OverlayParams]):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "overlays.json"
    write_json(p, [o.model_dump() for o in overlays])
    return {"ok": True}


@router.get("/jobs/{slug}/suggestions")
def get_suggestions(slug: str):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "suggestions.json"
    if not p.exists():
        return []
    return load_json(p)


@router.put("/jobs/{slug}/suggestions")
def put_suggestions(slug: str, suggestions: list[Suggestion]):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "suggestions.json"
    write_json(p, [s.model_dump() for s in suggestions])
    return {"ok": True}


@router.get("/jobs/{slug}/suggest-defaults")
def get_suggest_defaults(slug: str):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "suggest-defaults.json"
    if not p.exists():
        return SuggestDefaults().model_dump()
    return load_json(p)


@router.put("/jobs/{slug}/suggest-defaults")
def put_suggest_defaults(slug: str, defaults: SuggestDefaults):
    jobs_root, *_ = _roots()
    p = Path(jobs_root) / slug / "suggest-defaults.json"
    write_json(p, defaults.model_dump())
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
            x=d.get("x", 0.5), y=d.get("y", 0.16),
            fontSize=d.get("fontSize", 84), fontFamily=d.get("fontFamily", ""),
            color=d.get("color", ""), anchor=d.get("anchor", "center"),
        ).model_dump()
    tpath = job_dir / "transcript.json"
    if tpath.exists():
        return suggest_hook(load_json(tpath)).model_dump()
    return Hook(title="", subtitle="").model_dump()


@router.put("/jobs/{slug}/hook")
def put_hook(slug: str, hook: Hook):
    jobs_root, *_ = _roots()
    write_json(Path(jobs_root) / slug / "hook.json", hook.model_dump())
    update_hook_card_frames(slug, jobs_root, hook.duration_frames)
    return {"ok": True}


@router.put("/jobs/{slug}/caption-style")
def put_caption_style(slug: str, style: CaptionStyleParams):
    jobs_root, *_ = _roots()
    update_caption_style(slug, jobs_root, style)
    return {"ok": True}


@router.put("/jobs/{slug}/brand-kit")
def put_brand_kit(slug: str, body: dict):
    jobs_root, *_ = _roots()
    update_brand_kit(slug, jobs_root, body.get("slug", ""))
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


# ---------- SSE ----------


def _build_remotion_env() -> dict:
    """PATH com bin/ (ffmpeg) + .tools/node*/bin (node)."""
    env = os.environ.copy()
    extras = [str(Path("bin").resolve())]
    node_bin = next(Path(".tools").glob("node-*/bin"), None)
    if node_bin:
        extras.append(str(node_bin.resolve()))
    env["PATH"] = ":".join(extras + [env.get("PATH", "")])
    return env


@router.post("/jobs/{slug}/transcribe")
def run_transcribe(slug: str, params: TranscribeParams):
    jobs_root, *_ = _roots()
    update_whisper_model(slug, jobs_root, params.model_size, params.language)
    job = init_job(jobs_root, slug)

    def work(progress_cb):
        stage_transcribe(job, progress_cb=progress_cb)
        return {"ok": True}

    async def gen():
        yield sse_event("progress", {"stage": "loading_model"})
        async for chunk in run_with_progress(work):
            yield chunk

    return StreamingResponse(gen(), media_type="text/event-stream")


def _publish_remotion_assets(slug: str, jobs_root: Path) -> Path:
    """Copia trimmed.mp4 e brand.json para o projeto Remotion."""
    remotion_dir = Path("remotion")
    pub = remotion_dir / "public"
    pub.mkdir(parents=True, exist_ok=True)
    shutil.copy(jobs_root / slug / "trimmed.mp4", pub / "trimmed.mp4")
    shutil.copy("brand/brand.json", remotion_dir / "src" / "brand.json")
    return remotion_dir


FORMAT_MAP = {
    "main16x9": ("Recorded16x9", "16x9"),
    "vertical9x16": ("Recorded9x16", "9x16"),
}


@router.post("/jobs/{slug}/render")
async def run_render(slug: str, params: RenderParams | None = None):
    jobs_root, _, output_root = _roots()
    output_root.mkdir(parents=True, exist_ok=True)
    job_dir = Path(jobs_root) / slug
    props_path = (job_dir / "edit-recipe.json").resolve()
    if not props_path.exists():
        raise HTTPException(status_code=409, detail="edit-recipe.json não existe; rode /recipe antes")

    selected = (params.formats if params else None) or ["main16x9", "vertical9x16"]
    jobs_to_run = [
        (f, FORMAT_MAP[f][0], f"{slug}-{FORMAT_MAP[f][1]}.mp4")
        for f in selected if f in FORMAT_MAP
    ]
    if not jobs_to_run:
        raise HTTPException(status_code=400, detail="nenhum formato selecionado")

    remotion_dir = _publish_remotion_assets(slug, jobs_root)
    output_root_abs = output_root.resolve()
    env = _build_remotion_env()

    async def gen():
        from collections import deque
        for fmt_key, composition, out_name in jobs_to_run:
            out_path = output_root_abs / out_name
            try:
                proc = await render_mod.run_remotion(composition, out_path, props_path, remotion_dir, env)
            except Exception as e:
                yield sse_event("error", {"detail": str(e)})
                return
            tail: deque[str] = deque(maxlen=15)  # últimas linhas para erro
            while True:
                raw = await proc.stdout.readline()
                if not raw:
                    break
                line = raw.decode(errors="ignore").strip()
                if not line:
                    continue
                p = render_mod.parse_progress(line)
                if p:
                    kind, n, total = p
                    yield sse_event("progress",
                                    {"format": fmt_key, "kind": kind, "n": n, "total": total})
                else:
                    tail.append(line)
            rc = await proc.wait()
            if rc != 0:
                yield sse_event("error", {
                    "detail": f"render {fmt_key} retornou {rc}",
                    "log": "\n".join(tail),
                })
                return
            yield sse_event("progress",
                            {"format": fmt_key, "kind": "encoded", "n": 1, "total": 1, "done_format": True})
        yield sse_event("done", {"ok": True})

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/jobs/{slug}/still")
async def get_still(slug: str, frame: int = 0, format: str = "main16x9"):
    if format not in FORMAT_MAP:
        raise HTTPException(status_code=400, detail="format inválido")
    composition = FORMAT_MAP[format][0]
    jobs_root, _, output_root = _roots()
    props_path = (Path(jobs_root) / slug / "edit-recipe.json").resolve()
    if not props_path.exists():
        raise HTTPException(status_code=409, detail="recipe ausente")

    remotion_dir = _publish_remotion_assets(slug, jobs_root)
    env = _build_remotion_env()

    out = (output_root / f".still-{slug}-{format}-{frame}.png").resolve()
    proc = await render_mod.run_remotion_still(composition, out, frame, props_path, remotion_dir, env)
    if proc.returncode != 0 or not out.exists():
        raise HTTPException(status_code=500, detail="still falhou")
    return FileResponse(out, media_type="image/png")
