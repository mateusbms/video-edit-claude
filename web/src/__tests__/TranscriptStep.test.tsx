import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

vi.mock("../api", () => ({
  getTranscript: vi.fn(async () => ([
    { text: "olá", start: 0, end: 1, words: [{ word: "olá", start: 0, end: 1 }] },
  ])),
  putTranscript: vi.fn(async () => {}),
  streamSSE: vi.fn(async () => {}),
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
}));

import { TranscriptStep } from "../steps/TranscriptStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("TranscriptStep preview", () => {
  it("mostra um <video> do trimmed quando há transcript", async () => {
    const { container } = render(<TranscriptStep {...props} />);
    await waitFor(() => {
      const v = container.querySelector("video");
      expect(v).not.toBeNull();
      expect(v!.getAttribute("src")).toContain("/files/trimmed.mp4");
    });
  });
});
