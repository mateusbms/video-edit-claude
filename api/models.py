from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints


RenderFormat = Literal["main16x9", "vertical9x16"]

Hex = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{3,8}$")]


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
    model_size: str = "base"  # tiny|base|small|medium
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


class RefineParams(BaseModel):
    remove: list[CutSegmentOut] = Field(default_factory=list)


class RenderParams(BaseModel):
    formats: list[RenderFormat] = Field(default_factory=lambda: ["main16x9", "vertical9x16"])


class CaptionStyleParams(BaseModel):
    fontSize: int = 48
    bottom: int = 120
    color: str = ""
    highlightColor: str = ""
    fontFamily: str = ""


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
    captionStyle: dict | None = None
    brandKitSlug: str = ""


ScriptKey = Literal["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"]


class BrandColors(BaseModel):
    bg: Hex
    card: Hex
    border: Hex
    foreground: Hex
    muted: Hex
    accent: Hex
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
    scenes: list[Scene] = Field(min_length=1)
    musicStartFrame: int = 45
    musicVolume: float = 0.15
