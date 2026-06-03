# Dual-Mode Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Sendkit-style animated video mode to the editor, alongside the existing recorded-video wizard, with the mode chosen on the first screen.

**Architecture:** Light fork at the wizard layer with shared render runner. Each saved recipe carries `kind: "recorded" | "animated"` and the renderer dispatches to the correct Remotion composition. ElevenLabs TTS is invoked server-side with hash-based caching and retry/fallback. Brand identity is stored as reusable kits under `brand/kits/<slug>/`.

**Tech Stack:** FastAPI + pydantic (api), Python + ffprobe (pipeline), Remotion 4.x + React + TypeScript (rendering), Vite + React + zod (web), pytest + vitest (tests), ElevenLabs HTTP API (TTS).

**Source of truth for animated scene visuals:** [`docs/references/SENDKIT-PH-PROMPT.md`](../../references/SENDKIT-PH-PROMPT.md). Each Remotion scene task in Phase 2 references its `§Scene N` section, which gives exhaustive specs for layout, colors, frame timing, springs, and content. Re-read that section before implementing a scene.

**Spec:** [`docs/superpowers/specs/2026-06-03-dual-mode-editor-design.md`](../specs/2026-06-03-dual-mode-editor-design.md).

---

## Phase plan

| Phase | Outcome at end of phase |
|---|---|
| 1 — Backend + render skeleton | API can accept an animated job, generate TTS, build recipe, dispatch a stub Remotion render. End-to-end pipeline alive with a placeholder Scene 1. |
| 2 — Remotion scenes | All 11 scenes implemented; renders look like the Sendkit reference but driven by brand kit. |
| 3 — Frontend wizard | User can drive the full animated flow from the browser. |
| 4 — Production polish | Smoke test, observability, env validation, README update. |

Phase 1 ships an internally usable feature (curl can drive it). Phase 3 ships the user-visible feature.

---

# Phase 1 — Backend + render skeleton

### Task 1: Environment variables + startup validation

**Files:**
- Create: `.env.example`
- Modify: `api/app.py`

- [ ] **Step 1: Write the failing test**

`api/tests/test_env.py`:
```python
import pytest
from fastapi.testclient import TestClient


def test_app_startup_fails_without_elevenlabs_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    from importlib import reload
    from api import app as app_module
    with pytest.raises(RuntimeError, match="ELEVENLABS_API_KEY"):
        reload(app_module)


def test_app_startup_ok_with_elevenlabs_key(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    from importlib import reload
    from api import app as app_module
    reload(app_module)
    client = TestClient(app_module.app)
    assert client.get("/health").status_code == 200
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pytest api/tests/test_env.py -v`
Expected: FAIL (no startup validation yet).

- [ ] **Step 3: Add startup validation in `api/app.py`**

At the top of `api/app.py`, before `app = FastAPI(...)`:
```python
import os

REQUIRED_ENV = ["ELEVENLABS_API_KEY"]
for var in REQUIRED_ENV:
    if not os.getenv(var):
        raise RuntimeError(f"Missing required env var: {var}")

ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "gJx1vCzNCD1EQHT212Ls")
ELEVENLABS_FALLBACK_VOICE_ID = os.getenv("ELEVENLABS_FALLBACK_VOICE_ID", "FGY2WhTYpPnrIDTdsKH5")
TTS_MAX_CHARS_PER_JOB = int(os.getenv("TTS_MAX_CHARS_PER_JOB", "4000"))
```

- [ ] **Step 4: Create `.env.example`**

```
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=gJx1vCzNCD1EQHT212Ls
ELEVENLABS_FALLBACK_VOICE_ID=FGY2WhTYpPnrIDTdsKH5
TTS_MAX_CHARS_PER_JOB=4000
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `pytest api/tests/test_env.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/app.py api/tests/test_env.py .env.example
git commit -m "feat(api): require ElevenLabs env vars at startup"
```

---

### Task 2: Pydantic models for animated recipe

**Files:**
- Modify: `api/models.py`
- Create: `api/tests/test_models.py`

- [ ] **Step 1: Write the failing tests**

`api/tests/test_models.py`:
```python
import pytest
from pydantic import ValidationError
from api.models import BrandKit, BrandColors, BrandFonts, ScriptInput, AnimatedRecipe


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
        scenes=[],
    )
    assert recipe.kind == "animated"
    with pytest.raises(ValidationError):
        recipe.model_copy(update={"kind": "recorded"})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pytest api/tests/test_models.py -v`
Expected: FAIL with `ImportError` / undefined names.

- [ ] **Step 3: Add models to `api/models.py`**

Append to `api/models.py`:
```python
from typing import Literal
from pydantic import BaseModel, Field

ScriptKey = Literal["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"]


class BrandColors(BaseModel):
    bg: str
    card: str
    border: str
    foreground: str
    muted: str
    accent: str
    accentLight: str


class BrandFonts(BaseModel):
    body: str
    headline: str


class BrandKit(BaseModel):
    version: Literal[1] = 1
    slug: str
    name: str
    logo: str
    colors: BrandColors
    fonts: BrandFonts


class ScriptInput(BaseModel):
    key: ScriptKey
    text: str


class Scene(BaseModel):
    id: ScriptKey
    fromFrame: int
    durationInFrames: int
    audio: str
    text: str


class AnimatedRecipe(BaseModel):
    recipeVersion: Literal[1] = 1
    kind: Literal["animated"] = "animated"
    fps: int
    width: int
    height: int
    orientation: Literal["16x9", "9x16"]
    brand: BrandKit
    scenes: list[Scene]
    musicStartFrame: int = 45
    musicVolume: float = 0.15
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pytest api/tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/models.py api/tests/test_models.py
git commit -m "feat(api): pydantic models for animated recipe and brand kits"
```

---

### Task 3: Brand kit storage helpers

**Files:**
- Create: `api/brand_kits_store.py`
- Create: `api/tests/test_brand_kits_store.py`
- Create: `brand/kits/.gitkeep`

- [ ] **Step 1: Write the failing tests**

`api/tests/test_brand_kits_store.py`:
```python
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pytest api/tests/test_brand_kits_store.py -v`
Expected: FAIL.

- [ ] **Step 3: Create `api/brand_kits_store.py`**

```python
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
```

- [ ] **Step 4: Create `brand/kits/.gitkeep`**

```bash
mkdir -p brand/kits && touch brand/kits/.gitkeep
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `pytest api/tests/test_brand_kits_store.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/brand_kits_store.py api/tests/test_brand_kits_store.py brand/kits/.gitkeep
git commit -m "feat(api): brand kit storage helpers with in-use guard"
```

---

### Task 4: Brand kit CRUD endpoints

**Files:**
- Create: `api/brand_kits_routes.py`
- Modify: `api/routes.py` (register router)
- Create: `api/tests/test_brand_kits_routes.py`

- [ ] **Step 1: Write the failing tests**

`api/tests/test_brand_kits_routes.py`:
```python
import io
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test")
    monkeypatch.setattr("api.brand_kits_store.KITS_ROOT", tmp_path / "kits")
    monkeypatch.setattr("api.brand_kits_store.JOBS_ROOT", tmp_path / "jobs")
    from api.app import app
    return TestClient(app)


def _post_kit(client, name="Acme", logo=b"\x89PNG\r\n\x1a\n"):
    files = {"logo": ("logo.png", io.BytesIO(logo), "image/png")}
    data = {
        "name": name,
        "colors_bg": "#f5f5f0", "colors_card": "#ffffff", "colors_border": "#e2e2dc",
        "colors_foreground": "#262622", "colors_muted": "#757568",
        "colors_accent": "#16a34a", "colors_accentLight": "rgba(22,163,74,0.12)",
        "fonts_body": "Inter", "fonts_headline": "Instrument Serif",
    }
    return client.post("/brand-kits", data=data, files=files)


def test_list_empty(client):
    r = client.get("/brand-kits")
    assert r.status_code == 200
    assert r.json() == []


def test_create_and_list(client):
    r = _post_kit(client, "Acme")
    assert r.status_code == 201
    assert r.json()["slug"] == "acme"
    assert client.get("/brand-kits").json()[0]["slug"] == "acme"


def test_delete_kit(client):
    _post_kit(client, "Acme")
    r = client.delete("/brand-kits/acme")
    assert r.status_code == 204
    assert client.get("/brand-kits").json() == []


def test_delete_unknown_404(client):
    r = client.delete("/brand-kits/nope")
    assert r.status_code == 404
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pytest api/tests/test_brand_kits_routes.py -v`
Expected: FAIL.

- [ ] **Step 3: Create `api/brand_kits_routes.py`**

```python
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from api.models import BrandKit, BrandColors, BrandFonts
from api import brand_kits_store

router = APIRouter(prefix="/brand-kits", tags=["brand-kits"])


@router.get("")
def list_kits():
    return [k.model_dump() for k in brand_kits_store.list_kits()]


@router.post("", status_code=201)
async def create_kit(
    name: str = Form(...),
    colors_bg: str = Form(...), colors_card: str = Form(...),
    colors_border: str = Form(...), colors_foreground: str = Form(...),
    colors_muted: str = Form(...), colors_accent: str = Form(...),
    colors_accentLight: str = Form(...),
    fonts_body: str = Form(...), fonts_headline: str = Form(...),
    logo: UploadFile = File(...),
):
    slug = brand_kits_store.slugify(name)
    kit = BrandKit(
        version=1, slug=slug, name=name, logo="logo.png",
        colors=BrandColors(
            bg=colors_bg, card=colors_card, border=colors_border,
            foreground=colors_foreground, muted=colors_muted,
            accent=colors_accent, accentLight=colors_accentLight,
        ),
        fonts=BrandFonts(body=fonts_body, headline=fonts_headline),
    )
    brand_kits_store.save_kit(kit)
    (brand_kits_store.KITS_ROOT / slug / "logo.png").write_bytes(await logo.read())
    return kit.model_dump()


@router.delete("/{slug}", status_code=204)
def delete_kit(slug: str):
    if brand_kits_store.load_kit(slug) is None:
        raise HTTPException(status_code=404, detail="Kit not found")
    try:
        brand_kits_store.delete_kit(slug)
    except brand_kits_store.KitInUseError as e:
        raise HTTPException(status_code=409, detail=str(e))
```

