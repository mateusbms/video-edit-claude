SCENE_ORDER = ["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"]
SCENE_PADDING_FRAMES = 5


def build_animated_recipe(*, brand: dict, fps: int, width: int, height: int,
                          orientation: str, scripts: dict, audios: dict,
                          durations_frames: dict) -> dict:
    scenes = []
    cursor = 0
    for key in SCENE_ORDER:
        dur = durations_frames[key] + SCENE_PADDING_FRAMES
        scenes.append({
            "id": key,
            "fromFrame": cursor,
            "durationInFrames": dur,
            "audio": audios[key],
            "text": scripts[key],
        })
        cursor += dur
    return {
        "recipeVersion": 1,
        "kind": "animated",
        "fps": fps,
        "width": width,
        "height": height,
        "orientation": orientation,
        "brand": brand,
        "scenes": scenes,
        "musicStartFrame": 45,
        "musicVolume": 0.15,
    }
