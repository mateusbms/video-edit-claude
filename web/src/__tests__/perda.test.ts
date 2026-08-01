import { describe, it, expect } from "vitest";
import { oQueSePerde, listarPerdas, TUDO_QUE_SE_PERDE } from "../perda";

describe("oQueSePerde", () => {
  it("sem nenhuma flag, não perde nada", () => {
    expect(oQueSePerde({})).toEqual([]);
  });

  it("mapeia cada flag para o item correspondente, na ordem canônica", () => {
    expect(
      oQueSePerde({
        has_transcript: true,
        has_overlays: true,
        has_suggestions: true,
        has_recipe: true,
      }),
    ).toEqual(["a transcrição", "os textos", "as sugestões", "a receita de render"]);
  });

  it("flags parciais só trazem os itens correspondentes", () => {
    expect(oQueSePerde({ has_overlays: true, has_recipe: true })).toEqual([
      "os textos",
      "a receita de render",
    ]);
  });

  it("flag false ou ausente não aparece na lista", () => {
    expect(oQueSePerde({ has_transcript: false, has_suggestions: undefined })).toEqual([]);
  });
});

describe("listarPerdas", () => {
  it("lista vazia vira string vazia", () => {
    expect(listarPerdas([])).toBe("");
  });

  it("um item aparece sozinho, sem junção", () => {
    expect(listarPerdas(["a transcrição"])).toBe("a transcrição");
  });

  it("dois itens usam 'e', não vírgula", () => {
    expect(listarPerdas(["a transcrição", "os textos"])).toBe("a transcrição e os textos");
  });

  it("quatro itens usam vírgulas e 'e' só antes do último", () => {
    expect(
      listarPerdas(["a transcrição", "os textos", "as sugestões", "a receita de render"]),
    ).toBe("a transcrição, os textos, as sugestões e a receita de render");
  });
});

describe("TUDO_QUE_SE_PERDE", () => {
  it("é a frase com os quatro itens, igual ao que listarPerdas produziria com todas as flags", () => {
    const todasAsFlags = oQueSePerde({
      has_transcript: true,
      has_overlays: true,
      has_suggestions: true,
      has_recipe: true,
    });
    expect(TUDO_QUE_SE_PERDE).toBe(listarPerdas(todasAsFlags));
  });
});
