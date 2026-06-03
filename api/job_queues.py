"""Shared in-memory queues for per-job SSE progress events.

Each animated render task puts sse_event_dict items into JOB_QUEUES[job_id].
The SSE endpoint reads from that queue and streams events to the frontend.
"""
import asyncio
import json
from typing import Any

# job_id -> asyncio.Queue of {"event": str, "data": str} dicts
JOB_QUEUES: dict[str, asyncio.Queue] = {}

_SENTINEL = object()  # signals the SSE generator to stop


def sse_event_dict(event: str, data: Any) -> dict:
    payload = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
    return {"event": event, "data": payload}


def sse_format(item: dict) -> str:
    """Convert a queue item to raw SSE wire format."""
    return f"event: {item['event']}\ndata: {item['data']}\n\n"
