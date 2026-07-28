from pipeline.orientation import FORMAT_KEYS, frame_size, resolve_orientation


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


def brand_of_kit(kit_slug: str) -> dict | None:
    """Cores e fontes do brand kit, no formato que build_recipe espera em `brand`.

    Fonte única para o render (stage_recipe) e para o preview (get_state).
    """
    if not kit_slug:
        return None
    from api.brand_kits_store import load_kit
    kit = load_kit(kit_slug)
    if not kit:
        return None
    return {"colors": kit.colors.model_dump(), "fonts": kit.fonts.model_dump()}


def resolve_caption_style(style: dict | None, brand: dict | None) -> dict:
    """Estilo de legenda efetivo: escolha do usuário > brand kit > padrão.

    O preview (api.jobs.get_state) usa exatamente esta função, senão ele
    desenharia com uma fonte e o render com outra — métricas diferentes,
    quebra de linha diferente.
    """
    cs = style or {}
    bcolors = (brand or {}).get("colors", {})
    bfonts = (brand or {}).get("fonts", {})
    return {
        "fontSize": cs["fontSize"] if cs.get("fontSize") is not None else 48,
        "bottom": cs["bottom"] if cs.get("bottom") is not None else 120,
        "color": cs.get("color") or bcolors.get("foreground") or "#ffffff",
        "highlightColor": cs.get("highlightColor") or bcolors.get("accent") or "#22c55e",
        "fontFamily": cs.get("fontFamily") or bfonts.get("body") or "Inter",
    }


def _formats_for(orientation: str) -> dict:
    """Só a orientação escolhida — o job renderiza um formato único."""
    w, h = frame_size(orientation)
    return {FORMAT_KEYS[orientation]: {"width": w, "height": h}}


def build_recipe(
    *,
    width: int,
    height: int,
    fps: float,
    trimmed_duration: float,
    words: list[dict],
    hook: dict,
    hook_card_frames: int = 0,
    max_chars: int = 24,
    max_gap: float = 0.6,
    trimmed_frames_actual: int | None = None,
    caption_style: dict | None = None,
    brand: dict | None = None,
    overlays: list[dict] | None = None,
    orientation: str = "",
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

    orientation = resolve_orientation(orientation, {"width": width, "height": height})

    resolved_caption_style = resolve_caption_style(caption_style, brand)

    # piso defensivo: 0/negativo/ausente não podem sumir com o overlay de hook
    duration_frames = max(1, hook.get("duration_frames") or 90)
    hx = hook.get("x", 0.5)
    hy = hook.get("y", 0.16)
    hfs = hook.get("fontSize", 84)
    hff = hook.get("fontFamily", "")
    hcolor = hook.get("color", "")
    hanchor = hook.get("anchor", "center")
    hmaxw = hook.get("maxWidthPct", 80)
    hook_overlays = [
        {
            "id": "ov_hook",
            "type": "hook",
            "text": hook["title"],
            "fromFrame": 0,
            "durationInFrames": duration_frames,
            "x": hx, "y": hy, "anchor": hanchor,
            "fontSize": hfs, "color": hcolor, "highlightColor": "", "fontFamily": hff,
            "enter": "slide-up", "exit": "fade",
            "enterDurationInFrames": 12, "exitDurationInFrames": 12,
            "maxWidthPct": hmaxw,
        }
    ]
    subtitle = hook.get("subtitle", "")
    if subtitle:
        hook_overlays.append(
            {
                "id": "ov_hook_sub",
                "type": "text",
                "text": subtitle,
                "fromFrame": 6,
                "durationInFrames": max(1, duration_frames - 6),
                "x": hx, "y": round(hy + 0.08, 6), "anchor": hanchor,
                "fontSize": round(hfs * 0.48), "color": hcolor, "highlightColor": "", "fontFamily": hff,
                "enter": "slide-up", "exit": "fade",
                "enterDurationInFrames": 12, "exitDurationInFrames": 12,
                "maxWidthPct": hmaxw,
            }
        )

    manual_overlays = overlays or []

    return {
        "kind": "recorded",
        "orientation": orientation,
        "fps": fps,
        "source": {"width": width, "height": height, "trimmedFrames": trimmed_frames},
        "segments": [
            {
                "type": "clip",
                "source": "trimmed.mp4",
                "inFrame": 0,
                "outFrame": trimmed_frames,
                "reframe": {"focusX": 0.5},
            },
        ],
        "captions": captions,
        "captionStyle": resolved_caption_style,
        "overlays": hook_overlays + manual_overlays,
        "formats": _formats_for(orientation),
    }
