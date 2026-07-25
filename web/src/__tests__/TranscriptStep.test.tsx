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
});
