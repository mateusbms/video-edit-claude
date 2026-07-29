import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

  it("não deixa arrastar sem onDragBottom (nos passos onde é só referência)", () => {
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.5} />
    );
    const p = container.querySelector("p")!;
    expect(p.className).not.toMatch(/pointer-events-auto/);
    expect(p.className).not.toMatch(/cursor-ns-resize/);
  });

  it("esconde a legenda de leitor de tela (palavras sem espaço real no DOM)", () => {
    // As palavras são separadas só por marginRight (CSS), sem caractere " " no
    // DOM — textContent vira "olámundo", colado. Sem aria-hidden, leitor de
    // tela anunciaria isso como se fosse uma palavra só. O wrapper precisa
    // ficar marcado como oculto para tecnologia assistiva.
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.5} />
    );
    const wrap = container.querySelector("div")!;
    expect(wrap.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("arraste vertical da legenda", () => {
  const arrastavel = (onDragBottom: (b: number) => void, onDragEnd?: () => void, maxBottom = 1772) => {
    const { container } = render(
      <CaptionOverlay lines={lines as any} currentTime={0.2} style={style} scale={0.5}
        maxBottom={maxBottom} onDragBottom={onDragBottom} onDragEnd={onDragEnd} />
    );
    return container.querySelector("p")!;
  };

  it("vira alça de arraste quando recebe onDragBottom", () => {
    const p = arrastavel(() => {});
    expect(p.className).toMatch(/cursor-ns-resize/);
    expect(p.className).toMatch(/pointer-events-auto/);
  });

  it("subir o cursor aumenta o bottom, convertendo pela escala do preview", () => {
    const onDrag = vi.fn();
    const p = arrastavel(onDrag);
    fireEvent.pointerDown(p, { pointerId: 1, clientY: 300 });
    fireEvent.pointerMove(p, { pointerId: 1, clientY: 200 });
    // 100px de tela ÷ escala 0.5 = 200px do frame, somados ao bottom inicial
    expect(onDrag).toHaveBeenLastCalledWith(style.bottom + 200);
  });

  it("descer o cursor diminui o bottom", () => {
    const onDrag = vi.fn();
    const p = arrastavel(onDrag);
    fireEvent.pointerDown(p, { pointerId: 1, clientY: 300 });
    fireEvent.pointerMove(p, { pointerId: 1, clientY: 350 });
    expect(onDrag).toHaveBeenLastCalledWith(style.bottom - 100);
  });

  it("o gesto é relativo ao ponto onde começou, não à posição do cursor", () => {
    // o texto não salta para debaixo do cursor no primeiro movimento
    const onDrag = vi.fn();
    const p = arrastavel(onDrag);
    fireEvent.pointerDown(p, { pointerId: 1, clientY: 1000 });
    fireEvent.pointerMove(p, { pointerId: 1, clientY: 1000 });
    expect(onDrag).toHaveBeenLastCalledWith(style.bottom);
  });

  it("clampa no teto e no rodapé", () => {
    const onDrag = vi.fn();
    const p = arrastavel(onDrag, undefined, 1772);
    fireEvent.pointerDown(p, { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(p, { pointerId: 1, clientY: -9999 });
    expect(onDrag).toHaveBeenLastCalledWith(1772);
    fireEvent.pointerMove(p, { pointerId: 1, clientY: 9999 });
    expect(onDrag).toHaveBeenLastCalledWith(0);
  });

  it("ignora movimento sem arraste em andamento", () => {
    const onDrag = vi.fn();
    const p = arrastavel(onDrag);
    fireEvent.pointerMove(p, { pointerId: 1, clientY: 100 });
    expect(onDrag).not.toHaveBeenCalled();
  });

  it("avisa o fim do gesto só ao soltar (é quando vale persistir)", () => {
    const onEnd = vi.fn();
    const p = arrastavel(() => {}, onEnd);
    fireEvent.pointerDown(p, { pointerId: 1, clientY: 300 });
    fireEvent.pointerMove(p, { pointerId: 1, clientY: 250 });
    expect(onEnd).not.toHaveBeenCalled();
    fireEvent.pointerUp(p, { pointerId: 1 });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("soltar sem ter arrastado não dispara persistência", () => {
    const onEnd = vi.fn();
    const p = arrastavel(() => {}, onEnd);
    fireEvent.pointerUp(p, { pointerId: 1 });
    expect(onEnd).not.toHaveBeenCalled();
  });
});
