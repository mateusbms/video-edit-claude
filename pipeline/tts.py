import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

from pipeline.tts_cache import script_hash, cached_path


BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech"
MAX_ATTEMPTS_PER_VOICE = 3
BACKOFFS = [1, 3, 9]

_MOCK_CHARS_PER_SECOND = 15.0
_MOCK_MIN_SECONDS = 1.0
_MOCK_MAX_SECONDS = 8.0


class TTSError(RuntimeError):
    pass


@dataclass
class TTSResult:
    key: str
    path: Path
    seconds: float
    frames: int


def _http_post(url: str, headers: dict, payload: dict, timeout: float = 60.0):
    return httpx.post(url, headers=headers, json=payload, timeout=timeout)


def _measure_duration_seconds(path: Path) -> float:
    try:
        out = subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ])
        return float(out.decode().strip())
    except (FileNotFoundError, subprocess.CalledProcessError, ValueError) as e:
        raise TTSError(f"ffprobe failed for {path}: {e}")


def _mock_ffmpeg(path: Path, seconds: float) -> None:
    """Generate a silent MP3 of the given duration using ffmpeg."""
    subprocess.check_call(
        [
            "ffmpeg", "-f", "lavfi",
            "-i", "anullsrc=channel_layout=mono:sample_rate=44100",
            "-t", str(seconds),
            "-c:a", "libmp3lame",
            "-b:a", "64k",
            "-y", str(path),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


class MockTTSClient:
    """TTS client that generates silent MP3s locally via ffmpeg.

    Used when TTS_MODE=mock to validate the full pipeline without an
    ElevenLabs account.
    """

    def __init__(self, fps: int = 30):
        self.fps = fps
        # Fixed pseudo-voice-id so the cache key is stable and distinct
        # from any real ElevenLabs voice.
        self._voice_id = "mock"
        self._settings: dict = {}

    def _duration_for(self, text: str) -> float:
        """Compute realistic speech duration from text length."""
        if not text:
            return _MOCK_MIN_SECONDS
        seconds = len(text) / _MOCK_CHARS_PER_SECOND
        return max(_MOCK_MIN_SECONDS, min(_MOCK_MAX_SECONDS, seconds))

    def synthesize(self, key: str, text: str, audio_dir: Path) -> TTSResult:
        audio_dir.mkdir(parents=True, exist_ok=True)
        h = script_hash(self._voice_id, self._settings, text)
        path = cached_path(audio_dir, h)
        if not path.exists():
            planned_seconds = self._duration_for(text)
            _mock_ffmpeg(path, planned_seconds)
        seconds = _measure_duration_seconds(path)
        frames = round(seconds * self.fps)
        return TTSResult(key=key, path=path, seconds=seconds, frames=frames)


class ElevenLabsClient:
    def __init__(
        self,
        api_key: str,
        voice_id: str,
        fallback_voice_id: str,
        settings: dict,
        model_id: str = "eleven_multilingual_v2",
        fps: int = 30,
    ):
        self.api_key = api_key
        self.voice_id = voice_id
        self.fallback_voice_id = fallback_voice_id
        self.settings = settings
        self.model_id = model_id
        self.fps = fps

    def _try_voice(self, voice: str, text: str, dest: Path) -> Optional[bytes]:
        url = f"{BASE_URL}/{voice}"
        headers = {"xi-api-key": self.api_key, "Content-Type": "application/json"}
        payload = {"text": text, "model_id": self.model_id, "voice_settings": self.settings}
        for attempt in range(MAX_ATTEMPTS_PER_VOICE):
            resp = _http_post(url, headers, payload)
            if resp.status_code == 200:
                return resp.content
            if resp.status_code in (429, 500, 502, 503, 504):
                if attempt < MAX_ATTEMPTS_PER_VOICE - 1:
                    time.sleep(BACKOFFS[attempt])
                    continue
            return None
        return None

    def synthesize(self, key: str, text: str, audio_dir: Path) -> TTSResult:
        audio_dir.mkdir(parents=True, exist_ok=True)
        # Cache key uses the PRIMARY voice id only. If a synthesis fell back to the
        # secondary voice (voice_id ran out of attempts), the resulting MP3 is still
        # cached under the primary key. Subsequent calls will reuse that file, so a
        # voice swap is sticky for that text until the cache file is deleted.
        h = script_hash(self.voice_id, self.settings, text)
        path = cached_path(audio_dir, h)
        if not path.exists():
            content = self._try_voice(self.voice_id, text, path)
            if content is None:
                content = self._try_voice(self.fallback_voice_id, text, path)
            if content is None:
                raise TTSError(f"ElevenLabs failed for scene {key}")
            path.write_bytes(content)
        seconds = _measure_duration_seconds(path)
        frames = round(seconds * self.fps)
        return TTSResult(key=key, path=path, seconds=seconds, frames=frames)
