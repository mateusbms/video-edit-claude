import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { zEditRecipe } from "../schema";
import { formatMetadata } from "../recipe-metadata";

/**
 * Contrato entre a recipe do Python e o schema do Remotion.
 *
 * Mesmo espírito de tests/test_composition_ids.py: cruza os dois lados em vez
 * de confiar que as cópias andem juntas. Aqui a recipe vem do `build_recipe`
 * REAL (via python) e é validada pelo `zEditRecipe` REAL — era exatamente esse
 * cruzamento que faltava quando a recipe passou a trazer uma chave só em
 * `formats` e o schema continuou exigindo as duas: todo render novo falhava em
 * `calculateMetadata`, antes do primeiro frame.
 */

const repoRoot = resolve(process.cwd(), "..");

function pythonBin(): string {
  const candidatos = [
    resolve(repoRoot, ".venv/Scripts/python.exe"),
    resolve(repoRoot, ".venv/bin/python"),
  ];
  for (const c of candidatos) if (existsSync(c)) return c;
  return process.platform === "win32" ? "python" : "python3";
}

/** Chama pipeline.recipe.build_recipe e devolve o dict como objeto JS. */
function buildRecipe(orientation: "16x9" | "9x16", width: number, height: number): any {
  const script = [
    "import json",
    "from pipeline.recipe import build_recipe",
    "print(json.dumps(build_recipe(",
    `  width=${width}, height=${height}, fps=30.0, trimmed_duration=2.0,`,
    "  words=[{'word': 'ola', 'start': 0.0, 'end': 0.4},",
    "         {'word': 'mundo', 'start': 0.4, 'end': 0.9}],",
    "  hook={'title': 'Titulo', 'subtitle': 'Sub', 'duration_frames': 90},",
    `  orientation='${orientation}',`,
    ")))",
  ].join("\n");
  const r = spawnSync(pythonBin(), ["-c", script], { cwd: repoRoot, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(
      `não consegui rodar build_recipe pelo python (${pythonBin()}): ` +
        `status=${r.status} ${r.error?.message ?? ""}\n${r.stderr ?? ""}`,
    );
  }
  return JSON.parse(r.stdout);
}

describe("recipe do Python x schema do Remotion", () => {
  it("recipe 16x9 recém-gerada passa no zEditRecipe", () => {
    const recipe = buildRecipe("16x9", 1920, 1080);
    expect(Object.keys(recipe.formats)).toEqual(["main16x9"]);
    const r = zEditRecipe.safeParse(recipe);
    expect(r.error?.message ?? "ok").toBe("ok");
    expect(r.success).toBe(true);
  });

  it("recipe 9x16 recém-gerada passa no zEditRecipe", () => {
    const recipe = buildRecipe("9x16", 1080, 1920);
    expect(Object.keys(recipe.formats)).toEqual(["vertical9x16"]);
    const r = zEditRecipe.safeParse(recipe);
    expect(r.error?.message ?? "ok").toBe("ok");
    expect(r.success).toBe(true);
  });

  it("recipe legada com as duas chaves continua válida", () => {
    const recipe = buildRecipe("16x9", 1920, 1080);
    const legada = {
      ...recipe,
      formats: {
        main16x9: { width: 1920, height: 1080 },
        vertical9x16: { width: 1080, height: 1920 },
      },
    };
    const r = zEditRecipe.safeParse(legada);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(formatMetadata(r.data, "main16x9").width).toBe(1920);
    expect(formatMetadata(r.data, "vertical9x16").width).toBe(1080);
  });

  it("calculateMetadata usa o canvas da orientação da recipe", () => {
    const parsed = zEditRecipe.parse(buildRecipe("9x16", 1080, 1920));
    const meta = formatMetadata(parsed, "vertical9x16");
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1920);
    expect(meta.fps).toBe(30);
    expect(meta.durationInFrames).toBeGreaterThan(0);
  });

  it("pedir o formato ausente falha com mensagem acionável, não com TypeError", () => {
    const parsed = zEditRecipe.parse(buildRecipe("9x16", 1080, 1920));
    expect(() => formatMetadata(parsed, "main16x9")).toThrow(
      /recipe não contém o formato "main16x9".*rode \/recipe novamente/s,
    );
  });
});
