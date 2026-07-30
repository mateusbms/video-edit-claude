import { describe, it, expect } from "vitest";
import { proximoSlugLivre } from "../slug";

describe("proximoSlugLivre", () => {
  it("sem projetos, sugere A1", () => {
    expect(proximoSlugLivre([])).toBe("A1");
  });

  it("pula os nomes já usados", () => {
    expect(proximoSlugLivre(["A1", "A2", "A3"])).toBe("A4");
  });

  it("preenche buracos na sequência", () => {
    expect(proximoSlugLivre(["A1", "A3"])).toBe("A2");
  });

  it("ignora projetos com outro padrão de nome", () => {
    expect(proximoSlugLivre(["demo", "fala"])).toBe("A1");
  });
});
