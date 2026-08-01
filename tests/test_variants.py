"""Golden do deslocamento — a única matemática nova das variações de hook.
Errar aqui é ressuscitar a corrupção silenciosa de legendas (spec 2026-08-01)."""
from pipeline.variants import deslocar_overlays, fundir_transcricoes


def _linha(texto, start, end):
    return {"text": texto, "start": start, "end": end,
            "words": [{"word": texto, "start": start, "end": end}]}


def test_fundir_desloca_o_corpo_pela_duracao_do_hook():
    hook = [_linha("oi", 0.0, 0.8)]
    corpo = [_linha("corpo", 1.0, 2.0)]
    out = fundir_transcricoes(hook, corpo, delta=3.2)
    assert out[0] == _linha("oi", 0.0, 0.8)                      # hook intacto
    assert out[1]["start"] == 4.2 and out[1]["end"] == 5.2       # 1.0+3.2
    assert out[1]["words"][0]["start"] == 4.2


def test_fundir_nao_muta_as_entradas():
    corpo = [_linha("corpo", 1.0, 2.0)]
    fundir_transcricoes([], corpo, delta=2.0)
    assert corpo[0]["start"] == 1.0


def test_fundir_com_hook_vazio_so_desloca():
    out = fundir_transcricoes([], [_linha("a", 0.5, 1.0)], delta=1.5)
    assert [round(out[0]["start"], 3), round(out[0]["end"], 3)] == [2.0, 2.5]


def test_deslocar_overlays_soma_frames_e_preserva_o_resto():
    ovs = [{"id": "ov_a", "type": "text", "text": "M", "fromFrame": 30,
            "durationInFrames": 20, "x": 0.5}]
    out = deslocar_overlays(ovs, delta=3.2, fps=30.0)
    assert out[0]["fromFrame"] == 30 + 96                        # round(3.2*30)
    assert out[0]["durationInFrames"] == 20 and out[0]["x"] == 0.5
    assert ovs[0]["fromFrame"] == 30                             # não muta
