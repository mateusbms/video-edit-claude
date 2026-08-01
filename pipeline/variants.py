"""Variações de hook (spec 2026-08-01): fusão/deslocamento + orquestração.

A variação nasce com trimmed próprio (hook cortado + corpo da matriz) e
artefatos fundidos; depois disso é um projeto normal. delta é SEMPRE a
duração do hook cortado lida do probe — nunca estimada."""
import copy


def fundir_transcricoes(hook: list, corpo: list, delta: float) -> list:
    """hook ++ corpo com start/end (linhas e palavras) somados de delta."""
    deslocado = []
    for linha in corpo:
        nova = copy.deepcopy(linha)
        nova["start"] = linha["start"] + delta
        nova["end"] = linha["end"] + delta
        for w in nova["words"]:
            w["start"] += delta
            w["end"] += delta
        deslocado.append(nova)
    return list(hook) + deslocado


def deslocar_overlays(overlays: list, delta: float, fps: float) -> list:
    """fromFrame += round(delta*fps); serve para overlays e sugestões."""
    frames = round(delta * fps)
    out = []
    for ov in overlays:
        novo = copy.deepcopy(ov)
        novo["fromFrame"] = ov["fromFrame"] + frames
        out.append(novo)
    return out
