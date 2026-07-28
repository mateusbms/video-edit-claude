"""Orientação do job e tamanhos de frame.

Fonte única de verdade: 1920/1080 e 1080/1920 aparecem aqui e no espelho
web (web/src/frame.ts), em nenhum outro lugar. O preview e o render usam a
mesma largura de canvas, que é o que mantém os dois fiéis entre si.
"""

# largura, altura de cada orientação de saída
FRAME_SIZES: dict[str, tuple[int, int]] = {
    "16x9": (1920, 1080),
    "9x16": (1080, 1920),
}

# nome da chave em recipe["formats"] e nos eventos SSE de progresso
FORMAT_KEYS: dict[str, str] = {
    "16x9": "main16x9",
    "9x16": "vertical9x16",
}

DEFAULT_ORIENTATION = "16x9"


def orientation_from_probe(width: int, height: int) -> str:
    """Orientação implícita nas dimensões do vídeo-fonte. Quadrado conta como 16x9."""
    return "16x9" if width >= height else "9x16"


def resolve_orientation(configured: str, probe: dict | None) -> str:
    """Orientação efetiva do job.

    Um valor válido em *configured* (escolha explícita do usuário) sempre vence.
    Vazio ou inválido significa "auto": deriva do probe. Sem probe utilizável,
    cai no padrão 16x9.
    """
    if configured in FRAME_SIZES:
        return configured
    if probe:
        w = probe.get("width") or 0
        h = probe.get("height") or 0
        if w > 0 and h > 0:
            return orientation_from_probe(w, h)
    return DEFAULT_ORIENTATION


def frame_size(orientation: str) -> tuple[int, int]:
    """(largura, altura) do canvas de render para a orientação."""
    return FRAME_SIZES.get(orientation, FRAME_SIZES[DEFAULT_ORIENTATION])
