import type { TEditRecipe } from "./schema";
import { totalDuration } from "./timeline-utils";

export type FormatKey = "main16x9" | "vertical9x16";

/**
 * Metadados da composição (duração, fps, tamanho) a partir da recipe.
 *
 * A recipe carrega só o formato da orientação do job, então pedir o formato
 * errado é um estado real e previsível: o job foi renderizado numa orientação
 * e a recipe em disco foi gerada noutra. Falha aqui com mensagem acionável em
 * vez de deixar estourar um TypeError dentro do Remotion.
 */
export function formatMetadata(recipe: TEditRecipe, format: FormatKey) {
  const f = recipe.formats[format];
  if (!f) {
    const presentes = Object.keys(recipe.formats).join(", ") || "nenhum";
    throw new Error(
      `recipe não contém o formato "${format}" (tem: ${presentes}); ` +
        "ela foi gerada para outra orientação — rode /recipe novamente",
    );
  }
  return {
    durationInFrames: Math.max(1, totalDuration(recipe.segments)),
    fps: recipe.fps,
    width: f.width,
    height: f.height,
  };
}
