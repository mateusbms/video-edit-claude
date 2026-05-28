from pipeline.recipe import seconds_to_frames
from pipeline.recipe import group_words_into_lines
from pipeline.recipe import build_recipe


def test_seconds_to_frames_rounds():
    assert seconds_to_frames(1.0, 30) == 30
    assert seconds_to_frames(0.49, 30) == 15   # 14.7 -> 15
    assert seconds_to_frames(0.0, 30) == 0


def _w(word, start, end):
    return {"word": word, "start": start, "end": end}


def test_group_words_breaks_on_max_chars():
    words = [_w("um", 0.0, 0.2), _w("dois", 0.2, 0.4), _w("tres", 0.4, 0.6),
             _w("quatro", 0.6, 0.8), _w("cinco", 0.8, 1.0)]
    lines = group_words_into_lines(words, max_chars=12, max_gap=5.0)
    # "um dois tres" = 12 chars -> quebra antes de "quatro"
    assert lines[0]["text"] == "um dois tres"
    assert lines[1]["text"] == "quatro cinco"


def test_group_words_breaks_on_gap():
    words = [_w("ola", 0.0, 0.3), _w("mundo", 2.0, 2.4)]
    lines = group_words_into_lines(words, max_chars=99, max_gap=0.6)
    assert len(lines) == 2
    assert lines[0]["start"] == 0.0
    assert lines[1]["start"] == 2.0


def test_build_recipe_offsets_captions_by_hook_card():
    words = [_w("ola", 0.0, 0.5), _w("pessoal", 0.5, 1.0)]
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=2.0,
        words=words,
        hook={"title": "O segredo", "subtitle": "em 60s"},
        hook_card_frames=90,
        max_chars=99, max_gap=5.0,
    )
    assert recipe["fps"] == 30
    assert recipe["source"]["trimmedFrames"] == 60
    # primeiro segmento: card; segundo: clip
    assert recipe["segments"][0]["type"] == "card"
    assert recipe["segments"][0]["durationInFrames"] == 90
    assert recipe["segments"][0]["title"] == "O segredo"
    assert recipe["segments"][1]["type"] == "clip"
    assert recipe["segments"][1]["inFrame"] == 0
    assert recipe["segments"][1]["outFrame"] == 60
    # legenda deslocada pelo card (0s -> frame 90)
    assert recipe["captions"][0]["fromFrame"] == 90
    assert recipe["captions"][0]["text"] == "ola pessoal"
    # overlay lowerThird durante o card
    assert recipe["overlays"][0]["type"] == "lowerThird"
    assert recipe["formats"]["vertical9x16"]["width"] == 1080
