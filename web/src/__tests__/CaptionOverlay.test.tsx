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
