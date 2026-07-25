import asyncio

from pipeline.silence import parse_ffmpeg_progress
from api.progress import run_with_progress


def test_parse_ffmpeg_progress():
    assert parse_ffmpeg_progress("out_time_us=1500000") == 1.5
    assert parse_ffmpeg_progress("out_time_us=N/A") is None
    assert parse_ffmpeg_progress("frame=10") is None


def test_run_with_progress_emits_progress_then_done():
    def work(cb):
        cb(1, 4)
        cb(2, 4)
        return {"result": 42}

    async def collect():
        out = []
        async for chunk in run_with_progress(work):
            out.append(chunk)
        return out

    joined = "".join(asyncio.run(collect()))
    assert "event: progress" in joined
    assert '"n": 1' in joined
    assert "event: done" in joined
    assert '"result": 42' in joined


def test_run_with_progress_reports_errors():
    def work(cb):
        raise RuntimeError("boom")

    async def collect():
        return [c async for c in run_with_progress(work)]

    joined = "".join(asyncio.run(collect()))
    assert "event: error" in joined
    assert "boom" in joined
