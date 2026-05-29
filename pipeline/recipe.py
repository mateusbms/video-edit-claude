def seconds_to_frames(seconds: float, fps: float) -> int:
    return round(seconds * fps)


def group_words_into_lines(words: list[dict], max_chars: int = 24, max_gap: float = 0.6) -> list[dict]:
    lines: list[list[dict]] = []
    cur: list[dict] = []
    cur_chars = 0
    for w in words:
        wlen = len(w["word"])
        gap_break = cur and (w["start"] - cur[-1]["end"] > max_gap)
        char_break = cur and (cur_chars + wlen + 1 > max_chars)
        if gap_break or char_break:
            lines.append(cur)
            cur, cur_chars = [], 0
        cur.append(w)
        cur_chars += wlen + (1 if cur_chars else 0)
    if cur:
        lines.append(cur)
    return [
        {
            "start": ln[0]["start"],
            "end": ln[-1]["end"],
            "text": " ".join(x["word"] for x in ln),
            "words": ln,
        }
        for ln in lines
    ]


def build_recipe(
    *,
    width: int,
    height: int,
    fps: float,
    trimmed_duration: float,
    words: list[dict],
    hook: dict,
    hook_card_frames: int,
    max_chars: int = 24,
    max_gap: float = 0.6,
    trimmed_frames_actual: int | None = None,
) -> dict:
    # Se temos nb_frames do ffprobe, usar diretamente — evita Remotion ler
    # além do fim do vídeo quando duration*fps > nb_frames real.
    if trimmed_frames_actual is not None:
        trimmed_frames = trimmed_frames_actual
    else:
        trimmed_frames = seconds_to_frames(trimmed_duration, fps)
    lines = group_words_into_lines(words, max_chars=max_chars, max_gap=max_gap)

    captions = []
    for ln in lines:
        from_frame = seconds_to_frames(ln["start"], fps) + hook_card_frames
        end_frame = seconds_to_frames(ln["end"], fps) + hook_card_frames
        word_objs = []
        for w in ln["words"]:
            wf = seconds_to_frames(w["start"], fps) + hook_card_frames
            we = seconds_to_frames(w["end"], fps) + hook_card_frames
            word_objs.append(
                {"word": w["word"], "fromFrame": wf, "durationInFrames": max(1, we - wf)}
            )
        captions.append(
            {
                "fromFrame": from_frame,
                "durationInFrames": max(1, end_frame - from_frame),
                "text": ln["text"],
                "words": word_objs,
            }
        )

    return {
        "fps": fps,
        "source": {"width": width, "height": height, "trimmedFrames": trimmed_frames},
        "segments": [
            {
                "type": "card",
                "durationInFrames": hook_card_frames,
                "title": hook["title"],
                "subtitle": hook.get("subtitle", ""),
            },
            {
                "type": "clip",
                "source": "trimmed.mp4",
                "inFrame": 0,
                "outFrame": trimmed_frames,
                "reframe": {"focusX": 0.5},
            },
        ],
        "captions": captions,
        "overlays": [
            {
                "type": "lowerThird",
                "fromFrame": 0,
                "durationInFrames": hook_card_frames,
                "text": hook["title"],
            }
        ],
        "formats": {
            "main16x9": {"width": 1920, "height": 1080},
            "vertical9x16": {"width": 1080, "height": 1920},
        },
    }
