import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// web/src/components/CaptionOverlay.tsx é espelho visual de
// remotion/src/components/CaptionLayer.tsx: os dois desenham a MESMA legenda,
// um em px de tela e outro em px do frame. Peso, entrelinha, sombra, largura
// máxima, espaço entre palavras e o zoom da palavra ativa mudam onde a linha
// quebra — se um lado mudar sozinho, o preview passa a mentir sobre o render.
// São projetos npm separados, então não dá para compartilhar constantes; o
// teste é a rede, no mesmo espírito de overlayAnimParity.test.ts.
type Estilo = {
  fontWeight: string;
  lineHeight: string;
  textShadow: string;
  maxWidth: string;
  activeScale: string;
  wordGapPx: string;
};

function pegar(src: string, arquivo: string, re: RegExp, campo: string): string {
  const m = src.match(re);
  if (!m) throw new Error(`não achei ${campo} em ${arquivo}`);
  return m[1];
}

function estilo(arquivo: string, gapRe: RegExp): Estilo {
  const src = readFileSync(arquivo, "utf8");
  const p = (re: RegExp, campo: string) => pegar(src, arquivo, re, campo);
  return {
    fontWeight: p(/fontWeight:\s*(\d+)/, "fontWeight"),
    lineHeight: p(/lineHeight:\s*([\d.]+)/, "lineHeight"),
    textShadow: p(/textShadow:\s*"([^"]+)"/, "textShadow"),
    maxWidth: p(/maxWidth:\s*"([^"]+)"/, "maxWidth"),
    // `? "scale(1.08)" : "scale(1)"` nos dois lados
    activeScale: p(/"scale\(([\d.]+)\)"\s*:\s*"scale\(1\)"/, "escala da palavra ativa"),
    wordGapPx: p(gapRe, "espaço entre palavras"),
  };
}

describe("paridade da legenda (web vs remotion)", () => {
  it("os valores visuais do CaptionOverlay batem com os do CaptionLayer", () => {
    // vitest roda com cwd = web/
    const web = estilo(
      resolve(process.cwd(), "src/components/CaptionOverlay.tsx"),
      /WORD_GAP_PX\s*=\s*(\d+)/,
    );
    const remotion = estilo(
      resolve(process.cwd(), "../remotion/src/components/CaptionLayer.tsx"),
      /marginRight:\s*(\d+)/,
    );
    expect(web).toEqual(remotion);
  });
});
