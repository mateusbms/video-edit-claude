import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
from pipeline.tts import ElevenLabsClient, TTSError, TTSResult


SETTINGS = {"stability": 0.3, "similarity_boost": 0.8, "style": 0.8, "use_speaker_boost": True}


def make_client(api_key="k", voice="v", fallback="f"):
    return ElevenLabsClient(api_key=api_key, voice_id=voice, fallback_voice_id=fallback, settings=SETTINGS)


def test_synthesize_writes_file_and_returns_result(tmp_path):
    client = make_client()
    fake_resp = MagicMock(status_code=200, content=b"FAKEMP3")
    with patch("pipeline.tts._http_post", return_value=fake_resp), \
         patch("pipeline.tts._measure_duration_seconds", return_value=4.2):
        result = client.synthesize("s01", "hello", tmp_path)
    assert isinstance(result, TTSResult)
    assert result.seconds == 4.2
    assert result.path.exists()
    assert result.path.read_bytes() == b"FAKEMP3"


def test_cache_hit_skips_http(tmp_path):
    client = make_client()
    # Prime cache by first call
    fake_resp = MagicMock(status_code=200, content=b"X")
    with patch("pipeline.tts._http_post", return_value=fake_resp) as mock_post, \
         patch("pipeline.tts._measure_duration_seconds", return_value=1.0):
        client.synthesize("s01", "hi", tmp_path)
        client.synthesize("s01", "hi", tmp_path)
    assert mock_post.call_count == 1


def test_retry_on_429_then_succeeds(tmp_path):
    client = make_client()
    responses = [MagicMock(status_code=429), MagicMock(status_code=200, content=b"X")]
    with patch("pipeline.tts._http_post", side_effect=responses) as mock_post, \
         patch("pipeline.tts._measure_duration_seconds", return_value=1.0), \
         patch("pipeline.tts.time.sleep") as mock_sleep:
        client.synthesize("s01", "hi", tmp_path)
    assert mock_post.call_count == 2
    mock_sleep.assert_called()


def test_fallback_voice_used_after_primary_exhausts(tmp_path):
    client = make_client()
    bad = MagicMock(status_code=500)
    good = MagicMock(status_code=200, content=b"X")
    with patch("pipeline.tts._http_post", side_effect=[bad, bad, bad, good]) as mock_post, \
         patch("pipeline.tts._measure_duration_seconds", return_value=1.0), \
         patch("pipeline.tts.time.sleep"):
        client.synthesize("s01", "hi", tmp_path)
    # 3 attempts on primary voice then 1 on fallback
    assert mock_post.call_count == 4
    # Last call should hit the fallback voice
    last_call_url = mock_post.call_args_list[-1].args[0]
    assert "/f" in last_call_url


def test_final_failure_raises(tmp_path):
    client = make_client()
    bad = MagicMock(status_code=500)
    with patch("pipeline.tts._http_post", return_value=bad), \
         patch("pipeline.tts.time.sleep"):
        with pytest.raises(TTSError):
            client.synthesize("s01", "hi", tmp_path)
