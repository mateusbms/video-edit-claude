def words_from_segments(segments) -> list[dict]:
    lines = []
    for seg in segments:
        words = [
            {"word": w.word.strip(), "start": w.start, "end": w.end}
            for w in seg.words
        ]
        lines.append(
            {"text": seg.text.strip(), "start": seg.start, "end": seg.end, "words": words}
        )
    return lines


_MODEL_CACHE: dict[str, object] = {}


def _get_model(model_size: str):
    if model_size not in _MODEL_CACHE:
        from faster_whisper import WhisperModel  # import tardio: dep pesada
        _MODEL_CACHE[model_size] = WhisperModel(model_size, device="cpu", compute_type="int8")
    return _MODEL_CACHE[model_size]


def transcribe_audio(path: str, model_size: str = "base", language: str = "pt") -> list[dict]:
    model = _get_model(model_size)
    segments, _info = model.transcribe(
        path, language=language, word_timestamps=True,
        vad_filter=True, beam_size=1,
    )
    return words_from_segments(segments)
