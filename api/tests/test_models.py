import pytest
from pydantic import ValidationError

from api.models import JobState, CutParams, Hook, CaptionLine, WordOut, Scene
from api.models import BrandKit, BrandColors, BrandFonts, ScriptInput, AnimatedRecipe


def test_cut_params_defaults():
    p = CutParams()
    assert p.silence_threshold_db == -30.0
    assert p.padding == 0.1
    assert p.min_silence == 0.5


def test_job_state_minimal():
    s = JobState(slug="x", probe=None, config=CutParams())
    assert s.has_trimmed is False
    assert s.has_transcript is False


def test_caption_line_roundtrip():
    line = CaptionLine(
        text="ola",
        start=0.0,
        end=0.5,
        words=[WordOut(word="ola", start=0.0, end=0.5)],
    )
    assert line.model_dump()["words"][0]["word"] == "ola"


def test_hook_defaults():
    h = Hook(title="x", subtitle="y")
    assert h.duration_frames == 90


def test_hook_style_defaults():
    from api.models import Hook
    h = Hook(title="T")
    assert h.x == 0.5 and h.y == 0.16 and h.fontSize == 84
    assert h.fontFamily == "" and h.color == "" and h.anchor == "center"


def test_brand_kit_minimal_valid():
    kit = BrandKit(
        version=1,
        slug="acme",
        name="Acme",
        logo="logo.png",
        colors=BrandColors(
            bg="#f5f5f0", card="#ffffff", border="#e2e2dc",
            foreground="#262622", muted="#757568",
            accent="#16a34a", accentLight="rgba(22,163,74,0.12)",
        ),
        fonts=BrandFonts(body="Inter", headline="Instrument Serif"),
    )
    assert kit.slug == "acme"


def test_script_input_rejects_unknown_key():
    with pytest.raises(ValidationError):
        ScriptInput(key="s99", text="bad")


def test_script_input_accepts_all_known_keys():
    for key in ["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"]:
        ScriptInput(key=key, text="ok")


def test_animated_recipe_kind_locked():
    recipe = AnimatedRecipe(
        recipeVersion=1, kind="animated", fps=30, width=1920, height=1080,
        orientation="16x9",
        brand=BrandKit(
            version=1, slug="acme", name="Acme", logo="logo.png",
            colors=BrandColors(
                bg="#f5f5f0", card="#ffffff", border="#e2e2dc",
                foreground="#262622", muted="#757568",
                accent="#16a34a", accentLight="rgba(22,163,74,0.12)",
            ),
            fonts=BrandFonts(body="Inter", headline="Instrument Serif"),
        ),
        scenes=[Scene(id="s01", fromFrame=0, durationInFrames=60, audio="a.mp3", text="hi")],
    )
    assert recipe.kind == "animated"
    with pytest.raises(ValidationError):
        recipe.model_validate(recipe.model_dump() | {"kind": "recorded"})


def test_brand_colors_rejects_non_hex():
    with pytest.raises(ValidationError):
        BrandColors(
            bg="not-a-hex", card="#ffffff", border="#e2e2dc",
            foreground="#262622", muted="#757568",
            accent="#16a34a", accentLight="rgba(22,163,74,0.12)",
        )


def test_overlay_params_defaults_and_validation():
    from api.models import OverlayParams
    import pytest
    from pydantic import ValidationError
    # defaults preenchidos a partir do mínimo
    o = OverlayParams(text="oi", fromFrame=0, durationInFrames=60)
    assert o.x == 0.5 and o.y == 0.18 and o.anchor == "center"
    assert o.fontSize == 64 and o.enter == "slide-up" and o.exit == "fade"
    assert o.color == "" and o.id == "" and o.type == "text"
    # hex válido aceito; "" aceito; hex inválido rejeitado
    assert OverlayParams(text="x", fromFrame=0, durationInFrames=1, color="#ff0000").color == "#ff0000"
    with pytest.raises(ValidationError):
        OverlayParams(text="x", fromFrame=0, durationInFrames=1, color="vermelho")
    # enum de animação inválido rejeitado
    with pytest.raises(ValidationError):
        OverlayParams(text="x", fromFrame=0, durationInFrames=1, enter="zoom")


def test_animated_recipe_rejects_empty_scenes():
    with pytest.raises(ValidationError):
        AnimatedRecipe(
            recipeVersion=1, kind="animated", fps=30, width=1920, height=1080,
            orientation="16x9",
            brand=BrandKit(
                version=1, slug="acme", name="Acme", logo="logo.png",
                colors=BrandColors(
                    bg="#f5f5f0", card="#ffffff", border="#e2e2dc",
                    foreground="#262622", muted="#757568",
                    accent="#16a34a", accentLight="rgba(22,163,74,0.12)",
                ),
                fonts=BrandFonts(body="Inter", headline="Instrument Serif"),
            ),
            scenes=[],
        )
