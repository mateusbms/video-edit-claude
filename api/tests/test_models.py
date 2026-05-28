from api.models import JobState, CutParams, Hook, CaptionLine, WordOut


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
