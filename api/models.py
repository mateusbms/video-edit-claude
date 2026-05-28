from pydantic import BaseModel, Field


class ProbeOut(BaseModel):
    width: int
    height: int
    fps: float
    duration: float


class CutParams(BaseModel):
    silence_threshold_db: float = -30.0
    padding: float = 0.1
    min_silence: float = 0.5


class TranscribeParams(BaseModel):
    model_size: str = "small"  # tiny|base|small|medium
    language: str = "pt"


class WordOut(BaseModel):
    word: str
    start: float
    end: float


class CaptionLine(BaseModel):
    text: str
    start: float
    end: float
    words: list[WordOut]


class Hook(BaseModel):
    title: str
    subtitle: str = ""
    duration_frames: int = 90


class CutSegmentOut(BaseModel):
    start: float
    end: float


class CutResult(BaseModel):
    original_duration: float
    trimmed_duration: float
    segments: list[CutSegmentOut]


class JobState(BaseModel):
    slug: str
    probe: ProbeOut | None = None
    config: CutParams = Field(default_factory=CutParams)
    has_trimmed: bool = False
    has_transcript: bool = False
    has_hook: bool = False
    has_recipe: bool = False
    has_render_16x9: bool = False
    has_render_9x16: bool = False
