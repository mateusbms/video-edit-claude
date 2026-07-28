export type CaptionStyle = {
  fontSize: number;
  bottom: number;
  color: string;
  highlightColor: string;
  fontFamily: string;
};

/**
 * Estilo com que o preview deve desenhar a legenda.
 *
 * `raw` é o que está no job.config: string vazia significa "segue o brand kit".
 * `resolved` é o mesmo estilo já resolvido pelo backend contra o brand kit — é
 * o que o render vai usar de fato. Onde o usuário não escolheu nada, vale o
 * resolvido; senão o preview desenharia com uma fonte e o render com outra, e a
 * legenda quebraria linha em pontos diferentes.
 */
export function effectiveCaptionStyle(
  raw: CaptionStyle,
  resolved?: Partial<CaptionStyle> | null,
): CaptionStyle {
  return {
    fontSize: raw.fontSize,
    bottom: raw.bottom,
    color: raw.color || resolved?.color || "",
    highlightColor: raw.highlightColor || resolved?.highlightColor || "",
    fontFamily: raw.fontFamily || resolved?.fontFamily || "",
  };
}
