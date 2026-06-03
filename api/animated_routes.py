import asyncio
import json
import os
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from api.models import ScriptInput
from api import brand_kits_store
from api.log_helpers import append_job_log
from api.job_queues import JOB_QUEUES, sse_event_dict, sse_format
from pipeline.tts import ElevenLabsClient
from pipeline.animated_recipe import build_animated_recipe
from api.render import dispatch_render

router = APIRouter(prefix="/jobs", tags=["jobs"])
JOBS_ROOT = Path("jobs")

VOICE_SETTINGS = {
    "stability": 0.3,
    "similarity_boost": 0.8,
    "style": 0.8,
    "use_speaker_boost": True,
}


def _build_remotion_env() -> dict:
    """PATH with bin/ (ffmpeg) + .tools/node*/bin (node)."""
    env = os.environ.copy()
    extras = [str(Path("bin").resolve())]
    node_bin = next(Path(".tools").glob("node-*/bin"), None) if Path(".tools").exists() else None
    if node_bin:
        extras.append(str(node_bin.resolve()))
    env["PATH"] = ":".join(extras + [env.get("PATH", "")])
    return env


class AnimatedJobBody(BaseModel):
    brandKitSlug: str
    scripts: list[ScriptInput]
    orientation: Literal["16x9", "9x16"]


@router.post("/animated", status_code=201)
async def create_animated_job(body: AnimatedJobBody, background_tasks: BackgroundTasks):
    kit = brand_kits_store.load_kit(body.brandKitSlug)
    if kit is None:
        raise HTTPException(status_code=404, detail="Brand kit not found")

    max_chars = int(os.getenv("TTS_MAX_CHARS_PER_JOB", "4000"))
    total = sum(len(s.text) for s in body.scripts)
    if total > max_chars:
        raise HTTPException(
            status_code=400,
            detail=f"Total characters {total} exceeds TTS_MAX_CHARS_PER_JOB={max_chars}",
        )

    job_id = uuid.uuid4().hex[:12]
    job_dir = JOBS_ROOT / job_id
    audio_dir = job_dir / "audio"

    append_job_log(job_dir, "job_created", "ok", brand=body.brandKitSlug, orientation=body.orientation)

    client = ElevenLabsClient(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "gJx1vCzNCD1EQHT212Ls"),
        fallback_voice_id=os.getenv("ELEVENLABS_FALLBACK_VOICE_ID", "FGY2WhTYpPnrIDTdsKH5"),
        settings=VOICE_SETTINGS,
    )

    scripts_map = {s.key: s.text for s in body.scripts}
    audios: dict[str, str] = {}
    durations: dict[str, int] = {}

    append_job_log(job_dir, "tts", "started", n=len(body.scripts))

    for script in body.scripts:
        result = client.synthesize(script.key, script.text, audio_dir)
        audios[script.key] = str(result.path)
        durations[script.key] = result.frames

    append_job_log(job_dir, "tts", "done", total_frames=sum(durations.values()))

    width, height = (1920, 1080) if body.orientation == "16x9" else (1080, 1920)
    recipe = build_animated_recipe(
        brand=kit.model_dump(),
        fps=30,
        width=width,
        height=height,
        orientation=body.orientation,
        scripts=scripts_map,
        audios=audios,
        durations_frames=durations,
    )

    job_dir.mkdir(parents=True, exist_ok=True)
    recipe_path = job_dir / "recipe.json"
    recipe_path.write_text(json.dumps(recipe, indent=2))

    append_job_log(job_dir, "recipe", "built", scenes=len(recipe["scenes"]))

    # Pre-create the queue so the SSE consumer can connect before render starts.
    JOB_QUEUES[job_id] = asyncio.Queue()

    out_path = (job_dir / "final.mp4").resolve()
    props_path = recipe_path.resolve()
    remotion_dir = Path("remotion")
    env = _build_remotion_env()

    # Schedule the render as a background task so the HTTP response returns
    # immediately with the job_id (matching the recorded flow where the client
    # immediately connects to the SSE stream).
    background_tasks.add_task(
        dispatch_render, job_id, recipe, out_path, props_path, remotion_dir, env
    )

    append_job_log(job_dir, "render", "dispatched")

    return {"jobId": job_id}


# ---------- F1: SSE progress endpoint ----------

@router.get("/{job_id}/events")
async def animated_job_events(job_id: str):
    """Stream SSE progress events for an animated render job.

    Named events: ``progress``, ``done``, ``error`` — matching RenderStep.tsx.
    The frontend subscribes to ``/jobs/{jobId}/events`` which maps to this route
    because the router is mounted with prefix ``/jobs``.
    """
    job_dir = JOBS_ROOT / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    # Ensure a queue exists (job may have been created before SSE consumer connected).
    q = JOB_QUEUES.setdefault(job_id, asyncio.Queue())

    async def event_generator():
        while True:
            item = await q.get()
            yield sse_format(item)
            # Stop streaming after a terminal event.
            if item["event"] in ("done", "error"):
                break

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------- F2: Download endpoint ----------

@router.get("/{job_id}/output")
def animated_job_output(job_id: str):
    """Serve the rendered MP4 for an animated job.

    The frontend RenderStep.tsx links to ``/jobs/{jobId}/output`` which maps to
    this route because the router is mounted with prefix ``/jobs``.
    """
    out_path = JOBS_ROOT / job_id / "final.mp4"
    if not out_path.exists():
        raise HTTPException(status_code=404, detail="Output not ready yet")
    return FileResponse(out_path, media_type="video/mp4", filename=f"{job_id}.mp4")
