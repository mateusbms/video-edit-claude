import json
import os
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.models import ScriptInput
from api import brand_kits_store
from api.log_helpers import append_job_log
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
def create_animated_job(body: AnimatedJobBody):
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

    out_path = (job_dir / "final.mp4").resolve()
    props_path = recipe_path.resolve()
    remotion_dir = Path("remotion")
    env = _build_remotion_env()
    dispatch_render(job_id, recipe, out_path, props_path, remotion_dir, env)

    append_job_log(job_dir, "render", "dispatched")

    return {"jobId": job_id}
