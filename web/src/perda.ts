/**
 * Vocabulário único do "o que se perde" ao descartar trabalho — usado nos
 * três diálogos destrutivos que citam transcrição/textos/sugestões/receita de
 * render (ProjectsScreen, CutsStep, UploadStep). Antes cada um construía essa
 * lista e a juntava à mão, de um jeito ligeiramente diferente em cada lugar;
 * agora os três partem daqui para não divergir de novo em silêncio.
 */

export type FlagsDePerda = {
  has_transcript?: boolean;
  has_overlays?: boolean;
  has_suggestions?: boolean;
  has_recipe?: boolean;
};

/**
 * Os quatro itens que o corte/refino/substituição apagam juntos, sempre na
 * mesma ordem e com o mesmo texto. Flag ausente/false → item de fora.
 */
export function oQueSePerde(flags: FlagsDePerda): string[] {
  return [
    flags.has_transcript && "a transcrição",
    flags.has_overlays && "os textos",
    flags.has_suggestions && "as sugestões",
    flags.has_recipe && "a receita de render",
  ].filter((x): x is string => Boolean(x));
}

/** "a", "a e b", "a, b e c" — vírgulas entre os itens, " e " antes do último. */
export function listarPerdas(itens: string[]): string {
  if (itens.length === 0) return "";
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/**
 * A frase conservadora usada quando não sabemos o que o projeto tem salvo
 * (ex.: getJob falhou) — assume os quatro itens, para errar do lado seguro.
 */
export const TUDO_QUE_SE_PERDE =
  "a transcrição, os textos, as sugestões e a receita de render";
