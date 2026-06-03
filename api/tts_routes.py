import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.models import ScriptInput
from pipeline.tts import ElevenLabsClient
from api.tts_client_factory import _tts_client

router = APIRouter(prefix="/tts", tags=["tts"])
JOBS_ROOT = Path("jobs")

VOICE_SETTINGS = {
    "stability": 0.3,
    "similarity_boost": 0.8,
    "style": 0.8,
    "use_speaker_boost": True,
}


class GenerateBody(BaseModel):
    jobId: str
    scripts: list[ScriptInput]


class GenerateResult(BaseModel):
    key: str
    file: str
    seconds: float
    frames: int


@router.post("/generate", response_model=list[GenerateResult])
def generate(body: GenerateBody):
    max_chars = int(os.getenv("TTS_MAX_CHARS_PER_JOB", "4000"))
    total = sum(len(s.text) for s in body.scripts)
    if total > max_chars:
        raise HTTPException(
            status_code=400,
            detail=f"Total characters {total} exceeds TTS_MAX_CHARS_PER_JOB={max_chars}",
        )

    client = _tts_client()

    audio_dir = JOBS_ROOT / body.jobId / "audio"
    results = []
    for script in body.scripts:
        r = client.synthesize(script.key, script.text, audio_dir)
        results.append(GenerateResult(
            key=r.key, file=str(r.path), seconds=r.seconds, frames=r.frames,
        ))
    return results
