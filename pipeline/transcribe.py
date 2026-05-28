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


def transcribe_audio(path: str, model_size: str = "small", language: str = "pt") -> list[dict]:
    from faster_whisper import WhisperModel  # import tardio: dep pesada

    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(path, language=language, word_timestamps=True)
    return words_from_segments(segments)
