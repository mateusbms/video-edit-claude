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

  it("clicar num trecho pula para o tempo NO VÍDEO CORTADO (não o original)", async () => {
    const { container } = render(<CutsStep {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
    const video = await waitFor(() => {
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      return v as HTMLVideoElement;
    });
    // segmentos: [0,3] e [5,8]. No trimmed.mp4 (contíguo) o 2º trecho começa em 3s,
    // não em 5s (o timestamp original). O clique deve levar a 3s.
    const seg2 = container.querySelector('[title="Ir para 00:03"]');
    expect(seg2).not.toBeNull();
    fireEvent.click(seg2!);
    expect(video.currentTime).toBe(3);
  });
});
