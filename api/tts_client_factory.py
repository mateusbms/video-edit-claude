"""Factory for selecting the TTS client based on TTS_MODE env var."""

import os

from pipeline.tts import ElevenLabsClient, MockTTSClient

VOICE_SETTINGS = {
    "stability": 0.3,
    "similarity_boost": 0.8,
    "style": 0.8,
    "use_speaker_boost": True,
}


def _tts_client():
    """Return the TTS client appropriate for the current TTS_MODE."""
    if os.getenv("TTS_MODE", "elevenlabs") == "mock":
        return MockTTSClient(fps=30)
    return ElevenLabsClient(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "gJx1vCzNCD1EQHT212Ls"),
        fallback_voice_id=os.getenv("ELEVENLABS_FALLBACK_VOICE_ID", "FGY2WhTYpPnrIDTdsKH5"),
        settings=VOICE_SETTINGS,
    )
