from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

# Fonte única dos padrões do editor: o mesmo valor que o render usa quando o
# job não escolheu nada (pipeline/recipe.py).
from pipeline.recipe import DEFAULT_HOOK_COLOR, DEFAULT_HOOK_FONT, DEFAULT_HOOK_FRAMES

DEFAULT_TEXT_FONT = "Plus Jakarta Sans"
DEFAULT_TEXT_FRAMES = 120


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
    duration_frames: int = DEFAULT_HOOK_FRAMES
    x: float = 0.5
    y: float = 0.16
    fontSize: int = 84
    fontFamily: str = DEFAULT_HOOK_FONT
    color: str = DEFAULT_HOOK_COLOR
    anchor: Literal["center", "left", "right"] = "center"
    maxWidthPct: int = 80


class CutSegmentOut(BaseModel):
    start: float
    end: float


class CutResult(BaseModel):
    original_duration: float
    trimmed_duration: float
    segments: list[CutSegmentOut]
    # mtime do trimmed.mp4. O corte e o refino reescrevem esse arquivo no mesmo
    # caminho, então a URL sozinha não distingue as versões: sem isto o preview
    # pode montar pedaços em cache do vídeo antigo com o novo. O front usa como
    # `?v=` — muda exatamente quando o arquivo muda, e é estável entre remontagens.
    trimmed_mtime: float = 0.0


class RefineParams(BaseModel):
    remove: list[CutSegmentOut] = Field(default_factory=list)


class CaptionStyleParams(BaseModel):
    fontSize: int = 48
    bottom: int = 120
    color: str = ""
    highlightColor: str = ""
    fontFamily: str = ""


class OrientationParams(BaseModel):
    # "" = auto (deriva do probe)
    orientation: Literal["16x9", "9x16", ""] = ""


class TitleParams(BaseModel):
    title: str = ""


OverlayAnim = Literal["fade", "slide-up", "slide-down", "pop", "none"]
# aceita hex (#rgb..#rrggbbaa) OU string vazia (=> usa cor da marca)
HexOrEmpty = Annotated[str, StringConstraints(pattern=r"^(#[0-9a-fA-F]{3,8})?$")]


class OverlayParams(BaseModel):
    id: str = ""
    type: str = "text"
    text: str
    fromFrame: int
    durationInFrames: int
    x: float = 0.5
    y: float = 0.18
    anchor: Literal["center", "left", "right"] = "center"
    fontSize: int = 64
    maxWidthPct: int = 80
    color: HexOrEmpty = ""
    highlightColor: HexOrEmpty = ""
    fontFamily: str = ""
    enter: OverlayAnim = "slide-up"
    exit: OverlayAnim = "fade"
    enterDurationInFrames: int = 12
    exitDurationInFrames: int = 12


class Suggestion(BaseModel):
    id: str = ""
    text: str
    fromFrame: int
    durationInFrames: int
    kind: Literal["short", "dense"] = "short"
    angle: str = ""
    source: str = ""


class SuggestDefaults(BaseModel):
    """Molde dos textos do passo 5: vale para o `+ Texto` e para toda sugestão
    aplicada. Depois de criado, cada overlay é editado individualmente."""

    x: float = 0.5
    y: float = 0.12
    anchor: Literal["center", "left", "right"] = "center"
    fontSize: int = 64
    fontFamily: str = DEFAULT_TEXT_FONT
    color: HexOrEmpty = ""
    enter: OverlayAnim = "slide-up"
    exit: OverlayAnim = "fade"
    # 4s a 30fps — a permanência é gravada em frames, então em outro fps o
    # painel mostra o equivalente em segundos desse fps.
    durationInFrames: int = DEFAULT_TEXT_FRAMES
    maxWidthPct: int = 80


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
    captionStyle: dict | None = None  # cru, como está no job.config (=> "" segue a marca)
    captionStyleResolved: dict | None = None  # com o brand kit aplicado (o que o render usa)
    brandKitSlug: str = ""
    orientation: str = "16x9"  # efetiva (já resolvida); nunca vazia


class JobSummary(BaseModel):
    """Um projeto na tela de lista. Só o que a lista precisa mostrar."""
    slug: str
    title: str = ""
    updated_at: float = 0.0
    orientation: str = "16x9"
    has_source: bool = False
    has_trimmed: bool = False
    has_transcript: bool = False
    has_hook: bool = False
    has_recipe: bool = False
    has_render_16x9: bool = False
    has_render_9x16: bool = False
    bytes_source: int = 0
    bytes_total: int = 0
    # renders exportados em output/. Ficam separados de bytes_total porque
    # sobrevivem a apagar o projeto — a tela precisa dizer isso ao confirmar.
    bytes_render: int = 0


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
