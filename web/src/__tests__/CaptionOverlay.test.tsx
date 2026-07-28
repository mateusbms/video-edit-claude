import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CaptionOverlay } from "../components/CaptionOverlay";

afterEach(cleanup);

const lines = [
  { text: "olá mundo", start: 0.0, end: 1.0,
    words: [{ word: "olá", start: 0.0, end: 0.5 }, { word: "mundo", start: 0.5, end: 1.0 }] },
  { text: "tchau", start: 1.0, end: 2.0,
    words: [{ word: "tchau", start: 1.0, end: 2.0 }] },
];

describe("CaptionOverlay", () => {
  it("mostra a linha ativa no tempo dado", () => {
    render(<CaptionOverlay lines={lines as any} currentTime={0.2} />);
    expect(screen.getByText("olá")).toBeInTheDocument();
    expect(screen.getByText("mundo")).toBeInTheDocument();
    expect(screen.queryByText("tchau")).not.toBeInTheDocument();
  });

  it("destaca a palavra atual", () => {
    render(<CaptionOverlay lines={lines as any} currentTime={0.7} />);
    const active = screen.getByText("mundo");
    expect(active.getAttribute("data-active")).toBe("true");
  });

  it("não renderiza nada fora de qualquer linha", () => {
    const { container } = render(<CaptionOverlay lines={lines as any} currentTime={9} />);
    expect(container.textContent).toBe("");
  });
});

const style = {
  fontSize: 92, bottom: 327, color: "#ffffff",
  highlightColor: "#fcfcfc", fontFamily: "Plus Jakarta Sans",
};

describe("paridade com o CaptionLayer do render", () => {
  it("não desenha caixa de fundo (o render não tem)", () => {
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.28} />
    );
    const p = container.querySelector("p")!;
    expect(p.className).not.toMatch(/bg-black/);
  });

  it("usa maxWidth 80% como o render", () => {
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.28} />
    );
    expect(container.querySelector("p")!.style.maxWidth).toBe("80%");
  });

  it("usa fontWeight 800 como o render", () => {
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.28} />
    );
    expect(container.querySelector("p")!.style.fontWeight).toBe("800");
  });

  it("escala fontSize e bottom pela escala do preview", () => {
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.5} />
    );
    const p = container.querySelector("p")!;
    expect(p.style.fontSize).toBe("46px");        // 92 * 0.5
    const wrap = container.querySelector("div")!;
    expect(wrap.style.marginBottom).toBe("163.5px"); // 327 * 0.5
  });

  it("escala o espaçamento entre palavras (12px no render)", () => {
    render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.5} />
    );
    expect((screen.getByText("olá") as HTMLElement).style.marginRight).toBe("6px");
  });

  it("aplica scale(1.08) na palavra ativa como o render", () => {
    render(
      <CaptionOverlay lines={lines as any} currentTime={0.7} style={style} scale={0.5} />
    );
    expect((screen.getByText("mundo") as HTMLElement).style.transform).toBe("scale(1.08)");
    expect((screen.getByText("olá") as HTMLElement).style.transform).toBe("scale(1)");
  });
});
