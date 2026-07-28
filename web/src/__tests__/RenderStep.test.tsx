import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  fileUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  getJob: vi.fn(async () => ({ orientation: "9x16" })),
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
    await waitFor(() => expect(screen.getByText(/9:16/)).toBeInTheDocument());
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
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
});
