import { describe, it, expect } from "vitest";
import { effectiveCaptionStyle } from "../captionStyle";

const cru = { fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" };
const resolvido = {
  fontSize: 48, bottom: 120,
  color: "#eeeeee", highlightColor: "#ff0055", fontFamily: "Poppins",
};

describe("effectiveCaptionStyle", () => {
  it("usa o resolvido do backend onde o usuário não escolheu nada", () => {
    const e = effectiveCaptionStyle(cru, resolvido);
    expect(e.fontFamily).toBe("Poppins");
    expect(e.color).toBe("#eeeeee");
    expect(e.highlightColor).toBe("#ff0055");
  });

  it("a escolha do usuário vence o brand kit", () => {
    const e = effectiveCaptionStyle({ ...cru, fontFamily: "Anton", color: "#000000" }, resolvido);
    expect(e.fontFamily).toBe("Anton");
    expect(e.color).toBe("#000000");
  });

  it("tamanho e posição vêm sempre do cru (são o que o usuário arrasta)", () => {
    const e = effectiveCaptionStyle({ ...cru, fontSize: 92, bottom: 327 }, resolvido);
    expect(e.fontSize).toBe(92);
    expect(e.bottom).toBe(327);
  });

  it("sem resolvido (backend antigo) devolve o cru", () => {
    expect(effectiveCaptionStyle(cru, null)).toEqual(cru);
    expect(effectiveCaptionStyle(cru)).toEqual(cru);
  });
});
