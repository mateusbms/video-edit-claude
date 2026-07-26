import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { OverlayPreview } from "../components/OverlayPreview";
import type { Overlay } from "../types";

afterEach(cleanup);

const ov: Overlay = {
  id: "ov_a", type: "text", text: "Oferta",
  fromFrame: 0, durationInFrames: 90,
  x: 0.5, y: 0.2, anchor: "center", fontSize: 64,
  color: "", highlightColor: "", fontFamily: "",
  enter: "slide-up", exit: "fade", enterDurationInFrames: 12, exitDurationInFrames: 12,
};

describe("OverlayPreview", () => {
  it("desenha o texto do overlay ativo no frame atual", () => {
    render(<OverlayPreview overlays={[ov]} frame={20} scale={1} selectedId={null} onSelect={() => {}} onMove={() => {}} />);
    expect(screen.getByText("Oferta")).toBeInTheDocument();
  });
  it("não desenha overlay fora do intervalo", () => {
    const { container } = render(<OverlayPreview overlays={[ov]} frame={200} scale={1} selectedId={null} onSelect={() => {}} onMove={() => {}} />);
    expect(container.textContent).toBe("");
  });
  it("chama onSelect ao clicar no bloco", () => {
    const onSelect = vi.fn();
    render(<OverlayPreview overlays={[ov]} frame={20} scale={1} selectedId={null} onSelect={onSelect} onMove={() => {}} />);
    fireEvent.pointerDown(screen.getByText("Oferta"));
    expect(onSelect).toHaveBeenCalledWith("ov_a");
  });
});
