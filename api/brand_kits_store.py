import json
import re
from pathlib import Path
from typing import Optional
from api.models import BrandKit

KITS_ROOT = Path("brand/kits")
JOBS_ROOT = Path("jobs")


class KitInUseError(Exception):
    pass


def slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _kit_dir(slug: str) -> Path:
    return KITS_ROOT / slug


def save_kit(kit: BrandKit) -> None:
    d = _kit_dir(kit.slug)
    d.mkdir(parents=True, exist_ok=True)
    (d / "kit.json").write_text(kit.model_dump_json(indent=2))


def load_kit(slug: str) -> Optional[BrandKit]:
    path = _kit_dir(slug) / "kit.json"
    if not path.exists():
        return None
    return BrandKit.model_validate_json(path.read_text())


def list_kits() -> list[BrandKit]:
    if not KITS_ROOT.exists():
        return []
    out = []
    for d in sorted(KITS_ROOT.iterdir()):
        if d.is_dir() and (d / "kit.json").exists():
            out.append(BrandKit.model_validate_json((d / "kit.json").read_text()))
    return out


def _is_in_use(slug: str) -> bool:
    if not JOBS_ROOT.exists():
        return False
    for job_dir in JOBS_ROOT.iterdir():
        recipe = job_dir / "recipe.json"
        if not recipe.exists():
            continue
        try:
            data = json.loads(recipe.read_text())
        except json.JSONDecodeError:
            continue
        if data.get("kind") == "animated" and data.get("brand", {}).get("slug") == slug:
            return True
    return False


def delete_kit(slug: str) -> None:
    if _is_in_use(slug):
        raise KitInUseError(f"Brand kit '{slug}' is referenced by an existing job")
    d = _kit_dir(slug)
    if not d.exists():
        return
    for p in d.iterdir():
        p.unlink()
    d.rmdir()
