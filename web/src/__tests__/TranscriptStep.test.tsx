import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  getTranscript: vi.fn(async () => ([])),
  putTranscript: vi.fn(async () => {}),
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  streamSSE: vi.fn((_url: string, _opts: any, on: any) => {
    on.progress?.({ n: 5, total: 10 });
    // promise pendente: transcrição "em andamento" (busy=true) para ver a barra
    return new Promise<void>(() => {});
  }),
  getJob: vi.fn(async () => ({ captionStyle: { fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" }, brandKitSlug: "" })),
  putCaptionStyle: vi.fn(async () => {}),
  putBrandKit: vi.fn(async () => {}),
}));

vi.mock("../animatedApi", () => ({
  listBrandKits: vi.fn(async () => ([])),
  createBrandKit: vi.fn(),
  updateBrandKit: vi.fn(),
}));

import { TranscriptStep } from "../steps/TranscriptStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("TranscriptStep progress", () => {
  it("mostra a ProgressBar durante a transcrição", async () => {
    render(<TranscriptStep {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /transcrever/i }));
    await waitFor(() => {
      expect(screen.getByText(/50%/)).toBeInTheDocument();
    });
  });

  it("ajustar o tamanho da legenda chama putCaptionStyle", async () => {
    const api = await import("../api");
    render(<TranscriptStep {...props} />);
    const size = await screen.findByLabelText(/tamanho da legenda/i);
    fireEvent.change(size, { target: { value: "72" } });
    await waitFor(() => expect((api.putCaptionStyle as any)).toHaveBeenCalled());
  });

  it("desenha a legenda com a fonte que o brand kit resolveu no backend", async () => {
    // caption_font vazio + kit com fonts.body "Poppins": o render usa Poppins,
    // então o preview também precisa usar — fonte diferente quebra linha em
    // ponto diferente, que é o bug que o CaptionOverlay existe para evitar.
    const api = await import("../api");
    (api.getJob as any).mockResolvedValueOnce({
      orientation: "16x9",
      captionStyle: { fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" },
      captionStyleResolved: { fontSize: 48, bottom: 120, color: "#eeeeee", highlightColor: "#ff0055", fontFamily: "Poppins" },
      brandKitSlug: "marca",
    });
    (api.getTranscript as any).mockResolvedValueOnce([
      { start: 0, end: 5, text: "oi", words: [{ word: "oi", start: 0, end: 5 }] },
    ]);

    render(<TranscriptStep {...props} />);
    const p = (await screen.findByText("oi")).closest("p") as HTMLElement;
    await waitFor(() => expect(p.style.fontFamily).toMatch(/Poppins/));

    // e o controle continua mostrando o valor CRU (vazio => o padrão do editor
    // na lista), para um ajuste de tamanho não congelar a fonte da marca no job
    const select = await screen.findByLabelText(/fonte da legenda/i);
    expect((select as HTMLSelectElement).value).toBe("Plus Jakarta Sans");
  });

  it("a posição alcança o topo do frame, e o teto segue a orientação", async () => {
    const api = await import("../api");
    (api.getJob as any).mockResolvedValueOnce({
      orientation: "9x16",
      captionStyle: { fontSize: 92, bottom: 120, color: "", highlightColor: "", fontFamily: "" },
      brandKitSlug: "",
    });
    render(<TranscriptStep {...props} />);
    const pos = await screen.findByLabelText(/posição da legenda/i);
    // 1920 de altura menos o bloco (92 * 1.6): a legenda sobe a tela inteira,
    // não os 600px fixos de antes
    await waitFor(() => expect((pos as HTMLInputElement).max).toBe("1772.8"));
    expect(Number((pos as HTMLInputElement).max)).toBeGreaterThan(600);
  });

  it("no 16x9 o teto cai junto com a altura do frame", async () => {
    const api = await import("../api");
    (api.getJob as any).mockResolvedValueOnce({
      orientation: "16x9",
      captionStyle: { fontSize: 92, bottom: 120, color: "", highlightColor: "", fontFamily: "" },
      brandKitSlug: "",
    });
    render(<TranscriptStep {...props} />);
    const pos = await screen.findByLabelText(/posição da legenda/i);
    await waitFor(() => expect((pos as HTMLInputElement).max).toBe("932.8"));
  });

  it("aumentar a fonte puxa a posição para baixo do novo teto", async () => {
    // o bloco cresce com a fonte: sem reduzir o bottom junto, o controle
    // mostraria uma posição que o render não consegue desenhar
    const api = await import("../api");
    (api.getJob as any).mockResolvedValueOnce({
      orientation: "16x9",
      captionStyle: { fontSize: 48, bottom: 950, color: "", highlightColor: "", fontFamily: "" },
      brandKitSlug: "",
    });
    render(<TranscriptStep {...props} />);
    const size = await screen.findByLabelText(/tamanho da legenda/i);
    fireEvent.change(size, { target: { value: "120" } });
    await waitFor(() =>
      expect(api.putCaptionStyle as any).toHaveBeenCalledWith("v1",
        expect.objectContaining({ fontSize: 120, bottom: 888 })),  // 1080 - 120*1.6
    );
  });

  it("escala a legenda pela largura do frame-alvo (9x16 = 1080), não por 1920 fixo", async () => {
    // jsdom devolve clientWidth 0; fingimos um <video> vertical de 304px
    const spy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(304);
    try {
      const api = await import("../api");
      (api.getJob as any).mockResolvedValueOnce({
        orientation: "9x16",
        captionStyle: { fontSize: 92, bottom: 120, color: "", highlightColor: "", fontFamily: "" },
        brandKitSlug: "",
      });
      (api.getTranscript as any).mockResolvedValueOnce([
        { start: 0, end: 5, text: "oi", words: [{ word: "oi", start: 0, end: 5 }] },
      ]);

      render(<TranscriptStep {...props} />);
      const word = await screen.findByText("oi");
      const p = word.closest("p") as HTMLElement;

      // 92px num canvas de 1080 exibido em 304px => 92 * 304/1080 = 25.896px
      // (a régua antiga, 1920, daria 92 * 304/1920 = 14.567px)
      await waitFor(() => {
        expect(parseFloat(p.style.fontSize)).toBeCloseTo(92 * 304 / 1080, 1);
      });
      expect(parseFloat(p.style.fontSize)).not.toBeCloseTo(92 * 304 / 1920, 1);
    } finally {
      spy.mockRestore();
    }
  });
});
