import asyncio
import re
from pathlib import Path

PROG_RE = re.compile(r"^(Rendered|Encoded)\s+(\d+)/(\d+)")


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
