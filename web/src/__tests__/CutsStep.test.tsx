import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  runCut: vi.fn(async () => ({
    original_duration: 10, trimmed_duration: 6,
    segments: [{ start: 0, end: 3 }, { start: 5, end: 8 }],
  })),
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
}));

import { CutsStep } from "../steps/CutsStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };
beforeEach(() => vi.clearAllMocks());

describe("CutsStep preview", () => {
  it("mostra um <video> do trimmed após detectar pausas", async () => {
    const { container } = render(<CutsStep {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
    await waitFor(() => {
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      expect(v!.getAttribute("src")).toContain("/files/trimmed.mp4");
    });
  });
});
