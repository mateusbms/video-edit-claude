import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  streamSSE: vi.fn(async (_url: string, _opts: any, on: any) => {
    on.progress?.({ n: 3, total: 6 });
    on.done?.({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 3 }, { start: 5, end: 8 }],
    });
  }),
}));

import { CutsStep } from "../steps/CutsStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };
beforeEach(() => vi.clearAllMocks());

describe("CutsStep", () => {
  it("mostra resumo e <video> do trimmed após o corte (via SSE)", async () => {
    const { container } = render(<CutsStep {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
    await waitFor(() => {
      expect(screen.getByText(/trechos mantidos/i)).toBeInTheDocument();
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      expect(v!.getAttribute("src")).toContain("/files/trimmed.mp4");
    });
  });
});
