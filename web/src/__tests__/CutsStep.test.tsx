import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

const { streamSSE } = vi.hoisted(() => ({
  streamSSE: vi.fn(async (url: string, _opts: any, on: any) => {
    if (url.includes("/cut")) {
      on.progress?.({ n: 3, total: 6 });
      on.done?.({
        original_duration: 10, trimmed_duration: 6,
        segments: [{ start: 0, end: 3 }, { start: 5, end: 8 }],
      });
    } else if (url.includes("/refine")) {
      on.progress?.({ n: 1, total: 4 });
      on.done?.({ trimmed_duration: 5 });
    }
  }),
}));
vi.mock("../api", () => ({
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  streamSSE,
}));

import { CutsStep } from "../steps/CutsStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };
beforeEach(() => vi.clearAllMocks());

async function doCut(container: HTMLElement) {
  fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
  await waitFor(() => expect(screen.getByText(/trechos mantidos/i)).toBeInTheDocument());
  return container.querySelector("video") as HTMLVideoElement;
}

describe("CutsStep manual cut", () => {
  it("marca um trecho a remover (início + fim) e lista", async () => {
    const { container } = render(<CutsStep {...props} />);
    const video = await doCut(container);
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    expect(screen.getByRole("button", { name: /remover trecho 1/i })).toBeInTheDocument();
  });

  it("aplica os cortes chamando streamSSE em /refine", async () => {
    const { container } = render(<CutsStep {...props} />);
    const video = await doCut(container);
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    await waitFor(() => {
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true);
    });
  });
});
