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


def test_build_recipe_hook_uses_position_and_style():
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=2.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "H", "subtitle": "sub", "duration_frames": 90,
              "x": 0.3, "y": 0.6, "fontSize": 100, "fontFamily": "Poppins",
              "color": "#ff0000", "anchor": "left"},
        max_chars=99, max_gap=5.0,
    )
    title = recipe["overlays"][0]
    assert title["type"] == "hook"
    assert title["x"] == 0.3 and title["y"] == 0.6 and title["fontSize"] == 100
    assert title["fontFamily"] == "Poppins" and title["color"] == "#ff0000" and title["anchor"] == "left"
    sub = recipe["overlays"][1]
    assert sub["text"] == "sub"
    assert sub["x"] == 0.3 and sub["anchor"] == "left"
    assert abs(sub["y"] - 0.68) < 1e-6
    assert sub["fontSize"] == 48


def test_build_recipe_hook_style_defaults_backward_compat():
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "H", "subtitle": "", "duration_frames": 90},
        max_chars=99, max_gap=5.0,
    )
    t = recipe["overlays"][0]
    assert t["x"] == 0.5 and t["y"] == 0.16 and t["fontSize"] == 84 and t["anchor"] == "center"


def test_build_recipe_hook_overlay_and_no_card():
    words = [_w("ola", 0.0, 0.5), _w("pessoal", 0.5, 1.0)]
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=2.0,
        words=words,
        hook={"title": "O segredo", "subtitle": "em 60s", "duration_frames": 90},
        max_chars=99, max_gap=5.0,
    )
    assert recipe["fps"] == 30
    assert recipe["source"]["trimmedFrames"] == 60
    # sem card: apenas um segmento clip
    assert all(s["type"] != "card" for s in recipe["segments"])
    assert len(recipe["segments"]) == 1
    assert recipe["segments"][0]["type"] == "clip"
    assert recipe["segments"][0]["inFrame"] == 0
    assert recipe["segments"][0]["outFrame"] == 60
    # legendas SEM offset de card: 0s -> frame 0
    assert recipe["captions"][0]["fromFrame"] == 0
    assert recipe["captions"][0]["text"] == "ola pessoal"
    # overlay de hook
    hook_ov = recipe["overlays"][0]
    assert hook_ov["type"] == "hook"
    assert hook_ov["text"] == "O segredo"
    assert hook_ov["fromFrame"] == 0
    assert hook_ov["durationInFrames"] == 90
    assert hook_ov["id"] == "ov_hook"
    # subtítulo preenchido -> segundo overlay
    subs = [o for o in recipe["overlays"][1:] if o["text"] == "em 60s"]
    assert len(subs) == 1
    assert subs[0]["type"] == "text"
    assert recipe["formats"]["vertical9x16"]["width"] == 1080


def test_build_recipe_no_subtitle_overlay_when_empty():
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "T", "subtitle": "", "duration_frames": 60},
        max_chars=99, max_gap=5.0,
    )
    assert len(recipe["overlays"]) == 1
    assert recipe["overlays"][0]["type"] == "hook"
    assert recipe["overlays"][0]["durationInFrames"] == 60


def test_build_recipe_no_lowerthird():
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "T", "subtitle": "s", "duration_frames": 60},
        max_chars=99, max_gap=5.0,
    )
    assert all(o["type"] != "lowerThird" for o in recipe["overlays"])


def test_build_recipe_hook_duration_floored_when_nonpositive():
    # duration_frames 0/negativo/ausente não pode sumir com o overlay de hook
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "T", "subtitle": "", "duration_frames": 0},
        max_chars=99, max_gap=5.0,
    )
    assert recipe["overlays"][0]["durationInFrames"] >= 1


def test_build_recipe_injects_caption_style_defaults():
    from pipeline.recipe import build_recipe
    r = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[{"word": "a", "start": 0.0, "end": 0.5}],
        hook={"title": "T", "subtitle": ""}, hook_card_frames=0,
        caption_style={"fontSize": 60, "bottom": 200, "color": "", "highlightColor": "", "fontFamily": ""},
        brand={"colors": {"foreground": "#111111", "accent": "#22c55e"}, "fonts": {"body": "Poppins"}},
    )
    cs = r["captionStyle"]
    assert cs["fontSize"] == 60
    assert cs["bottom"] == 200
    assert cs["color"] == "#111111"
    assert cs["highlightColor"] == "#22c55e"
    assert cs["fontFamily"] == "Poppins"


