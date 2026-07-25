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
});
