import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  fileUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  streamSSE: vi.fn(async (_url: string, _opts: any, on: any) => {
    on.progress?.({ format: "main16x9", kind: "rendered", n: 5, total: 10 });
  }),
}));

import { RenderStep } from "../steps/RenderStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("RenderStep progress", () => {
  it("mostra a barra 16:9 indexada pela chave lógica main16x9", async () => {
    render(<RenderStep {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /renderizar/i }));
    await waitFor(() => {
      expect(screen.getByText(/5\/10/)).toBeInTheDocument();
    });
  });
});
