import asyncio
import re
from pathlib import Path

PROG_RE = re.compile(r"^(Rendered|Encoded)\s+(\d+)/(\d+)")

# Logical composition names returned by composition_id_for.
COMPOSITION_MAP = {
    ("recorded", "16x9"): "Recorded16x9",
    ("recorded", "9x16"): "Recorded9x16",
    ("animated", "16x9"): "Animated16x9",
    ("animated", "9x16"): "Animated9x16",
}

# Alias to map logical names → existing Remotion composition IDs until T11
# renames the Remotion-side compositions to match the logical names.
LEGACY_COMPOSITION_ALIAS: dict[str, str] = {
    "Recorded16x9": "Main16x9",
    "Recorded9x16": "Vertical9x16",
    # Animated compositions will be introduced in T11; no alias needed yet.
}


def composition_id_for(recipe: dict) -> str:
    """Return the logical composition ID for a recipe dict.

    If *kind* is absent the recipe is treated as ``"recorded"`` (legacy
    behaviour).  Raises ``ValueError`` for unknown (kind, orientation) pairs.
    """
    kind = recipe.get("kind", "recorded")
    orientation = recipe["orientation"]
    key = (kind, orientation)
    if key not in COMPOSITION_MAP:
        raise ValueError(f"No composition for {key!r}")
    return COMPOSITION_MAP[key]


def _remotion_composition(logical: str) -> str:
    """Translate a logical composition name to the actual Remotion-side ID.

    Once T11 renames the Remotion compositions the alias dict becomes empty
    and this function is a no-op.
    """
    return LEGACY_COMPOSITION_ALIAS.get(logical, logical)


def dispatch_render(
    job_id: str,
    recipe: dict,
    out_path: Path,
    props_path: Path,
    remotion_dir: Path,
    env: dict,
):
    """Async coroutine: resolve composition from recipe, then call run_remotion."""
    logical = composition_id_for(recipe)
    composition = _remotion_composition(logical)
    return run_remotion(
        composition=composition,
        out_path=out_path,
        props_path=props_path,
        remotion_dir=remotion_dir,
        env=env,
    )


def parse_progress(line: str):
    m = PROG_RE.match(line.strip())
    if not m:
        return None
    kind = m.group(1).lower()
    return (kind, int(m.group(2)), int(m.group(3)))


async def run_remotion(
    composition: str,
    out_path: Path,
    props_path: Path,
    remotion_dir: Path,
    env: dict,
):
    cmd = ["npx", "remotion", "render", composition, str(out_path), f"--props={props_path}"]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(remotion_dir),
        env=env,
    )
    return proc


async def run_remotion_still(
    composition: str,
    out_path: Path,
    frame: int,
    props_path: Path,
    remotion_dir: Path,
    env: dict,
):
    cmd = [
        "npx", "remotion", "still", composition, str(out_path),
        f"--frame={frame}", f"--props={props_path}",
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=str(remotion_dir),
        env=env,
    )
    await proc.wait()
    return proc