def test_build_recipe_bottom_zero_is_preserved():
    from pipeline.recipe import build_recipe
    r = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[], hook={"title": "T", "subtitle": ""}, hook_card_frames=0,
        caption_style={"fontSize": 48, "bottom": 0, "color": "", "highlightColor": "", "fontFamily": ""},
        brand=None,
    )
    assert r["captionStyle"]["bottom"] == 0  # 0 legítimo não vira 120


def test_build_recipe_caption_style_overrides_brand():
    from pipeline.recipe import build_recipe
    r = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[], hook={"title": "T", "subtitle": ""}, hook_card_frames=0,
        caption_style={"fontSize": 48, "bottom": 120, "color": "#ff0000", "highlightColor": "#00ff00", "fontFamily": "Inter"},
        brand={"colors": {"foreground": "#111", "accent": "#222"}, "fonts": {"body": "Roboto"}},
    )
    cs = r["captionStyle"]
    assert cs["color"] == "#ff0000"
    assert cs["fontFamily"] == "Inter"


def test_build_recipe_concatenates_manual_overlays_after_hook():
    manual = [{
        "id": "ov_a", "type": "text", "text": "Oferta",
        "fromFrame": 30, "durationInFrames": 60,
        "x": 0.5, "y": 0.3, "anchor": "center", "fontSize": 72,
        "color": "", "highlightColor": "", "fontFamily": "",
        "enter": "pop", "exit": "fade",
        "enterDurationInFrames": 10, "exitDurationInFrames": 10,
    }]
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=2.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "H", "subtitle": "", "duration_frames": 90},
        max_chars=99, max_gap=5.0,
        overlays=manual,
    )
    assert recipe["overlays"][0]["type"] == "hook"
    assert recipe["overlays"][-1]["id"] == "ov_a"
    assert recipe["overlays"][-1]["text"] == "Oferta"


def test_build_recipe_no_manual_overlays_defaults_to_hook_only():
    recipe = build_recipe(
        width=1920, height=1080, fps=30, trimmed_duration=1.0,
        words=[_w("a", 0.0, 0.5)],
        hook={"title": "H", "subtitle": "", "duration_frames": 60},
        max_chars=99, max_gap=5.0,
    )
    assert len(recipe["overlays"]) == 1
    assert recipe["overlays"][0]["type"] == "hook"


def test_stage_recipe_uses_brand_kit(tmp_path, monkeypatch):
    import json as _json
    import dataclasses
    from pathlib import Path
    from pipeline.job import init_job, write_json
    from pipeline.stages import stage_recipe
    monkeypatch.chdir(tmp_path)
    kit_dir = Path("brand/kits/acme"); kit_dir.mkdir(parents=True)
    (kit_dir / "kit.json").write_text(_json.dumps({
        "version": 1, "slug": "acme", "name": "Acme", "logo": "logo.png",
        "colors": {"bg": "#000", "card": "#111", "border": "#222", "foreground": "#abcdef",
                   "muted": "#333", "accent": "#654321", "accentLight": "#444"},
        "fonts": {"body": "Poppins", "headline": "Inter"},
    }))
    job = init_job(Path("jobs"), "j1")
    job.config.brand_kit_slug = "acme"
    write_json(job.dir / "job.config.json", dataclasses.asdict(job.config))
    write_json(job.dir / "probe.json", {"width": 1920, "height": 1080, "fps": 30, "duration": 1.0})
    write_json(job.dir / "transcript.json", [{"text": "a", "start": 0.0, "end": 0.5, "words": [{"word": "a", "start": 0.0, "end": 0.5}]}])
    write_json(job.dir / "hook.json", {"title": "T", "subtitle": ""})
    job = init_job(Path("jobs"), "j1")  # reload config from disk
    stage_recipe(job)
    recipe = _json.loads((job.dir / "edit-recipe.json").read_text())
    assert recipe["captionStyle"]["color"] == "#abcdef"
    assert recipe["captionStyle"]["fontFamily"] == "Poppins"
