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

  it("aplica maxWidthPct como maxWidth", () => {
    render(<OverlayPreview overlays={[{ ...ov, maxWidthPct: 50 }]} frame={20} scale={1}
      selectedId={null} onSelect={() => {}} onMove={() => {}} />);
    const el = screen.getByText("Oferta");
    expect(el.style.maxWidth).toBe("50%");
  });

  it("só chama onMove durante o arraste (após pointerDown)", () => {
    const onMove = vi.fn();
    const { container } = render(
      <OverlayPreview overlays={[ov]} frame={20} scale={1} selectedId={null} onSelect={() => {}} onMove={onMove} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    // pointermove sem arraste ativo -> não move
    fireEvent.pointerMove(wrapper, { clientX: 10, clientY: 10 });
    expect(onMove).not.toHaveBeenCalled();
    // inicia o arraste no bloco e move -> onMove com o id
    fireEvent.pointerDown(screen.getByText("Oferta"), { pointerId: 1 });
    fireEvent.pointerMove(wrapper, { clientX: 10, clientY: 10 });
    expect(onMove).toHaveBeenCalled();
    expect(onMove.mock.calls[0][0]).toBe("ov_a");
  });

  it("mostra guia de alinhamento ao arrastar perto do centro", () => {
    const onMove = vi.fn();
    const { container } = render(
      <OverlayPreview overlays={[ov]} frame={20} scale={1} selectedId={null} onSelect={() => {}} onMove={onMove} />,
    );
    const wrapper = container.firstChild as HTMLElement;
    vi.spyOn(wrapper, "getBoundingClientRect").mockReturnValue({
      left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => {},
    } as DOMRect);
    fireEvent.pointerDown(screen.getByText("Oferta"), { pointerId: 1 });
    fireEvent.pointerMove(wrapper, { clientX: 50, clientY: 20 }); // x=0.5 → snap ao centro
    expect(onMove).toHaveBeenCalledWith("ov_a", 0.5, expect.anything());
    expect(screen.getByLabelText(/guia de alinhamento/i)).toBeInTheDocument();
  });
});

describe("OverlayPreview — extensões Fase C.1", () => {
  it("desenha overlays read-only (contexto) sem permitir seleção", () => {
    const onSelect = vi.fn();
    render(
      <OverlayPreview overlays={[]} readOnlyOverlays={[ov]} frame={20} scale={1}
        selectedId={null} onSelect={onSelect} onMove={() => {}} />,
    );
    const el = screen.getByText("Oferta");
    expect(el).toBeInTheDocument();
    fireEvent.pointerDown(el);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("marca colisão quando o overlay cai na faixa da legenda", () => {
    const zone = { top: 0.7, bottom: 0.95 };
    render(
      <OverlayPreview overlays={[{ ...ov, y: 0.8 }]} frame={20} scale={1}
        selectedId={null} onSelect={() => {}} onMove={() => {}} captionZone={zone} />,
    );
    expect(screen.getByLabelText(/aviso de colis/i)).toBeInTheDocument();
  });

  it("não marca colisão fora da faixa", () => {
    const zone = { top: 0.7, bottom: 0.95 };
    render(
      <OverlayPreview overlays={[{ ...ov, y: 0.2 }]} frame={20} scale={1}
        selectedId={null} onSelect={() => {}} onMove={() => {}} captionZone={zone} />,
    );
    expect(screen.queryByLabelText(/aviso de colis/i)).not.toBeInTheDocument();
  });
});

describe("OverlayPreview — regra de play (Fase C.2)", () => {
  it("tocando: selecionado fora da janela NÃO é desenhado (anima/some)", () => {
    render(
      <OverlayPreview overlays={[ov]} frame={200} scale={1}
        selectedId="ov_a" onSelect={() => {}} onMove={() => {}} playing />,
    );
    expect(screen.queryByText("Oferta")).not.toBeInTheDocument();
  });

  it("pausado: selecionado fora da janela É desenhado (para editar)", () => {
    render(
      <OverlayPreview overlays={[ov]} frame={200} scale={1}
        selectedId="ov_a" onSelect={() => {}} onMove={() => {}} />,
    );
    expect(screen.getByText("Oferta")).toBeInTheDocument();
  });

  it("tocando: selecionado em fade usa a opacidade da animação (não força 1)", () => {
    render(
      <OverlayPreview overlays={[ov]} frame={3} scale={1}
        selectedId="ov_a" onSelect={() => {}} onMove={() => {}} playing />,
    );
    const el = screen.getByText("Oferta");
    expect(Number(el.style.opacity)).toBeLessThan(1);
  });
});