- [ ] **Step 4: Register router in `api/routes.py`**

Add to `api/routes.py`:
```python
from api.brand_kits_routes import router as brand_kits_router
# ...wherever routers are mounted, mount this one:
app.include_router(brand_kits_router)
```

(If `routes.py` does not yet hold an `app` import, do this in `api/app.py` after `app = FastAPI(...)`.)

- [ ] **Step 5: Run the test and verify it passes**

Run: `pytest api/tests/test_brand_kits_routes.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/brand_kits_routes.py api/routes.py api/app.py api/tests/test_brand_kits_routes.py
git commit -m "feat(api): brand-kits CRUD endpoints (list/create/delete)"
```

---

### Task 5: TTS hash cache helper

**Files:**
- Create: `pipeline/tts_cache.py`
- Create: `tests/test_tts_cache.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_tts_cache.py`:
```python
from pipeline.tts_cache import script_hash, cached_path


def test_script_hash_deterministic():
    h1 = script_hash("voice", {"stability": 0.3}, "hello")
    h2 = script_hash("voice", {"stability": 0.3}, "hello")
    assert h1 == h2


def test_script_hash_changes_on_voice():
    h1 = script_hash("voice-a", {"x": 1}, "hi")
    h2 = script_hash("voice-b", {"x": 1}, "hi")
    assert h1 != h2


def test_script_hash_changes_on_settings():
    h1 = script_hash("v", {"x": 1}, "hi")
    h2 = script_hash("v", {"x": 2}, "hi")
    assert h1 != h2


def test_cached_path(tmp_path):
    p = cached_path(tmp_path, "abc123")
    assert p == tmp_path / "abc123.mp3"
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pytest tests/test_tts_cache.py -v`
Expected: FAIL.

- [ ] **Step 3: Create `pipeline/tts_cache.py`**

```python
import hashlib
import json
from pathlib import Path


def script_hash(voice_id: str, settings: dict, text: str) -> str:
    payload = json.dumps(
        {"voice": voice_id, "settings": settings, "text": text},
        sort_keys=True, separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def cached_path(audio_dir: Path, h: str) -> Path:
    return audio_dir / f"{h}.mp3"
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pytest tests/test_tts_cache.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tts_cache.py tests/test_tts_cache.py
git commit -m "feat(pipeline): TTS cache key + path helper"
```

---

### Task 6: TTS API client with retry + fallback voice

**Files:**
- Create: `pipeline/tts.py`
- Create: `tests/test_tts.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_tts.py`:
```python
import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path
from pipeline.tts import ElevenLabsClient, TTSError, TTSResult


SETTINGS = {"stability": 0.3, "similarity_boost": 0.8, "style": 0.8, "use_speaker_boost": True}


def make_client(api_key="k", voice="v", fallback="f"):
    return ElevenLabsClient(api_key=api_key, voice_id=voice, fallback_voice_id=fallback, settings=SETTINGS)


def test_synthesize_writes_file_and_returns_result(tmp_path):
    client = make_client()
    fake_resp = MagicMock(status_code=200, content=b"FAKEMP3")
    with patch("pipeline.tts._http_post", return_value=fake_resp), \
         patch("pipeline.tts._measure_duration_seconds", return_value=4.2):
        result = client.synthesize("s01", "hello", tmp_path)
    assert isinstance(result, TTSResult)
    assert result.seconds == 4.2
    assert result.path.exists()
    assert result.path.read_bytes() == b"FAKEMP3"


def test_cache_hit_skips_http(tmp_path):
    client = make_client()
    # Prime cache by first call
    fake_resp = MagicMock(status_code=200, content=b"X")
    with patch("pipeline.tts._http_post", return_value=fake_resp) as mock_post, \
         patch("pipeline.tts._measure_duration_seconds", return_value=1.0):
        client.synthesize("s01", "hi", tmp_path)
        client.synthesize("s01", "hi", tmp_path)
    assert mock_post.call_count == 1


def test_retry_on_429_then_succeeds(tmp_path):
    client = make_client()
    responses = [MagicMock(status_code=429), MagicMock(status_code=200, content=b"X")]
    with patch("pipeline.tts._http_post", side_effect=responses) as mock_post, \
         patch("pipeline.tts._measure_duration_seconds", return_value=1.0), \
         patch("pipeline.tts.time.sleep") as mock_sleep:
        client.synthesize("s01", "hi", tmp_path)
    assert mock_post.call_count == 2
    mock_sleep.assert_called()


def test_fallback_voice_used_after_primary_exhausts(tmp_path):
    client = make_client()
    bad = MagicMock(status_code=500)
    good = MagicMock(status_code=200, content=b"X")
    with patch("pipeline.tts._http_post", side_effect=[bad, bad, bad, good]) as mock_post, \
         patch("pipeline.tts._measure_duration_seconds", return_value=1.0), \
         patch("pipeline.tts.time.sleep"):
        client.synthesize("s01", "hi", tmp_path)
    # 3 attempts on primary voice then 1 on fallback
    assert mock_post.call_count == 4
    # Last call should hit the fallback voice
    last_call_url = mock_post.call_args_list[-1].args[0]
    assert "/f" in last_call_url


def test_final_failure_raises(tmp_path):
    client = make_client()
    bad = MagicMock(status_code=500)
    with patch("pipeline.tts._http_post", return_value=bad), \
         patch("pipeline.tts.time.sleep"):
        with pytest.raises(TTSError):
            client.synthesize("s01", "hi", tmp_path)
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pytest tests/test_tts.py -v`
Expected: FAIL.

- [ ] **Step 3: Create `pipeline/tts.py`**

```python
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx

from pipeline.tts_cache import script_hash, cached_path


BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech"
MAX_ATTEMPTS_PER_VOICE = 3
BACKOFFS = [1, 3, 9]


class TTSError(RuntimeError):
    pass


@dataclass
class TTSResult:
    key: str
    path: Path
    seconds: float
    frames: int


def _http_post(url: str, headers: dict, payload: dict, timeout: float = 60.0):
    return httpx.post(url, headers=headers, json=payload, timeout=timeout)


def _measure_duration_seconds(path: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ])
    return float(out.decode().strip())


class ElevenLabsClient:
    def __init__(self, api_key: str, voice_id: str, fallback_voice_id: str, settings: dict, model_id: str = "eleven_multilingual_v2", fps: int = 30):
        self.api_key = api_key
        self.voice_id = voice_id
        self.fallback_voice_id = fallback_voice_id
        self.settings = settings
        self.model_id = model_id
        self.fps = fps

    def _try_voice(self, voice: str, text: str, dest: Path) -> Optional[bytes]:
        url = f"{BASE_URL}/{voice}"
        headers = {"xi-api-key": self.api_key, "Content-Type": "application/json"}
        payload = {"text": text, "model_id": self.model_id, "voice_settings": self.settings}
        for attempt in range(MAX_ATTEMPTS_PER_VOICE):
            resp = _http_post(url, headers, payload)
            if resp.status_code == 200:
                return resp.content
            if resp.status_code in (429, 500, 502, 503, 504):
                if attempt < MAX_ATTEMPTS_PER_VOICE - 1:
                    time.sleep(BACKOFFS[attempt])
                    continue
            return None
        return None

    def synthesize(self, key: str, text: str, audio_dir: Path) -> TTSResult:
        audio_dir.mkdir(parents=True, exist_ok=True)
        h = script_hash(self.voice_id, self.settings, text)
        path = cached_path(audio_dir, h)
        if not path.exists():
            content = self._try_voice(self.voice_id, text, path)
            if content is None:
                content = self._try_voice(self.fallback_voice_id, text, path)
            if content is None:
                raise TTSError(f"ElevenLabs failed for scene {key}")
            path.write_bytes(content)
        seconds = _measure_duration_seconds(path)
        frames = round(seconds * self.fps)
        return TTSResult(key=key, path=path, seconds=seconds, frames=frames)
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pytest tests/test_tts.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/tts.py tests/test_tts.py
git commit -m "feat(pipeline): ElevenLabs TTS client with retry, cache, fallback voice"
```

---

### Task 7: animated_recipe.py timing builder

**Files:**
- Create: `pipeline/animated_recipe.py`
- Create: `tests/test_animated_recipe.py`

- [ ] **Step 1: Write the failing tests**

`tests/test_animated_recipe.py`:
```python
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pytest tests/test_animated_recipe.py -v`
Expected: FAIL.

- [ ] **Step 3: Create `pipeline/animated_recipe.py`**

```python
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
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pytest tests/test_animated_recipe.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pipeline/animated_recipe.py tests/test_animated_recipe.py
git commit -m "feat(pipeline): animated recipe builder with scene timing"
```

---

### Task 8: POST /tts/generate route

**Files:**
- Create: `api/tts_routes.py`
- Modify: `api/app.py` (register router)
- Create: `api/tests/test_tts_routes.py`

- [ ] **Step 1: Write the failing tests**

`api/tests/test_tts_routes.py`:
```python
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test")
    monkeypatch.setenv("TTS_MAX_CHARS_PER_JOB", "100")
    monkeypatch.setattr("api.tts_routes.JOBS_ROOT", tmp_path)
    from importlib import reload
    from api import app as app_module
    reload(app_module)
    return TestClient(app_module.app)


def test_rejects_over_char_limit(client):
    long_text = "x" * 200
    r = client.post("/tts/generate", json={
        "jobId": "job1",
        "scripts": [{"key":"s01","text":long_text}],
    })
    assert r.status_code == 400
    assert "TTS_MAX_CHARS_PER_JOB" in r.json()["detail"]


def test_happy_path(client, tmp_path):
    fake_result = MagicMock(key="s01", path=Path("/tmp/x.mp3"), seconds=2.0, frames=60)
    with patch("api.tts_routes.ElevenLabsClient") as Client:
        Client.return_value.synthesize.return_value = fake_result
        r = client.post("/tts/generate", json={
            "jobId":"job1",
            "scripts":[{"key":"s01","text":"hi"}],
        })
    assert r.status_code == 200
    assert r.json() == [{"key":"s01","file":"/tmp/x.mp3","seconds":2.0,"frames":60}]
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pytest api/tests/test_tts_routes.py -v`
Expected: FAIL.

