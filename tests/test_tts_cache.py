from pipeline.tts_cache import script_hash, cached_path


def test_script_hash_deterministic():
    h1 = script_hash("voice", {"stability": 0.3}, "hello")
    h2 = script_hash("voice", {"stability": 0.3}, "hello")
    assert h1 == h2


def test_script_hash_changes_on_voice():
    h1 = script_hash("voice-a", {"x": 1}, "hi")
    h2 = script_hash("voice-b", {"x": 1}, "hi")
    assert h1 != h2


def test_script_hash_changes_on_settings():
    h1 = script_hash("v", {"x": 1}, "hi")
    h2 = script_hash("v", {"x": 2}, "hi")
    assert h1 != h2


def test_cached_path(tmp_path):
    p = cached_path(tmp_path, "abc123")
    assert p == tmp_path / "abc123.mp3"
