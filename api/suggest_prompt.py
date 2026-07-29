"""Monta o prompt fechado para o `claude -p` gerar sugestões de texto.

Função pura, sem I/O: recebe o contexto do job já carregado e devolve a string
que vai para o CLI. As regras da skill `ad-creative` vivem aqui condensadas — não
apontamos para a skill em disco, porque o CLI roda de um cwd neutro (ver
`api/claude_cli.py`) e não enxerga o `.claude/` do repo.
"""


def _fmt_transcript(transcript: list[dict]) -> str:
    linhas = []
    for line in transcript:
        start = float(line.get("start", 0.0))
        end = float(line.get("end", 0.0))
        text = str(line.get("text", "")).strip()
        if text:
            linhas.append(f"[{start:.1f}s–{end:.1f}s] {text}")
    return "\n".join(linhas)


def build_prompt(
    transcript: list[dict],
    hook: dict | None,
    defaults: dict | None,
    fps: float,
    orientation: str,
) -> str:
    defaults = defaults or {}
    hook = hook or {}
    hook_title = str(hook.get("title", "")).strip()
    hook_subtitle = str(hook.get("subtitle", "")).strip()
    font_size = defaults.get("fontSize", 64)
    duration_default = defaults.get("durationInFrames", 75)

    # A orientação muda a densidade que cabe na linha.
    if orientation == "9x16":
        canvas = (
            "O vídeo é VERTICAL (9x16), canvas de 1080px de largura. Linhas curtas: "
            "textos densos com muitos símbolos quebram feio nessa largura. Prefira "
            "poucas palavras por linha."
        )
    else:
        canvas = (
            "O vídeo é HORIZONTAL (16x9), canvas de 1920px de largura. Cabe mais "
            "texto por linha; densos com símbolos funcionam bem."
        )

    hook_block = (
        f'Hook já definido (NÃO repita esta ideia na abertura): "{hook_title}"'
        + (f' / "{hook_subtitle}"' if hook_subtitle else "")
        if hook_title
        else "Nenhum hook definido ainda."
    )

    return f"""Você é um redator de tráfego pago aplicando as regras da skill ad-creative.
Gere textos de overlay (kinetic text) para um Reels/Short a partir da transcrição abaixo.

## Contexto do vídeo
- fps: {fps}
- orientação: {orientation}
- {canvas}
- {hook_block}
- Estilo padrão do overlay: fontSize {font_size}px, duração padrão ~{duration_default} frames.

## Transcrição (ÚNICA fonte de grounding — cada texto nasce de uma fala real)
{_fmt_transcript(transcript)}

## Regras (ad-creative, condensadas)
- Escolha 3–5 ÂNGULOS distintos entre: dor, resultado, prova, curiosidade, comparação,
  urgência, identidade, contrarian, objeção, CTA.
- Por beat relevante da fala, escreva UM texto: `kind:"short"` (uma ideia, punchy, número
  quando houver) OU `kind:"dense"` (uma linha com símbolos ✓ ✗ → ·).
- GROUNDING RÍGIDO: cada sugestão carrega `source` = a fala exata que a originou. NUNCA
  invente claim, número ou fato que não esteja na transcrição.
- Evite a janela do hook (~0–3s) e a faixa da legenda.
- Alvo: 6 a 10 sugestões.
- `fromFrame` = round(start_da_fala * fps). `durationInFrames` entre 45 e 75.
- Ids sequenciais: sug_01, sug_02, …

## Formato da resposta
Responda SOMENTE com um array JSON, sem markdown, sem comentários. Cada item:
{{"id": "sug_01", "text": "...", "fromFrame": 150, "durationInFrames": 60, "kind": "short", "angle": "prova", "source": "fala que originou"}}
"""