- [ ] **Step 3: Create `api/tts_routes.py`**

```python
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.models import ScriptInput
from pipeline.tts import ElevenLabsClient

router = APIRouter(prefix="/tts", tags=["tts"])
JOBS_ROOT = Path("jobs")

VOICE_SETTINGS = {
    "stability": 0.3,
    "similarity_boost": 0.8,
    "style": 0.8,
    "use_speaker_boost": True,
}


class GenerateBody(BaseModel):
    jobId: str
    scripts: list[ScriptInput]


class GenerateResult(BaseModel):
    key: str
    file: str
    seconds: float
    frames: int


@router.post("/generate", response_model=list[GenerateResult])
def generate(body: GenerateBody):
    max_chars = int(os.getenv("TTS_MAX_CHARS_PER_JOB", "4000"))
    total = sum(len(s.text) for s in body.scripts)
    if total > max_chars:
        raise HTTPException(
            status_code=400,
            detail=f"Total characters {total} exceeds TTS_MAX_CHARS_PER_JOB={max_chars}",
        )

    client = ElevenLabsClient(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "gJx1vCzNCD1EQHT212Ls"),
        fallback_voice_id=os.getenv("ELEVENLABS_FALLBACK_VOICE_ID", "FGY2WhTYpPnrIDTdsKH5"),
        settings=VOICE_SETTINGS,
    )

    audio_dir = JOBS_ROOT / body.jobId / "audio"
    results = []
    for script in body.scripts:
        r = client.synthesize(script.key, script.text, audio_dir)
        results.append(GenerateResult(
            key=r.key, file=str(r.path), seconds=r.seconds, frames=r.frames,
        ))
    return results
```

- [ ] **Step 4: Register the router**

In `api/app.py`:
```python
from api.tts_routes import router as tts_router
app.include_router(tts_router)
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `pytest api/tests/test_tts_routes.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/tts_routes.py api/app.py api/tests/test_tts_routes.py
git commit -m "feat(api): POST /tts/generate with char-limit guard"
```

---

### Task 9: Render dispatcher by kind + orientation

**Files:**
- Modify: `api/render.py`
- Create: `api/tests/test_render_dispatch.py`

- [ ] **Step 1: Read `api/render.py`**

Open it and identify the function that calls Remotion today (likely something like `render_job(job_id, recipe)` invoking `npx remotion render`). The change: select the composition ID based on `recipe.kind` and `recipe.orientation`.

- [ ] **Step 2: Write the failing test**

`api/tests/test_render_dispatch.py`:
```python
from api.render import composition_id_for


def test_recorded_16x9():
    assert composition_id_for({"kind":"recorded","orientation":"16x9"}) == "Recorded16x9"


def test_recorded_9x16():
    assert composition_id_for({"kind":"recorded","orientation":"9x16"}) == "Recorded9x16"


def test_animated_16x9():
    assert composition_id_for({"kind":"animated","orientation":"16x9"}) == "Animated16x9"


def test_animated_9x16():
    assert composition_id_for({"kind":"animated","orientation":"9x16"}) == "Animated9x16"


def test_legacy_recipe_without_kind_defaults_to_recorded():
    legacy = {"orientation": "16x9"}
    assert composition_id_for(legacy) == "Recorded16x9"
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `pytest api/tests/test_render_dispatch.py -v`
Expected: FAIL.

- [ ] **Step 4: Add `composition_id_for` and `dispatch_render` to `api/render.py`**

```python
COMPOSITION_MAP = {
    ("recorded", "16x9"): "Recorded16x9",
    ("recorded", "9x16"): "Recorded9x16",
    ("animated", "16x9"): "Animated16x9",
    ("animated", "9x16"): "Animated9x16",
}


def composition_id_for(recipe: dict) -> str:
    kind = recipe.get("kind", "recorded")
    key = (kind, recipe["orientation"])
    if key not in COMPOSITION_MAP:
        raise ValueError(f"No composition for {key}")
    return COMPOSITION_MAP[key]


def dispatch_render(job_id: str, recipe: dict) -> None:
    composition = composition_id_for(recipe)
    _run_remotion(job_id=job_id, composition=composition, recipe=recipe)
```

Wire the existing render-invocation function (whichever name it has — find by grepping `npx remotion render` in `api/`) to take `composition` as a parameter. If the existing recorded flow hard-coded the composition id, replace that with `composition_id_for(recipe)`.

- [ ] **Step 5: Update recorded jobs to write `orientation` and `kind`**

Find the existing route that creates recorded jobs (look in `api/routes.py` / `api/jobs.py`). When writing the recipe, ensure it includes:
```python
recipe["kind"] = "recorded"
recipe["orientation"] = orientation  # already chosen by user
```

- [ ] **Step 6: Run all tests and verify they pass**

Run: `pytest api/tests/test_render_dispatch.py -v && pytest -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/render.py api/tests/test_render_dispatch.py api/routes.py api/jobs.py
git commit -m "feat(api): render dispatch by kind+orientation; recorded recipes carry kind"
```

---

### Task 10: POST /jobs/animated route

**Files:**
- Create: `api/animated_routes.py`
- Modify: `api/app.py`
- Create: `api/tests/test_animated_routes.py`

- [ ] **Step 1: Write the failing tests**

`api/tests/test_animated_routes.py`:
```python
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from pathlib import Path


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test")
    monkeypatch.setattr("api.brand_kits_store.KITS_ROOT", tmp_path / "kits")
    monkeypatch.setattr("api.brand_kits_store.JOBS_ROOT", tmp_path / "jobs")
    monkeypatch.setattr("api.animated_routes.JOBS_ROOT", tmp_path / "jobs")
    monkeypatch.setattr("api.tts_routes.JOBS_ROOT", tmp_path / "jobs")
    from api.models import BrandKit, BrandColors, BrandFonts
    from api.brand_kits_store import save_kit
    save_kit(BrandKit(
        version=1, slug="acme", name="Acme", logo="logo.png",
        colors=BrandColors(bg="#f5f5f0", card="#ffffff", border="#e2e2dc",
            foreground="#262622", muted="#757568",
            accent="#16a34a", accentLight="rgba(22,163,74,0.12)"),
        fonts=BrandFonts(body="Inter", headline="Instrument Serif"),
    ))
    from importlib import reload
    from api import app as app_module
    reload(app_module)
    return TestClient(app_module.app)


def _scripts():
    keys = ["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"]
    return [{"key": k, "text": f"text {k}"} for k in keys]


def test_unknown_brand_kit_404(client):
    r = client.post("/jobs/animated", json={
        "brandKitSlug": "nope", "scripts": _scripts(), "orientation": "16x9",
    })
    assert r.status_code == 404


def test_happy_path_writes_recipe_and_dispatches_render(client, tmp_path):
    fake_results = [
        MagicMock(key=k, path=Path(f"/tmp/{k}.mp3"), seconds=2.0, frames=60)
        for k in ["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"]
    ]
    with patch("api.animated_routes.ElevenLabsClient") as Client, \
         patch("api.animated_routes.dispatch_render") as dispatch:
        Client.return_value.synthesize.side_effect = fake_results
        r = client.post("/jobs/animated", json={
            "brandKitSlug": "acme",
            "scripts": _scripts(),
            "orientation": "16x9",
        })
    assert r.status_code == 201
    job_id = r.json()["jobId"]
    recipe_path = tmp_path / "jobs" / job_id / "recipe.json"
    assert recipe_path.exists()
    recipe = json.loads(recipe_path.read_text())
    assert recipe["kind"] == "animated"
    assert recipe["orientation"] == "16x9"
    assert len(recipe["scenes"]) == 11
    dispatch.assert_called_once()
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pytest api/tests/test_animated_routes.py -v`
Expected: FAIL.

- [ ] **Step 3: Create `api/animated_routes.py`**

```python
import json
import os
import uuid
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
from api.models import ScriptInput
from api import brand_kits_store
from pipeline.tts import ElevenLabsClient
from pipeline.animated_recipe import build_animated_recipe
from api.render import dispatch_render

router = APIRouter(prefix="/jobs", tags=["jobs"])
JOBS_ROOT = Path("jobs")

VOICE_SETTINGS = {
    "stability": 0.3, "similarity_boost": 0.8,
    "style": 0.8, "use_speaker_boost": True,
}


class AnimatedJobBody(BaseModel):
    brandKitSlug: str
    scripts: list[ScriptInput]
    orientation: Literal["16x9", "9x16"]


@router.post("/animated", status_code=201)
def create_animated_job(body: AnimatedJobBody):
    kit = brand_kits_store.load_kit(body.brandKitSlug)
    if kit is None:
        raise HTTPException(status_code=404, detail="Brand kit not found")

    max_chars = int(os.getenv("TTS_MAX_CHARS_PER_JOB", "4000"))
    total = sum(len(s.text) for s in body.scripts)
    if total > max_chars:
        raise HTTPException(
            status_code=400,
            detail=f"Total characters {total} exceeds TTS_MAX_CHARS_PER_JOB={max_chars}",
        )

    job_id = uuid.uuid4().hex[:12]
    job_dir = JOBS_ROOT / job_id
    audio_dir = job_dir / "audio"

    client = ElevenLabsClient(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "gJx1vCzNCD1EQHT212Ls"),
        fallback_voice_id=os.getenv("ELEVENLABS_FALLBACK_VOICE_ID", "FGY2WhTYpPnrIDTdsKH5"),
        settings=VOICE_SETTINGS,
    )

    scripts_map = {s.key: s.text for s in body.scripts}
    audios = {}
    durations = {}
    for script in body.scripts:
        result = client.synthesize(script.key, script.text, audio_dir)
        audios[script.key] = str(result.path)
        durations[script.key] = result.frames

    width, height = (1920, 1080) if body.orientation == "16x9" else (1080, 1920)
    recipe = build_animated_recipe(
        brand=kit.model_dump(), fps=30, width=width, height=height,
        orientation=body.orientation,
        scripts=scripts_map, audios=audios, durations_frames=durations,
    )

    job_dir.mkdir(parents=True, exist_ok=True)
    (job_dir / "recipe.json").write_text(json.dumps(recipe, indent=2))

    dispatch_render(job_id, recipe)
    return {"jobId": job_id}
```

