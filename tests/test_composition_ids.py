import re
from pathlib import Path


def _registered_ids() -> set[str]:
    root = Path(__file__).resolve().parents[1] / "remotion" / "src" / "Root.tsx"
    text = root.read_text(encoding="utf-8")
    return set(re.findall(r'id="([^"]+)"', text))


def test_api_composition_ids_exist_in_remotion_root():
    """Toda composição que a API manda o Remotion renderizar precisa existir no
    Root.tsx. Pega drift como o rename Main16x9 -> Recorded16x9 que quebrou o render."""
    from api.routes import FORMAT_MAP
    from api.render import COMPOSITION_MAP

    registered = _registered_ids()
    assert registered, "não encontrei nenhum id no Root.tsx"

    api_ids = {v[0] for v in FORMAT_MAP.values()} | set(COMPOSITION_MAP.values())
    missing = api_ids - registered
    assert not missing, (
        f"composições referenciadas pela API não existem no Root.tsx: {sorted(missing)}; "
        f"registradas: {sorted(registered)}"
    )
