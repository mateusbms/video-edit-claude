from api.render import composition_id_for


def test_recorded_16x9():
    assert composition_id_for({"kind": "recorded", "orientation": "16x9"}) == "Recorded16x9"


def test_recorded_9x16():
    assert composition_id_for({"kind": "recorded", "orientation": "9x16"}) == "Recorded9x16"


def test_animated_16x9():
    assert composition_id_for({"kind": "animated", "orientation": "16x9"}) == "Animated16x9"


def test_animated_9x16():
    assert composition_id_for({"kind": "animated", "orientation": "9x16"}) == "Animated9x16"


def test_legacy_recipe_without_kind_defaults_to_recorded():
    legacy = {"orientation": "16x9"}
    assert composition_id_for(legacy) == "Recorded16x9"
