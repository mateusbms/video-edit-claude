from api.suggest_prompt import build_prompt

TRANSCRIPT = [
    {"text": "Todo ano você faz um check-up.", "start": 0.0, "end": 2.5, "words": []},
    {"text": "Rendeu 12% ao ano em média.", "start": 5.0, "end": 8.0, "words": []},
]
HOOK = {"title": "E a sua carteira?", "subtitle": ""}
DEFAULTS = {"fontSize": 64, "y": 0.12, "durationInFrames": 75, "maxWidthPct": 80}


def test_includes_transcript_lines_with_times():
    p = build_prompt(TRANSCRIPT, HOOK, DEFAULTS, fps=30, orientation="9x16")
    assert "Todo ano você faz um check-up." in p
    assert "Rendeu 12% ao ano em média." in p
    # tempos da fala presentes para o grounding
    assert "5.0" in p and "8.0" in p


def test_passes_the_hook_so_model_does_not_repeat_it():
    p = build_prompt(TRANSCRIPT, HOOK, DEFAULTS, fps=30, orientation="9x16")
    assert "E a sua carteira?" in p


def test_reflects_orientation():
    vertical = build_prompt(TRANSCRIPT, HOOK, DEFAULTS, fps=30, orientation="9x16")
    horizontal = build_prompt(TRANSCRIPT, HOOK, DEFAULTS, fps=30, orientation="16x9")
    assert "9x16" in vertical
    assert "16x9" in horizontal
    assert vertical != horizontal


def test_asks_for_the_exact_json_shape():
    p = build_prompt(TRANSCRIPT, HOOK, DEFAULTS, fps=30, orientation="9x16")
    for field in ("id", "text", "fromFrame", "durationInFrames", "kind", "angle", "source"):
        assert field in p
    assert "sug_01" in p


def test_reflects_default_font_size():
    p = build_prompt(TRANSCRIPT, HOOK, {"fontSize": 96, "durationInFrames": 60}, fps=30, orientation="9x16")
    assert "96" in p
