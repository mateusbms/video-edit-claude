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

def composition_id_for(recipe: dict) -> str:
    """Return the Remotion composition ID for a recipe dict.

    If *kind* is absent the recipe is treated as ``"recorded"`` (legacy
    behaviour).  Raises ``ValueError`` for unknown (kind, orientation) pairs.
    """
    kind = recipe.get("kind", "recorded")
    orientation = recipe["orientation"]
    key = (kind, orientation)
    if key not in COMPOSITION_MAP:
        raise ValueError(f"No composition for {key!r}")
    return COMPOSITION_MAP[key]


async def dispatch_render(
    job_id: str,
    recipe: dict,
    out_path: Path,
    props_path: Path,
    remotion_dir: Path,
    env: dict,
):
    """Await the full Remotion render and push SSE events into the job's progress queue.

    Progress events are published to the per-job asyncio.Queue stored in
    ``JOB_QUEUES[job_id]``.  Callers should create the queue *before* calling
    this coroutine so that any consumer (SSE endpoint) can start reading
    immediately.
    """
    from api.job_queues import JOB_QUEUES, sse_event_dict  # local import avoids circular

    q = JOB_QUEUES.setdefault(job_id, asyncio.Queue())

    composition = composition_id_for(recipe)
    try:
        proc = await run_remotion(
            composition=composition,
            out_path=out_path,
            props_path=props_path,
            remotion_dir=remotion_dir,
            env=env,
        )
    except Exception as exc:
        await q.put(sse_event_dict("error", {"detail": str(exc)}))
        return

    from collections import deque
    tail: deque[str] = deque(maxlen=15)
    while True:
        raw = await proc.stdout.readline()
        if not raw:
            break
        line = raw.decode(errors="ignore").strip()
        if not line:
            continue
        p = parse_progress(line)
        if p:
            kind, n, total = p
            await q.put(sse_event_dict("progress", {"kind": kind, "n": n, "total": total}))
        else:
            tail.append(line)

    rc = await proc.wait()
    if rc != 0:
        await q.put(sse_event_dict("error", {
            "detail": f"render retornou {rc}",
            "log": "\n".join(tail),
        }))
    else:
        await q.put(sse_event_dict("done", {"ok": True}))


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
