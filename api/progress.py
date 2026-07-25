import asyncio
from typing import Any, Callable

from api.sse import sse_event


async def run_with_progress(blocking_fn: Callable[[Callable[[float, float], None]], Any]):
    """Roda blocking_fn(progress_cb) numa thread, emitindo eventos SSE.
    progress_cb(n, total) -> evento 'progress'. Retorno de blocking_fn -> 'done'.
    Exceção -> 'error'."""
    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def progress_cb(n: float, total: float) -> None:
        loop.call_soon_threadsafe(
            queue.put_nowait, ("progress", {"n": round(n, 3), "total": round(total, 3)})
        )

    def worker() -> None:
        try:
            result = blocking_fn(progress_cb)
            payload = result if result is not None else {"ok": True}
            loop.call_soon_threadsafe(queue.put_nowait, ("done", payload))
        except Exception as exc:  # noqa: BLE001
            loop.call_soon_threadsafe(queue.put_nowait, ("error", {"detail": str(exc)}))
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    loop.run_in_executor(None, worker)

    while True:
        item = await queue.get()
        if item is None:
            break
        event, data = item
        yield sse_event(event, data)