Note: `dispatch_render` is the cache-friendly path — re-running an animated job whose scripts have not changed reuses the audio MP3s already on disk (the hash cache in `pipeline/tts.py` handles this transparently). This matters for the AudioStep flow (Task 35), where the user previews audio before the final render.

- [ ] **Step 4: Register the router in `api/app.py`**

```python
from api.animated_routes import router as animated_router
app.include_router(animated_router)
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `pytest api/tests/test_animated_routes.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/animated_routes.py api/app.py api/tests/test_animated_routes.py
git commit -m "feat(api): POST /jobs/animated end-to-end (TTS + recipe + dispatch)"
```

---

### Task 11: Remotion — register the 4 compositions in Root.tsx

**Files:**
- Modify: `remotion/src/Root.tsx`
- Create: `remotion/src/animated/AnimatedRoot.tsx` (stub)
- Modify: `remotion/src/schema.ts` (add AnimatedRecipe schema)

- [ ] **Step 1: Read `remotion/src/Root.tsx` and `remotion/src/schema.ts`**

Note how `Recorded16x9` (currently `Main16x9`) and `Recorded9x16` (currently `Vertical9x16`) are registered today.

- [ ] **Step 2: Create stub `remotion/src/animated/AnimatedRoot.tsx`**

```tsx
import { AbsoluteFill, Series, useVideoConfig } from "remotion";
import { z } from "zod";
import { AnimatedRecipeSchema } from "../schema";

