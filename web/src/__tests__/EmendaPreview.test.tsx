import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { EmendaPreview } from "../components/EmendaPreview";

const base = {
  slug: "v1", version: 1, fps: 30,
  start: 21.9, end: 22.1, limpoInicio: true, limpoFim: true,
  onChange: () => {}, onAplicar: () => {}, onCancelar: () => {},
};

describe("EmendaPreview", () => {
  it("mostra os tempos dos dois quadros da emenda", () => {
    render(<EmendaPreview {...base} />);
    // último frame que fica = start - 1/fps ≈ 21.867; primeiro que fica = end = 22.100
    expect(screen.getByText(/antes: 21\.87/)).toBeInTheDocument();
    expect(screen.getByText(/depois: 22\.10/)).toBeInTheDocument();
  });

  it("o nudge ◀/▶ do início soma/subtrai 1 frame e chama onChange", () => {
    const onChange = vi.fn();
    render(<EmendaPreview {...base} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /recuar início/ }));
    // -1 frame = -1/30 ≈ 0.0333
    expect(onChange).toHaveBeenCalledWith(21.867, 22.1);
    onChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /avançar início/ }));
    expect(onChange).toHaveBeenCalledWith(21.933, 22.1);
  });

  it("avisa quando a fronteira não é limpa de um lado", () => {
    render(<EmendaPreview {...base} limpoFim={false} />);
    expect(screen.getByText(/ajuste no frame/i)).toBeInTheDocument();
  });

  it("Aplicar e Cancelar disparam os callbacks", () => {
    const onAplicar = vi.fn(); const onCancelar = vi.fn();
    render(<EmendaPreview {...base} onAplicar={onAplicar} onCancelar={onCancelar} />);
    fireEvent.click(screen.getByRole("button", { name: /aplicar corte/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onAplicar).toHaveBeenCalled();
    expect(onCancelar).toHaveBeenCalled();
  });
});
