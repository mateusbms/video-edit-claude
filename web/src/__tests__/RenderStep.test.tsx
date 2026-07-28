import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

const getJob = vi.fn(async (..._a: any[]) => ({ orientation: "9x16" }));
vi.mock("../api", () => ({
  fileUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  getJob: (...a: any[]) => getJob(...a),
  streamSSE: vi.fn(async (_url: string, _opts: any, on: any) => {
    on.progress?.({ format: "vertical9x16", kind: "rendered", n: 5, total: 10 });
    on.done?.({ ok: true });
  }),
}));

import { RenderStep } from "../steps/RenderStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("RenderStep com formato único", () => {
  it("anuncia o formato do job em vez de oferecer checkboxes", async () => {
    render(<RenderStep {...props} />);
    // escopado no <strong> do parágrafo: evita colidir com o botão, que
    // também reafirma o formato (ex.: "Renderizar 9:16") no momento da ação.
    await waitFor(() =>
      expect(screen.getByText(/9:16/, { selector: "strong" })).toBeInTheDocument()
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("o botão reafirma o formato no momento da ação", async () => {
    render(<RenderStep {...props} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /renderizar 9:16/i })).toBeInTheDocument()
    );
  });

  it("mostra o progresso indexado pela chave lógica vertical9x16", async () => {
    render(<RenderStep {...props} />);
    await waitFor(() => screen.getByRole("button", { name: /renderizar/i }));
    fireEvent.click(screen.getByRole("button", { name: /renderizar/i }));
    await waitFor(() => expect(screen.getByText(/5\/10/)).toBeInTheDocument());
  });

  it("exibe só o vídeo 9x16 ao terminar", async () => {
    const { container } = render(<RenderStep {...props} />);
    await waitFor(() => screen.getByRole("button", { name: /renderizar/i }));
    fireEvent.click(screen.getByRole("button", { name: /renderizar/i }));
    await waitFor(() => {
      const videos = container.querySelectorAll("video");
      expect(videos).toHaveLength(1);
      expect(videos[0].getAttribute("src")).toContain("v1-9x16.mp4");
    });
  });

  it("desabilita o botão de renderizar enquanto a orientação do job não chegou", async () => {
    let resolveGetJob!: (v: any) => void;
    getJob.mockReturnValueOnce(new Promise((resolve) => { resolveGetJob = resolve; }));

    render(<RenderStep {...props} />);
    // ainda sem a orientação persistida: não pode disparar o render, senão
    // usaria o default "16x9" em vez do valor real do job.
    expect(screen.getByRole("button", { name: /carregando|renderizar/i })).toBeDisabled();

    resolveGetJob({ orientation: "9x16" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /renderizar/i })).not.toBeDisabled();
    });
  });
});
