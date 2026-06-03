import hashlib
import json
from pathlib import Path


def script_hash(voice_id: str, settings: dict, text: str) -> str:
    payload = json.dumps(
        {"voice": voice_id, "settings": settings, "text": text},
        sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def cached_path(audio_dir: Path, h: str) -> Path:
    return audio_dir / f"{h}.mp3"
