import pytest
from pathlib import Path
from api.brand_kits_store import (
    list_kits, save_kit, load_kit, delete_kit, slugify, KitInUseError
)
from api.models import BrandKit, BrandColors, BrandFonts


def make_kit(slug="acme", name="Acme") -> BrandKit:
    return BrandKit(
        version=1, slug=slug, name=name, logo="logo.png",
        colors=BrandColors(
            bg="#f5f5f0", card="#ffffff", border="#e2e2dc",
            foreground="#262622", muted="#757568",
            accent="#16a34a", accentLight="rgba(22,163,74,0.12)",
        ),
        fonts=BrandFonts(body="Inter", headline="Instrument Serif"),
    )


def test_slugify_basic():
    assert slugify("Acme Co.") == "acme-co"
    assert slugify("  Hello World  ") == "hello-world"


def test_save_and_load_kit(tmp_path, monkeypatch):
    monkeypatch.setattr("api.brand_kits_store.KITS_ROOT", tmp_path)
    kit = make_kit()
    save_kit(kit)
    loaded = load_kit("acme")
    assert loaded.name == "Acme"


def test_list_kits(tmp_path, monkeypatch):
    monkeypatch.setattr("api.brand_kits_store.KITS_ROOT", tmp_path)
    save_kit(make_kit("a", "A"))
    save_kit(make_kit("b", "B"))
    kits = list_kits()
    slugs = {k.slug for k in kits}
    assert slugs == {"a", "b"}


def test_delete_kit_not_in_use(tmp_path, monkeypatch):
    monkeypatch.setattr("api.brand_kits_store.KITS_ROOT", tmp_path)
    monkeypatch.setattr("api.brand_kits_store.JOBS_ROOT", tmp_path / "jobs")
    save_kit(make_kit())
    delete_kit("acme")
    assert load_kit("acme") is None


def test_delete_kit_in_use_raises(tmp_path, monkeypatch):
    monkeypatch.setattr("api.brand_kits_store.KITS_ROOT", tmp_path)
    jobs = tmp_path / "jobs"
    jobs.mkdir()
    (jobs / "job1").mkdir()
    (jobs / "job1" / "recipe.json").write_text('{"kind":"animated","brand":{"slug":"acme"}}')
    monkeypatch.setattr("api.brand_kits_store.JOBS_ROOT", jobs)
    save_kit(make_kit())
    with pytest.raises(KitInUseError):
        delete_kit("acme")
