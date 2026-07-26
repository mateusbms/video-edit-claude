import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// §3.4: web/src/overlayAnim.ts é cópia proposital de remotion/src/overlay-utils.ts.
// Este teste é a rede de segurança real: se alguém mudar a matemática num arquivo
// e não no outro, o preview do editor divergiria do render. Comparamos o CORPO da
// função overlayProgress entre as duas cópias (normalizando espaços).
function overlayProgressBody(file: string): string {
  const src = readFileSync(file, "utf8");
  const i = src.indexOf("export function overlayProgress");
  if (i < 0) throw new Error(`overlayProgress não encontrado em ${file}`);
  // compara a LÓGICA: remove comentários (as cópias podem comentar diferente)
  // e normaliza espaços. Ainda pega qualquer mudança real na matemática.
  return src
    .slice(i)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("paridade overlayProgress (web vs remotion)", () => {
  it("os corpos da função são idênticos entre as duas cópias", () => {
    // vitest roda com cwd = web/
    const web = overlayProgressBody(resolve(process.cwd(), "src/overlayAnim.ts"));
    const remotion = overlayProgressBody(
      resolve(process.cwd(), "../remotion/src/overlay-utils.ts"),
    );
    expect(web).toBe(remotion);
  });
});