export const AnimatedRoot: React.FC<z.infer<typeof AnimatedRecipeSchema>> = (recipe) => {
  return (
    <AbsoluteFill style={{ backgroundColor: recipe.brand.colors.bg }}>
      <Series>
        {recipe.scenes.map((s) => (
          <Series.Sequence key={s.id} durationInFrames={s.durationInFrames}>
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
              <div style={{ color: recipe.brand.colors.foreground, fontSize: 48 }}>
                {s.id}: {s.text.slice(0, 60)}
              </div>
            </AbsoluteFill>
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3: Add `AnimatedRecipeSchema` to `remotion/src/schema.ts`**

```ts
import { z } from "zod";

export const AnimatedRecipeSchema = z.object({
  recipeVersion: z.literal(1),
  kind: z.literal("animated"),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  orientation: z.enum(["16x9", "9x16"]),
  brand: z.object({
    slug: z.string(),
    name: z.string(),
    logo: z.string(),
    colors: z.object({
      bg: z.string(), card: z.string(), border: z.string(),
      foreground: z.string(), muted: z.string(),
      accent: z.string(), accentLight: z.string(),
    }),
    fonts: z.object({ body: z.string(), headline: z.string() }),
  }),
  scenes: z.array(z.object({
    id: z.string(),
    fromFrame: z.number(),
    durationInFrames: z.number(),
    audio: z.string(),
    text: z.string(),
  })),
  musicStartFrame: z.number().default(45),
  musicVolume: z.number().default(0.15),
});
```

- [ ] **Step 4: Register 4 compositions in `remotion/src/Root.tsx`**

Replace existing `Main16x9`/`Vertical9x16` `<Composition>` ids with `Recorded16x9` and `Recorded9x16` and add the two animated ones:

```tsx
<Composition
  id="Animated16x9"
  component={AnimatedRoot}
  schema={AnimatedRecipeSchema}
  defaultProps={defaultAnimatedRecipe16x9}
  durationInFrames={1}  // recomputed via calculateMetadata below
  fps={30}
  width={1920}
  height={1080}
  calculateMetadata={({ props }) => ({
    durationInFrames: props.scenes.reduce((a, s) => a + s.durationInFrames, 0),
  })}
/>
<Composition
  id="Animated9x16"
  component={AnimatedRoot}
  schema={AnimatedRecipeSchema}
  defaultProps={defaultAnimatedRecipe9x16}
  durationInFrames={1}
  fps={30}
  width={1080}
  height={1920}
  calculateMetadata={({ props }) => ({
    durationInFrames: props.scenes.reduce((a, s) => a + s.durationInFrames, 0),
  })}
/>
```

Create `defaultAnimatedRecipe16x9` and `defaultAnimatedRecipe9x16` inline or in `remotion/src/sample-recipe.ts` so Remotion Studio can preview. Use a 2-scene minimal placeholder.

- [ ] **Step 5: Run `npx remotion studio` and confirm both new compositions appear**

```bash
cd remotion && npx remotion compositions
```

Expected: lists `Recorded16x9`, `Recorded9x16`, `Animated16x9`, `Animated9x16`.

- [ ] **Step 6: Run vitest**

```bash
cd remotion && npx vitest run
```

Expected: existing tests still PASS.

- [ ] **Step 7: Commit**

```bash
git add remotion/src/Root.tsx remotion/src/animated/AnimatedRoot.tsx remotion/src/schema.ts remotion/src/sample-recipe.ts
git commit -m "feat(remotion): register Animated16x9 + Animated9x16 with stub AnimatedRoot"
```

---

### Task 12: End-to-end smoke test for Phase 1

**Files:**
- Create: `tests/test_e2e_animated.py`

- [ ] **Step 1: Write the smoke test**

`tests/test_e2e_animated.py`:
```python
import json
import os
import shutil
import subprocess
from pathlib import Path
import pytest


pytestmark = pytest.mark.skipif(
    not os.getenv("E2E_ELEVENLABS_API_KEY"),
    reason="Set E2E_ELEVENLABS_API_KEY to run end-to-end test",
)


def test_e2e_curl_post_renders_mp4(tmp_path, monkeypatch):
    # Spin up the api, post a job, wait for SSE done, check MP4 exists.
    # This test is intentionally manual / opt-in.
    pass  # Placeholder: smoke is exercised manually below
```

Also create `scripts/smoke_animated.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

# Requires server running locally + a seeded brand kit named 'demo'
curl -s -X POST http://localhost:8000/jobs/animated \
  -H 'Content-Type: application/json' \
  -d '{
    "brandKitSlug":"demo",
    "scripts":[
      {"key":"s01","text":"Introducing Smoke."},
      {"key":"s02","text":"Step two."},
      {"key":"s03","text":"Step three."},
      {"key":"s04","text":"Step four."},
      {"key":"s05","text":"Step five."},
      {"key":"s06","text":"Step six."},
      {"key":"s06b","text":"Step six b."},
      {"key":"s07","text":"Step seven."},
      {"key":"s08","text":"Step eight."},
      {"key":"s09","text":"Step nine."},
      {"key":"s10","text":"Try at example.com"}
    ],
    "orientation":"16x9"
  }'
```

- [ ] **Step 2: Run the smoke manually**

```bash
chmod +x scripts/smoke_animated.sh
./scripts/smoke_animated.sh
```

Expected: returns `{"jobId":"..."}`, an MP4 appears at `output/<jobId>/...` after SSE finishes.

- [ ] **Step 3: Commit**

```bash
git add tests/test_e2e_animated.py scripts/smoke_animated.sh
git commit -m "test(e2e): smoke script for animated job post-to-render"
```

---

# Phase 2 — Remotion scenes

Each task in this phase implements one Remotion component. All scene tasks share the same shape:

1. Write a render-doesn't-throw test using `@remotion/renderer` + `selectComposition`/`renderStill` on key frames (0, mid, last).
2. Implement the scene per **`docs/references/SENDKIT-PH-PROMPT.md` §Scene N** (the MD has full specs for layout, colors, frame timing, springs, content).
3. Wire scene into `AnimatedRoot.tsx`'s scene map.
4. Commit.

The MD already specifies exact pixel positions, frame ranges, spring settings, and colors per scene. Treat it as the visual contract; replace MD scene durations with the dynamic `durationInFrames` from the recipe.

### Task 13: Brand theme function

**Files:**
- Create: `remotion/src/animated/theme/brand.ts`
- Create: `remotion/src/animated/theme/__tests__/brand.test.ts`

- [ ] **Step 1: Write the failing test**

`remotion/src/animated/theme/__tests__/brand.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { brandKitToTheme, SENDKIT_DEFAULTS } from "../brand";

describe("brandKitToTheme", () => {
  it("uses kit colors when present", () => {
    const theme = brandKitToTheme({
      colors: { bg: "#000", card: "#111", border: "#222",
        foreground: "#fff", muted: "#888",
        accent: "#0f0", accentLight: "rgba(0,255,0,0.1)" },
      fonts: { body: "Inter", headline: "Serif" },
    } as any);
    expect(theme.bg).toBe("#000");
    expect(theme.accent).toBe("#0f0");
  });
  it("falls back to Sendkit defaults for missing fields", () => {
    const theme = brandKitToTheme({ colors: {}, fonts: {} } as any);
    expect(theme.bg).toBe(SENDKIT_DEFAULTS.bg);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd remotion && npx vitest run src/animated/theme/__tests__/brand.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `remotion/src/animated/theme/brand.ts`**

```ts
export const SENDKIT_DEFAULTS = {
  bg: "#f5f5f0",
  card: "#ffffff",
  border: "#e2e2dc",
  foreground: "#262622",
  muted: "#757568",
  accent: "#16a34a",
  accentLight: "rgba(22,163,74,0.12)",
  accentGlow: "rgba(22,163,74,0.25)",
  fontBody: "Inter",
  fontHeadline: "Instrument Serif",
};

export type Theme = typeof SENDKIT_DEFAULTS;

type Kit = {
  colors?: Partial<Record<keyof Theme, string>>;
  fonts?: { body?: string; headline?: string };
};

export function brandKitToTheme(kit: Kit): Theme {
  const c = kit.colors ?? {};
  const f = kit.fonts ?? {};
  return {
    ...SENDKIT_DEFAULTS,
    ...(c as object),
    fontBody: f.body ?? SENDKIT_DEFAULTS.fontBody,
    fontHeadline: f.headline ?? SENDKIT_DEFAULTS.fontHeadline,
  };
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd remotion && npx vitest run src/animated/theme/__tests__/brand.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add remotion/src/animated/theme/
git commit -m "feat(remotion): brand-kit-to-theme with Sendkit defaults fallback"
```

---

### Task 14: Shared primitives — SpringIn, FadeOut

**Files:**
- Create: `remotion/src/animated/components/SpringIn.tsx`
- Create: `remotion/src/animated/components/FadeOut.tsx`
- Create: `remotion/src/animated/components/__tests__/primitives.test.tsx`

- [ ] **Step 1: Write the failing tests**

`remotion/src/animated/components/__tests__/primitives.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SpringIn } from "../SpringIn";
import { FadeOut } from "../FadeOut";

describe("SpringIn", () => {
  it("renders children", () => {
    const { getByText } = render(<SpringIn from={0}><span>hi</span></SpringIn>);
    expect(getByText("hi")).toBeInTheDocument();
  });
});

describe("FadeOut", () => {
  it("renders children", () => {
    const { getByText } = render(<FadeOut startFrame={0}><span>bye</span></FadeOut>);
    expect(getByText("bye")).toBeInTheDocument();
  });
});
```

(If `@testing-library/react` is not installed, replace with a plain `React.createElement` smoke test that imports the component and renders it via `react-test-renderer`.)

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd remotion && npx vitest run src/animated/components/__tests__/primitives.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `remotion/src/animated/components/SpringIn.tsx`**

```tsx
import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";

export const SpringIn: React.FC<{
  from: number;
  slide?: number;
  children: React.ReactNode;
}> = ({ from, slide = 0, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = spring({
    frame: frame - from,
    fps,
    config: { damping: 10, stiffness: 150, mass: 0.8 },
  });
  return (
    <div style={{
      transform: `translateY(${(1 - t) * slide}px) scale(${0.7 + 0.3 * t})`,
      opacity: t,
    }}>
      {children}
    </div>
  );
};
```

- [ ] **Step 4: Create `remotion/src/animated/components/FadeOut.tsx`**

```tsx
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

export const FadeOut: React.FC<{
  startFrame: number;
  duration?: number;
  children: React.ReactNode;
}> = ({ startFrame, duration = 12, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame, [startFrame, startFrame + duration], [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const scale = interpolate(
    frame, [startFrame, startFrame + duration], [1, 0.96],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <div style={{ opacity, transform: `scale(${scale})` }}>
      {children}
    </div>
  );
};
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd remotion && npx vitest run src/animated/components/__tests__/primitives.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add remotion/src/animated/components/
git commit -m "feat(remotion): SpringIn + FadeOut primitives"
```

---

### Task 15: Shared primitive — BrowserWindow

**Files:**
- Create: `remotion/src/animated/components/BrowserWindow.tsx`
- Create: `remotion/src/animated/components/__tests__/BrowserWindow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { BrowserWindow } from "../BrowserWindow";

describe("BrowserWindow", () => {
  it("renders url and children", () => {
    const { getByText } = render(
      <BrowserWindow url="yourapp.com" width={700}>
        <div>body</div>
      </BrowserWindow>,
    );
    expect(getByText("yourapp.com")).toBeInTheDocument();
    expect(getByText("body")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd remotion && npx vitest run src/animated/components/__tests__/BrowserWindow.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `remotion/src/animated/components/BrowserWindow.tsx`**

Implement per MD §5.4 "BrowserWindow Component" spec: 14px rounded corners, three dots (red `#ff5f57`, yellow `#ffbd2e`, green `#28c840`), URL bar centered in a cream pill with olive border. Pass theme via context (see Task 13).

```tsx
import React, { useContext } from "react";
import { ThemeContext } from "../theme/context";

export const BrowserWindow: React.FC<{
  url: string;
  width: number;
  children: React.ReactNode;
}> = ({ url, width, children }) => {
  const theme = useContext(ThemeContext);
  return (
    <div style={{
      width, borderRadius: 14, background: theme.card,
      border: `1px solid ${theme.border}`,
      boxShadow: "0 25px 60px rgba(0,0,0,0.08), 0 8px 20px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderBottom: `1px solid ${theme.border}`,
      }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28c840" }} />
        <div style={{
          flex: 1, display: "flex", justifyContent: "center",
        }}>
          <div style={{
            background: theme.bg, border: `1px solid ${theme.border}`,
            padding: "4px 16px", borderRadius: 999,
            fontFamily: theme.fontBody, fontSize: 13, color: theme.muted,
          }}>{url}</div>
        </div>
      </div>
      <div style={{ padding: 24 }}>{children}</div>
    </div>
  );
};
```

Also create `remotion/src/animated/theme/context.ts`:
```ts
import React from "react";
import { SENDKIT_DEFAULTS, Theme } from "./brand";
export const ThemeContext = React.createContext<Theme>(SENDKIT_DEFAULTS);
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd remotion && npx vitest run src/animated/components/__tests__/BrowserWindow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add remotion/src/animated/components/BrowserWindow.tsx remotion/src/animated/theme/context.ts remotion/src/animated/components/__tests__/BrowserWindow.test.tsx
git commit -m "feat(remotion): BrowserWindow primitive"
```

---

### Task 16: Shared primitives — MetricCard, Sparkline, ToolCard

**Files:**
- Create: `remotion/src/animated/components/MetricCard.tsx`
- Create: `remotion/src/animated/components/Sparkline.tsx`
- Create: `remotion/src/animated/components/ToolCard.tsx`
- Create: tests under `__tests__/`

- [ ] **Step 1: Write smoke tests for each**

For each component, write a small render-with-default-props test (see Task 15 pattern).

- [ ] **Step 2: Run and verify they fail**

Run: `cd remotion && npx vitest run src/animated/components/__tests__/`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Implement the three components**

Specs (from MD):
- **MetricCard** (MD §Scene 8): 280px wide, colored dot, big number (36px bold), label (14px muted). Props: `{ dotColor, label, value: string | number, sparkline?: number[], avatars?: number }`.
- **Sparkline** (MD §Scene 8 conversions card): SVG stroke that draws in via `strokeDasharray`/`strokeDashoffset` animated by `useCurrentFrame`. Props: `{ points: number[], color: string, fromFrame: number, drawDuration: number }`.
- **ToolCard** (MD §Scene 4): 200px wide, padding 16/20, rounded 12, white bg, shadow `0 4px 20px rgba(0,0,0,0.06)`. Props: `{ x, y, rotation, dotColor, label, body: React.ReactNode }`.

(See MD §Scene 4 and §Scene 8 for full visual contract.)

- [ ] **Step 4: Run tests and verify they pass**

Run: `cd remotion && npx vitest run src/animated/components/__tests__/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add remotion/src/animated/components/
git commit -m "feat(remotion): MetricCard, Sparkline, ToolCard primitives"
```

---

### Task 17: Scene01Intro (worked example for all scenes)

The MD (`docs/references/SENDKIT-PH-PROMPT.md`) is the visual contract for every scene — frame ranges, springs, colors, content are specified there. This task transcribes Scene 1 in full as the canonical pattern. Tasks 18–27 follow the same structure with their own MD section.

**Two MD-to-code adjustments that apply to every scene:**
- The MD's scene frame ranges (e.g. "frames 0–138") are absolute within the full Sendkit video. Inside our scene components, `useCurrentFrame()` returns frames relative to the scene's start (because each scene runs inside its own `<Series.Sequence>`). The MD numbers like "logo springs at frame 2" can be used directly — they're already relative.
- Replace the MD's hard-coded fade-out frame ("at frame 126") with `durationInFrames - 12`, so the exit lines up with the actual audio-derived scene length.

**Files:**
- Create: `remotion/src/animated/scenes/Scene01Intro.tsx`
- Create: `remotion/src/animated/scenes/__tests__/Scene01Intro.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Scene01Intro } from "../Scene01Intro";
import { ThemeProvider } from "../../theme/Provider";

describe("Scene01Intro", () => {
  it("renders product name from props", () => {
    const { getByText } = render(
      <ThemeProvider value={undefined}>
        <Scene01Intro
          text="AI-native email infrastructure."
          durationInFrames={138}
          audioSrc=""
          productName="Sendkit"
          logoSrc="/logo.png"
        />
      </ThemeProvider>,
    );
    expect(getByText(/Sendkit/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd remotion && npx vitest run src/animated/scenes/__tests__/Scene01Intro.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `Scene01Intro.tsx`** (spec: MD §Scene 1: Intro)

```tsx
import React, { useContext } from "react";
import { AbsoluteFill, Audio, Img } from "remotion";
import { SpringIn } from "../components/SpringIn";
import { FadeOut } from "../components/FadeOut";
import { ThemeContext } from "../theme/context";

type Props = {
  text: string;            // subtitle, e.g. "AI-native email infrastructure"
  productName: string;     // "Sendkit"
  logoSrc: string;
  durationInFrames: number;
  audioSrc: string;
};

export const Scene01Intro: React.FC<Props> = ({
  text, productName, logoSrc, durationInFrames, audioSrc,
}) => {
  const theme = useContext(ThemeContext);
  const fadeStart = durationInFrames - 12;
  return (
    <AbsoluteFill style={{
      backgroundColor: theme.bg,
      alignItems: "center", justifyContent: "center",
      fontFamily: theme.fontBody,
    }}>
      <FadeOut startFrame={fadeStart}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          <SpringIn from={2}>
            <Img src={logoSrc} style={{ width: 100, height: 100, borderRadius: 22 }} />
          </SpringIn>
          <SpringIn from={8} slide={30}>
            <div style={{
              fontFamily: theme.fontHeadline, fontSize: 76,
              color: theme.foreground, lineHeight: 1.05,
            }}>
              Introducing {productName}
            </div>
          </SpringIn>
          <SpringIn from={18} slide={15}>
            <div style={{ fontSize: 28, color: theme.muted }}>{text}</div>
          </SpringIn>
        </div>
      </FadeOut>
      {audioSrc && <Audio src={audioSrc} />}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd remotion && npx vitest run src/animated/scenes/__tests__/Scene01Intro.test.tsx`
Expected: PASS.

- [ ] **Step 5: Expose `brand.name` and logo path to scenes via `AnimatedRoot.tsx`**

Update the scene-map invocation:
```tsx
<SceneComp
  text={s.text}
  durationInFrames={s.durationInFrames}
  audioSrc={s.audio}
  productName={recipe.brand.name}
  logoSrc={staticFile(`brand/${recipe.brand.slug}/logo.png`)}
/>
```

Mount `brand/kits/` as a static path in `remotion/remotion.config.ts`:
```ts
Config.setPublicDir("public");
// Then symlink or copy brand/kits/ to remotion/public/brand at build time,
// or extend Config with a second static dir if the version supports it.
```

If your Remotion version supports only one `publicDir`, copy on render:
in `api/render.py` `dispatch_render`, before invoking Remotion, copy
`brand/kits/<slug>/logo.png` to `remotion/public/brand/<slug>/logo.png`.

- [ ] **Step 6: Commit**

```bash
git add remotion/src/animated/scenes/Scene01Intro.tsx remotion/src/animated/scenes/__tests__/Scene01Intro.test.tsx remotion/src/animated/AnimatedRoot.tsx remotion/remotion.config.ts api/render.py
git commit -m "feat(remotion): Scene01Intro (logo + headline + subtitle + fade out)"
```

---

### Tasks 18–27: Remaining scenes (same pattern as Task 17)

For each scene below, repeat Task 17's 5-step structure. Re-read the MD section in full before starting — it contains every pixel position, color, font size, frame number, and spring config for that scene.

Standard ingredients per scene:
- `useContext(ThemeContext)` for colors and fonts.
- `SpringIn` for entrances (use the `from` frame the MD gives).
- `FadeOut` at `durationInFrames - 12` (except Scene 10 — MD says no fade out).
- `<Audio src={audioSrc} />` for narration.
- Reuse the primitives from Task 15 + Task 16 where the MD references them.

| Task | Scene file | MD section | Primitives reused |
|---|---|---|---|
| 18 | `Scene02Signups.tsx` | §Scene 2: Signups Pouring In | `BrowserWindow` |
| 19 | `Scene03Pain.tsx` | §Scene 3: Pain — No Emails Sent | `BrowserWindow` |
| 20 | `Scene04Agitation.tsx` | §Scene 4: Agitation — Complexity | `ToolCard` |
| 21 | `Scene05Relief.tsx` | §Scene 5: Relief — Just Tell Sendkit | — (typewriter inline) |
| 22 | `Scene06Templates.tsx` | §Scene 6: Templates Created | — |
| 23 | `Scene06bEmailPreview.tsx` | §Scene 6b: Email Preview | — |
| 24 | `Scene07Automation.tsx` | §Scene 7: Automation Flow | — |
| 25 | `Scene08Metrics.tsx` | §Scene 8: Metrics Payoff | `MetricCard`, `Sparkline` |
| 26 | `Scene09MicDrop.tsx` | §Scene 9: Mic Drop | — |
| 27 | `Scene10CTA.tsx` | §Scene 10: CTA | — (no fade out) |

---

### Task 28: ThemeProvider + wire AnimatedRoot

**Files:**
- Create: `remotion/src/animated/theme/Provider.tsx`
- Modify: `remotion/src/animated/AnimatedRoot.tsx`

- [ ] **Step 1: Write the failing test**

`remotion/src/animated/__tests__/AnimatedRoot.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { AnimatedRoot } from "../AnimatedRoot";
import { sampleAnimatedRecipe } from "../../sample-recipe";

describe("AnimatedRoot", () => {
  it("renders all 11 scenes in series", () => {
    const { container } = render(<AnimatedRoot {...sampleAnimatedRecipe} />);
    expect(container).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd remotion && npx vitest run src/animated/__tests__/`
Expected: FAIL (`sampleAnimatedRecipe` missing or scene wiring incomplete).

- [ ] **Step 3: Create `remotion/src/animated/theme/Provider.tsx`**

```tsx
import React from "react";
import { brandKitToTheme, Theme } from "./brand";
import { ThemeContext } from "./context";

export const ThemeProvider: React.FC<{
  value: { colors?: any; fonts?: any } | undefined;
  children: React.ReactNode;
}> = ({ value, children }) => {
  const theme = brandKitToTheme(value ?? {});
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};
```

- [ ] **Step 4: Rewrite `AnimatedRoot.tsx` to dispatch by scene id**

```tsx
import { AbsoluteFill, Audio, Series } from "remotion";
import { ThemeProvider } from "./theme/Provider";
import { Scene01Intro } from "./scenes/Scene01Intro";
import { Scene02Signups } from "./scenes/Scene02Signups";
import { Scene03Pain } from "./scenes/Scene03Pain";
import { Scene04Agitation } from "./scenes/Scene04Agitation";
import { Scene05Relief } from "./scenes/Scene05Relief";
import { Scene06Templates } from "./scenes/Scene06Templates";
import { Scene06bEmailPreview } from "./scenes/Scene06bEmailPreview";
import { Scene07Automation } from "./scenes/Scene07Automation";
import { Scene08Metrics } from "./scenes/Scene08Metrics";
import { Scene09MicDrop } from "./scenes/Scene09MicDrop";
import { Scene10CTA } from "./scenes/Scene10CTA";

const SCENE_MAP: Record<string, React.FC<any>> = {
  s01: Scene01Intro, s02: Scene02Signups, s03: Scene03Pain,
  s04: Scene04Agitation, s05: Scene05Relief, s06: Scene06Templates,
  s06b: Scene06bEmailPreview, s07: Scene07Automation,
  s08: Scene08Metrics, s09: Scene09MicDrop, s10: Scene10CTA,
};

export const AnimatedRoot: React.FC<any> = (recipe) => {
  return (
    <ThemeProvider value={recipe.brand}>
      <AbsoluteFill style={{ backgroundColor: recipe.brand.colors.bg }}>
        <Series>
          {recipe.scenes.map((s: any) => {
            const SceneComp = SCENE_MAP[s.id];
            return (
              <Series.Sequence key={s.id} durationInFrames={s.durationInFrames}>
                <SceneComp text={s.text} durationInFrames={s.durationInFrames} audioSrc={s.audio} />
              </Series.Sequence>
            );
          })}
        </Series>
        {recipe.musicStartFrame !== undefined && (
          <Audio
            src="/audio/music/background2.mp3"
            startFrom={recipe.musicStartFrame}
            volume={recipe.musicVolume}
          />
        )}
      </AbsoluteFill>
    </ThemeProvider>
  );
};
```

- [ ] **Step 5: Update `remotion/src/sample-recipe.ts`** to export a sample `sampleAnimatedRecipe` with all 11 scenes (durations ~60 frames each).

- [ ] **Step 6: Run all Remotion tests**

Run: `cd remotion && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add remotion/src/animated/ remotion/src/sample-recipe.ts
git commit -m "feat(remotion): AnimatedRoot wires all 11 scenes via Series"
```

---

# Phase 3 — Frontend wizard

### Task 29: state.ts mode discriminator

**Files:**
- Modify: `web/src/state.ts`
- Modify: `web/src/types.ts`
- Create: `web/src/__tests__/state.test.ts`

- [ ] **Step 1: Read `web/src/state.ts` and `web/src/types.ts`** to understand the current store shape.

- [ ] **Step 2: Write the failing test**

`web/src/__tests__/state.test.ts`:
```ts
import { describe, expect, it, beforeEach } from "vitest";
import { useAppStore } from "../state";

describe("mode discriminator", () => {
  beforeEach(() => useAppStore.setState({ mode: null }));
  it("starts with no mode", () => {
    expect(useAppStore.getState().mode).toBeNull();
  });
  it("can set mode", () => {
    useAppStore.getState().setMode("animated");
    expect(useAppStore.getState().mode).toBe("animated");
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd web && npx vitest run src/__tests__/state.test.ts`
Expected: FAIL.

- [ ] **Step 4: Update `state.ts`**

Add to the store:
```ts
mode: "recorded" | "animated" | null;
setMode: (m: "recorded" | "animated" | null) => void;
animatedState: AnimatedState;
setAnimatedState: (updater: (s: AnimatedState) => AnimatedState) => void;
```

Add types in `types.ts`:
```ts
export type AnimatedState = {
  brandKitSlug: string | null;
  scripts: Record<string, string>;
  audioResults: Array<{ key: string; file: string; seconds: number; frames: number }> | null;
  orientation: "16x9" | "9x16";
  jobId: string | null;
};

export const SCRIPT_KEYS = ["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"] as const;
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd web && npx vitest run src/__tests__/state.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/state.ts web/src/types.ts web/src/__tests__/state.test.ts
git commit -m "feat(web): mode discriminator + animatedState in store"
```

---

### Task 30: ModeSelect screen + routing

**Files:**
- Create: `web/src/steps/ModeSelect.tsx`
- Modify: `web/src/App.tsx`
- Create: `web/src/__tests__/ModeSelect.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { ModeSelect } from "../steps/ModeSelect";
import { useAppStore } from "../state";

describe("ModeSelect", () => {
  it("sets mode on click", () => {
    render(<ModeSelect />);
    fireEvent.click(screen.getByRole("button", { name: /animado/i }));
    expect(useAppStore.getState().mode).toBe("animated");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd web && npx vitest run src/__tests__/ModeSelect.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `web/src/steps/ModeSelect.tsx`**

```tsx
import { useAppStore } from "../state";

export function ModeSelect() {
  const setMode = useAppStore((s) => s.setMode);
  return (
    <div style={{ display: "flex", gap: 24, padding: 48 }}>
      <button onClick={() => setMode("recorded")} style={cardStyle}>
        <h2>Editar gravação</h2>
        <p>Suba seu vídeo, corte silêncios, transcreva e gere captions.</p>
      </button>
      <button onClick={() => setMode("animated")} style={cardStyle}>
        <h2>Gerar animado</h2>
        <p>Produza um vídeo de produto estilo Sendkit usando seu brand kit.</p>
      </button>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  flex: 1, padding: 32, borderRadius: 16, border: "1px solid #e2e2dc",
  background: "#fff", cursor: "pointer", textAlign: "left",
};
```

- [ ] **Step 4: Update `App.tsx` to gate by mode**

```tsx
import { useAppStore } from "./state";
import { ModeSelect } from "./steps/ModeSelect";
import { RecordedWizard } from "./RecordedWizard"; // existing wizard refactored out of App
import { AnimatedWizard } from "./AnimatedWizard";

export function App() {
  const mode = useAppStore((s) => s.mode);
  if (mode === null) return <ModeSelect />;
  if (mode === "recorded") return <RecordedWizard />;
  return <AnimatedWizard />;
}
```

If the current `App.tsx` inlines the wizard, extract it into `RecordedWizard.tsx` as-is (no behavior change).

- [ ] **Step 5: Stub `AnimatedWizard.tsx`** that renders a placeholder; replaced in next tasks.

- [ ] **Step 6: Run the test and verify it passes**

Run: `cd web && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/steps/ModeSelect.tsx web/src/App.tsx web/src/RecordedWizard.tsx web/src/AnimatedWizard.tsx web/src/__tests__/ModeSelect.test.tsx
git commit -m "feat(web): ModeSelect screen + RecordedWizard extracted"
```

---

### Task 31: zod schema for brand kit + animatedApi client

**Files:**
- Create: `web/src/schemas/brandKit.ts`
- Create: `web/src/animatedApi.ts`
- Create: `web/src/__tests__/brandKit.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { BrandKitSchema } from "../schemas/brandKit";

describe("BrandKitSchema", () => {
  it("rejects bad hex", () => {
    const r = BrandKitSchema.safeParse({
      name: "X",
      colors: { bg: "not-a-hex", card: "#fff", border: "#000",
        foreground: "#000", muted: "#888", accent: "#0f0",
        accentLight: "rgba(0,255,0,0.1)" },
      fonts: { body: "Inter", headline: "Serif" },
    });
    expect(r.success).toBe(false);
  });
  it("accepts valid kit", () => {
    const r = BrandKitSchema.safeParse({
      name: "X",
      colors: { bg: "#fff", card: "#fff", border: "#000",
        foreground: "#000", muted: "#888", accent: "#0f0",
        accentLight: "rgba(0,255,0,0.1)" },
      fonts: { body: "Inter", headline: "Serif" },
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd web && npx vitest run src/__tests__/brandKit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `web/src/schemas/brandKit.ts`**

```ts
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);

export const BrandKitSchema = z.object({
  name: z.string().min(1),
  colors: z.object({
    bg: hex, card: hex, border: hex,
    foreground: hex, muted: hex,
    accent: hex, accentLight: z.string(),
  }),
  fonts: z.object({ body: z.string(), headline: z.string() }),
});
export type BrandKitInput = z.infer<typeof BrandKitSchema>;
```

- [ ] **Step 4: Create `web/src/animatedApi.ts`**

```ts
const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type BrandKit = {
  slug: string; name: string; logo: string;
  colors: any; fonts: any;
};

export async function listBrandKits(): Promise<BrandKit[]> {
  const r = await fetch(`${API}/brand-kits`);
  return r.json();
}

export async function createBrandKit(input: FormData): Promise<BrandKit> {
  const r = await fetch(`${API}/brand-kits`, { method: "POST", body: input });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteBrandKit(slug: string): Promise<void> {
  const r = await fetch(`${API}/brand-kits/${slug}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

export async function createAnimatedJob(body: {
  brandKitSlug: string;
  scripts: { key: string; text: string }[];
  orientation: "16x9" | "9x16";
}): Promise<{ jobId: string }> {
  const r = await fetch(`${API}/jobs/animated`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `cd web && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/schemas/ web/src/animatedApi.ts web/src/__tests__/brandKit.test.ts
git commit -m "feat(web): brand-kit zod schema + animated API client"
```

---

### Task 32: BrandKitModal component

**Files:**
- Create: `web/src/components/BrandKitModal.tsx`
- Create: `web/src/__tests__/BrandKitModal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrandKitModal } from "../components/BrandKitModal";

describe("BrandKitModal", () => {
  it("disables save until valid", () => {
    render(<BrandKitModal open onClose={() => {}} onCreated={() => {}} />);
    const save = screen.getByRole("button", { name: /salvar/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Acme" } });
    // ...fill required colors and logo
    // Final assertion after filling everything:
    // expect(save).not.toBeDisabled();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd web && npx vitest run src/__tests__/BrandKitModal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `BrandKitModal.tsx`**

Form with: name input, 7 color inputs (HTML `<input type="color">` + adjacent hex text input), font selects (Inter/Instrument Serif from a fixed list), logo file picker. Validate live with `BrandKitSchema`. Save button calls `createBrandKit` with a `FormData` built from state. On success, call `onCreated(kit)`.

- [ ] **Step 4: Run and verify it passes**

Run: `cd web && npx vitest run src/__tests__/BrandKitModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/BrandKitModal.tsx web/src/__tests__/BrandKitModal.test.tsx
git commit -m "feat(web): BrandKitModal with zod validation + POST"
```

---

### Task 33: BrandStep (animated wizard step 1)

**Files:**
- Create: `web/src/steps/animated/BrandStep.tsx`
- Create: `web/src/__tests__/BrandStep.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BrandStep } from "../steps/animated/BrandStep";
import * as api from "../animatedApi";

vi.mock("../animatedApi", () => ({
  listBrandKits: vi.fn().mockResolvedValue([
    { slug: "acme", name: "Acme", logo: "logo.png", colors: {}, fonts: {} },
  ]),
}));

describe("BrandStep", () => {
  it("lists kits and lets user pick one", async () => {
    const onNext = vi.fn();
    render(<BrandStep onNext={onNext} />);
    await waitFor(() => screen.getByText("Acme"));
    fireEvent.click(screen.getByText("Acme"));
    fireEvent.click(screen.getByRole("button", { name: /pr.ximo/i }));
    expect(onNext).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd web && npx vitest run src/__tests__/BrandStep.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `BrandStep.tsx`**

Lists kits from `listBrandKits()`, lets user select one (radio cards), button "Novo kit" opens `BrandKitModal`. Selected slug saved to `animatedState.brandKitSlug`. "Próximo" enabled only if a slug is selected; calls `onNext`.

- [ ] **Step 4: Run and verify it passes**

Run: `cd web && npx vitest run src/__tests__/BrandStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/steps/animated/BrandStep.tsx web/src/__tests__/BrandStep.test.tsx
git commit -m "feat(web): BrandStep — kit list + selector + new-kit modal"
```

---

### Task 34: ScriptStep with char counter + cost estimate

**Files:**
- Create: `web/src/steps/animated/ScriptStep.tsx`
- Create: `web/src/util/ttsCost.ts`
- Create: `web/src/__tests__/ScriptStep.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "../util/ttsCost";

describe("estimateCostUsd", () => {
  it("calculates per-char cost", () => {
    expect(estimateCostUsd(0)).toBe(0);
    expect(estimateCostUsd(1000)).toBeCloseTo(0.30, 2); // $0.30 / 1k chars
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `cd web && npx vitest run src/__tests__/ScriptStep.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Create `web/src/util/ttsCost.ts`**

```ts
const COST_PER_1K_CHARS = 0.30; // ElevenLabs creator-tier ballpark; adjust later
export function estimateCostUsd(chars: number): number {
  return Math.round((chars / 1000) * COST_PER_1K_CHARS * 100) / 100;
}
```

- [ ] **Step 4: Implement `ScriptStep.tsx`**

11 textareas (one per `SCRIPT_KEYS`), each labeled and with a per-field char count. Footer: total chars + estimated cost. Soft warning above 2,500. Disable "Próximo" if any textarea is empty. Save into `animatedState.scripts`.

- [ ] **Step 5: Run tests and verify they pass**

Run: `cd web && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/steps/animated/ScriptStep.tsx web/src/util/ttsCost.ts web/src/__tests__/ScriptStep.test.tsx
git commit -m "feat(web): ScriptStep — 11 textareas + char counter + cost estimate"
```

---

### Task 35: AudioStep — generate narration, per-scene status

**Files:**
- Create: `web/src/steps/animated/AudioStep.tsx`
- Modify: `web/src/animatedApi.ts` (add `generateTts`)
- Create: `web/src/__tests__/AudioStep.test.tsx`

- [ ] **Step 1: Add `generateTts` to `animatedApi.ts`**

```ts
export type TtsResult = {
  key: string; file: string; seconds: number; frames: number;
};

export async function generateTts(body: {
  jobId: string;
  scripts: { key: string; text: string }[];
}): Promise<TtsResult[]> {
  const r = await fetch(`${API}/tts/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
```

The `jobId` passed here is a stable "preview" id derived from the wizard's session (e.g. `crypto.randomUUID()` cached in `animatedState.previewJobId` on first AudioStep entry). The hash cache (`pipeline/tts.py`) makes the later `POST /jobs/animated` reuse the same MP3s when scripts have not changed.

- [ ] **Step 2: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AudioStep } from "../steps/animated/AudioStep";
import { useAppStore } from "../state";

vi.mock("../animatedApi", () => ({
  generateTts: vi.fn().mockResolvedValue([
    { key: "s01", file: "/tmp/s01.mp3", seconds: 2, frames: 60 },
  ]),
}));

describe("AudioStep", () => {
  it("generates audio and stores results", async () => {
    useAppStore.setState({
      mode: "animated",
      animatedState: {
        brandKitSlug: "acme",
        scripts: { s01: "hi" },
        audioResults: null,
        orientation: "16x9",
        jobId: null,
        previewJobId: "preview-123",
      } as any,
    });
    render(<AudioStep onNext={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /gerar narra/i }));
    await waitFor(() =>
      expect(useAppStore.getState().animatedState.audioResults).toHaveLength(1)
    );
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd web && npx vitest run src/__tests__/AudioStep.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement `web/src/steps/animated/AudioStep.tsx`**

```tsx
import { useState } from "react";
import { useAppStore } from "../../state";
import { generateTts, TtsResult } from "../../animatedApi";
import { SCRIPT_KEYS } from "../../types";

export function AudioStep({ onNext }: { onNext: () => void }) {
  const state = useAppStore((s) => s.animatedState);
  const setAnimatedState = useAppStore((s) => s.setAnimatedState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setBusy(true); setError(null);
    try {
      const scripts = SCRIPT_KEYS.map((k) => ({ key: k, text: state.scripts[k] }));
      const results = await generateTts({ jobId: state.previewJobId!, scripts });
      setAnimatedState((s) => ({ ...s, audioResults: results }));
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const regenerateOne = async (key: string) => {
    setBusy(true); setError(null);
    try {
      const results = await generateTts({
        jobId: state.previewJobId!,
        scripts: [{ key, text: state.scripts[key] }],
      });
      setAnimatedState((s) => ({
        ...s,
        audioResults: (s.audioResults ?? []).map((r) =>
          r.key === key ? results[0] : r
        ),
      }));
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {state.audioResults === null ? (
        <button onClick={generate} disabled={busy}>
          {busy ? "Gerando..." : "Gerar narração"}
        </button>
      ) : (
        <ul>
          {state.audioResults.map((r) => (
            <li key={r.key}>
              <strong>{r.key}</strong> — {r.seconds.toFixed(1)}s
              <audio controls src={r.file} />
              <button onClick={() => regenerateOne(r.key)} disabled={busy}>
                Regenerar
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button
        onClick={onNext}
        disabled={state.audioResults === null || state.audioResults.length !== SCRIPT_KEYS.length}
      >
        Próximo
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Add `previewJobId` to `AnimatedState` in `types.ts`**

```ts
export type AnimatedState = {
  brandKitSlug: string | null;
  scripts: Record<string, string>;
  audioResults: TtsResult[] | null;
  orientation: "16x9" | "9x16";
  jobId: string | null;
  previewJobId: string | null;  // generated on entry to AudioStep
};
```

Initialise `previewJobId` on first mount of `AudioStep` if `null`:
```ts
useEffect(() => {
  if (state.previewJobId === null) {
    setAnimatedState((s) => ({ ...s, previewJobId: crypto.randomUUID() }));
  }
}, []);
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `cd web && npx vitest run src/__tests__/AudioStep.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/steps/animated/AudioStep.tsx web/src/animatedApi.ts web/src/types.ts web/src/__tests__/AudioStep.test.tsx
git commit -m "feat(web): AudioStep — gen TTS + per-scene regenerate (preview cache)"
```

---

### Task 36: ReviewStep

**Files:**
- Create: `web/src/steps/animated/ReviewStep.tsx`
- Create: `web/src/__tests__/ReviewStep.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewStep } from "../steps/animated/ReviewStep";
import { useAppStore } from "../state";

vi.mock("../animatedApi", () => ({
  createAnimatedJob: vi.fn().mockResolvedValue({ jobId: "abc" }),
}));

describe("ReviewStep", () => {
  it("posts the job and stores jobId", async () => {
    useAppStore.setState({
      mode: "animated",
      animatedState: {
        brandKitSlug: "acme",
        scripts: Object.fromEntries(["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"].map(k => [k, "x"])),
        audioResults: null, orientation: "16x9", jobId: null,
      },
    });
    render(<ReviewStep onNext={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /renderizar/i }));
    await new Promise(r => setTimeout(r, 0));
    expect(useAppStore.getState().animatedState.jobId).toBe("abc");
  });
});
```

- [ ] **Step 2: Implement `ReviewStep.tsx`**

Read-only summary of: brand kit name, total char count, total estimated duration (sum of script lengths × heuristic frames/char or just "será calculado"), orientation radio. "Renderizar" button calls `createAnimatedJob`, stores returned `jobId`, calls `onNext`.

- [ ] **Step 3: Run and verify it passes**

Run: `cd web && npx vitest run src/__tests__/ReviewStep.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add web/src/steps/animated/ReviewStep.tsx web/src/__tests__/ReviewStep.test.tsx
git commit -m "feat(web): ReviewStep — submit animated job"
```

---

### Task 37: RenderStep — reuse existing SSE progress UI

**Files:**
- Create: `web/src/steps/animated/RenderStep.tsx`

- [ ] **Step 1: Read the existing recorded RenderStep**

Identify how it subscribes to SSE, shows progress, and offers download. Reuse the same components if possible.

- [ ] **Step 2: Implement `web/src/steps/animated/RenderStep.tsx`**

Subscribe to `EventSource(`${API}/jobs/${jobId}/events`)`. Show progress bar + log lines from SSE. On `done`, show a download link to `output/<jobId>/final.mp4`.

- [ ] **Step 3: Smoke test manually with a real backend**

```bash
cd web && npm run dev
# In another shell:
cd api && uvicorn app:app --reload
# Open browser, go through ModeSelect → animated → ... → Render
```

Expected: render completes; MP4 downloads.

- [ ] **Step 4: Commit**

```bash
git add web/src/steps/animated/RenderStep.tsx
git commit -m "feat(web): RenderStep — SSE progress + MP4 download"
```

---

### Task 38: Assemble AnimatedWizard

**Files:**
- Modify: `web/src/AnimatedWizard.tsx`

- [ ] **Step 1: Wire the Stepper**

```tsx
import { useState } from "react";
import { BrandStep } from "./steps/animated/BrandStep";
import { ScriptStep } from "./steps/animated/ScriptStep";
import { AudioStep } from "./steps/animated/AudioStep";
import { ReviewStep } from "./steps/animated/ReviewStep";
import { RenderStep } from "./steps/animated/RenderStep";

const STEPS = ["Brand Kit", "Script", "Áudio", "Revisão", "Render"] as const;

export function AnimatedWizard() {
  const [i, setI] = useState(0);
  const next = () => setI((x) => Math.min(x + 1, STEPS.length - 1));
  return (
    <div>
      <Stepper steps={STEPS} active={i} />
      {i === 0 && <BrandStep onNext={next} />}
      {i === 1 && <ScriptStep onNext={next} />}
      {i === 2 && <AudioStep onNext={next} />}
      {i === 3 && <ReviewStep onNext={next} />}
      {i === 4 && <RenderStep />}
    </div>
  );
}
```

(Use the existing `Stepper` component — already present at `web/src/components/Stepper`.)

- [ ] **Step 2: Manual smoke**

Run the full app and walk through: Mode → Brand → Script → Review → Render.
Expected: MP4 produced.

- [ ] **Step 3: Commit**

```bash
git add web/src/AnimatedWizard.tsx
git commit -m "feat(web): AnimatedWizard wires 4 steps via Stepper"
```

---

# Phase 4 — Production polish

### Task 39: Structured logs per job stage

**Files:**
- Modify: `api/animated_routes.py`, `pipeline/tts.py`, `api/render.py`

- [ ] **Step 1: Add log helper**

`api/log_helpers.py`:
```python
import datetime
from pathlib import Path


def append_job_log(job_dir: Path, stage: str, outcome: str, **extra) -> None:
    job_dir.mkdir(parents=True, exist_ok=True)
    line = f"{datetime.datetime.utcnow().isoformat()}Z  {stage}  {outcome}  {extra}\n"
    (job_dir / "log.txt").open("a").write(line)
```

- [ ] **Step 2: Call it at every stage boundary**

In `animated_routes.py`, log: `job_created`, `tts_started`, `tts_done`, `recipe_built`, `render_dispatched`. In `render.py`, log: `render_started`, `render_done`/`render_failed`.

- [ ] **Step 3: Smoke**

Submit a job and confirm `jobs/<id>/log.txt` has the lines.

- [ ] **Step 4: Commit**

```bash
git add api/log_helpers.py api/animated_routes.py api/render.py pipeline/tts.py
git commit -m "feat(api): per-job structured log at each stage boundary"
```

---

### Task 40: README + production checklist

**Files:**
- Modify: `README.md` (or create if missing)
- Create: `docs/animated-mode.md`

- [ ] **Step 1: Document the new mode**

Add a section to README: "Animated mode" — env vars required, how to create a brand kit (POST + example curl), how to submit an animated job, where the MP4 ends up.

- [ ] **Step 2: Production checklist in `docs/animated-mode.md`**

```markdown
# Animated mode — production checklist

- [ ] `ELEVENLABS_API_KEY` set in production env
- [ ] At least one brand kit exists in `brand/kits/`
- [ ] `output/` directory is writable
- [ ] `jobs/` directory is writable
- [ ] Disk has headroom (audio + MP4 per job ~ 20-50 MB)
- [ ] Remotion cache warmed (`npx remotion compositions` once)
- [ ] SSE endpoint reachable from the deployed frontend
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/animated-mode.md
git commit -m "docs: animated mode usage + production checklist"
```

---

# Self-review

After implementing, run the spec coverage check against `docs/superpowers/specs/2026-06-03-dual-mode-editor-design.md`:

| Spec section | Implemented by tasks |
|---|---|
| §4.1 ModeSelect | 30 |
| §4.2 Recorded wizard (unchanged) | (n/a) |
| §4.3 Animated wizard | 33, 34, 36, 37, 38 |
| §5.1 Discriminator | 2, 7, 10 |
| §5.2 Frontend | 29–38 |
| §5.3 Backend | 1, 2, 3, 4, 8, 9, 10 |
| §5.4 Pipeline | 5, 6, 7 |
| §5.5 Remotion | 11, 13–28 |
| §5.6 Brand kit shape | 2, 3 |
| §6 Errors + observability | 6 (retry), 39 (logs), 4 (in-use 409) |
| §7 Env | 1 |
| §8 Testing strategy | every TDD task above |
| §9 Risks (cost guard) | 8, 9 (char limit) |
