from pipeline.animated_recipe import build_animated_recipe, SCENE_ORDER


def test_scene_order_matches_md():
    assert SCENE_ORDER == [
        "s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10",
    ]


def test_recipe_concatenates_durations_with_padding():
    durations = {k: 60 for k in SCENE_ORDER}  # 60 frames each
    scripts = {k: f"text-{k}" for k in SCENE_ORDER}
    audios = {k: f"/tmp/{k}.mp3" for k in SCENE_ORDER}
    recipe = build_animated_recipe(
        brand={"slug":"acme"}, fps=30, width=1920, height=1080,
        orientation="16x9",
        scripts=scripts, audios=audios, durations_frames=durations,
    )
    scenes = recipe["scenes"]
    # Each scene: 60 frames audio + 5 padding = 65
    assert scenes[0]["fromFrame"] == 0
    assert scenes[0]["durationInFrames"] == 65
    assert scenes[1]["fromFrame"] == 65
    assert scenes[-1]["fromFrame"] == 65 * (len(SCENE_ORDER) - 1)


def test_recipe_has_kind_and_version():
    durations = {k: 30 for k in SCENE_ORDER}
    scripts = {k: "x" for k in SCENE_ORDER}
    audios = {k: f"{k}.mp3" for k in SCENE_ORDER}
    recipe = build_animated_recipe(
        brand={"slug":"acme"}, fps=30, width=1920, height=1080,
        orientation="16x9",
        scripts=scripts, audios=audios, durations_frames=durations,
    )
    assert recipe["kind"] == "animated"
    assert recipe["recipeVersion"] == 1
    assert recipe["musicStartFrame"] == 45
