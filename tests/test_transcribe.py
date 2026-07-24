from types import SimpleNamespace
from pipeline.transcribe import words_from_segments


def test_words_from_segments_flattens_words():
    seg = SimpleNamespace(
        text=" Olá mundo ",
        start=0.0,
        end=1.0,
        words=[
            SimpleNamespace(word=" Olá", start=0.0, end=0.4),
            SimpleNamespace(word=" mundo", start=0.4, end=1.0),
        ],
    )
    out = words_from_segments([seg])
    assert out[0]["text"] == "Olá mundo"
    assert out[0]["words"] == [
        {"word": "Olá", "start": 0.0, "end": 0.4},
        {"word": "mundo", "start": 0.4, "end": 1.0},
    ]


import sys
import types


def test_model_is_cached_and_uses_fast_params(monkeypatch):
    from pipeline import transcribe as T
    T._MODEL_CACHE.clear()
    ctor_calls = []
    transcribe_kwargs = []

    class FakeModel:
        def __init__(self, *a, **k):
            ctor_calls.append((a, k))

        def transcribe(self, path, **kwargs):
            transcribe_kwargs.append(kwargs)
            return ([], None)

    fake_mod = types.SimpleNamespace(WhisperModel=FakeModel)
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_mod)

    T.transcribe_audio("a.wav", model_size="base")
    T.transcribe_audio("b.wav", model_size="base")

    assert len(ctor_calls) == 1
    assert transcribe_kwargs[0]["vad_filter"] is True
    assert transcribe_kwargs[0]["beam_size"] == 1


def test_transcribe_default_model_is_base(monkeypatch):
    from pipeline import transcribe as T
    T._MODEL_CACHE.clear()
    sizes = []

    class FakeModel:
        def __init__(self, size, **k):
            sizes.append(size)

        def transcribe(self, path, **kwargs):
            return ([], None)

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=FakeModel))
    T.transcribe_audio("a.wav")
    assert sizes == ["base"]
