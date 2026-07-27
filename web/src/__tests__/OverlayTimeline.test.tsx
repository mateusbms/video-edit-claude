import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OverlayTimeline } from "../components/OverlayTimeline";
import type { Overlay } from "../types";

afterEach(cleanup);

const ov: Overlay = {
  id: "ov_a", type: "text", text: "Oferta",
  fromFrame: 30, durationInFrames: 60,
  x: 0.5, y: 0.2, anchor: "center", fontSize: 64,
  color: "", highlightColor: "", fontFamily: "",
  enter: "slide-up", exit: "fade", enterDurationInFrames: 12, exitDurationInFrames: 12,
};

const base = {
  overlays: [ov], totalFrames: 300, currentFrame: 0,
  selectedId: null as string | null, onSeekFrame: () => {}, onSelect: () => {},
};

describe("OverlayTimeline", () => {
  it("desenha uma barra por overlay com posição/largura proporcionais", () => {
    render(<OverlayTimeline {...base} />);
    const bar = screen.getByLabelText(/marcador Oferta/i);
    expect(bar.style.left).toBe("10%");   // 30/300
    expect(bar.style.width).toBe("20%");  // 60/300
  });

  it("clicar numa barra seleciona e faz seek pro início", () => {
    const onSelect = vi.fn();
    const onSeekFrame = vi.fn();
    render(<OverlayTimeline {...base} onSelect={onSelect} onSeekFrame={onSeekFrame} />);
    fireEvent.click(screen.getByLabelText(/marcador Oferta/i));
    expect(onSelect).toHaveBeenCalledWith("ov_a");
    expect(onSeekFrame).toHaveBeenCalledWith(30);
  });

  it("barras de contexto não são selecionáveis", () => {
    const onSelect = vi.fn();
    render(<OverlayTimeline {...base} overlays={[]} context={[ov]} onSelect={onSelect} />);
    expect(screen.queryByLabelText(/marcador/i)).not.toBeInTheDocument();
  });

  it("totalFrames=0 não quebra", () => {
    expect(() => render(<OverlayTimeline {...base} totalFrames={0} />)).not.toThrow();
    fireEvent.click(screen.getByLabelText(/marcador Oferta/i)); // não deve lançar
  });
});
