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
