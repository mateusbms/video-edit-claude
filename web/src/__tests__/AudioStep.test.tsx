import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AudioStep } from "../steps/animated/AudioStep";
import { useAppStore } from "../state";

vi.mock("../animatedApi", () => ({
  generateTts: vi.fn().mockResolvedValue([
    { key: "s01", file: "/tmp/s01.mp3", seconds: 2, frames: 60 },
  ]),
}));

describe("AudioStep", () => {
  it("generates audio and stores results", async () => {
    useAppStore.setState({
      mode: "animated",
      animatedState: {
        brandKitSlug: "acme",
        scripts: { s01: "hi" },
        audioResults: null,
        orientation: "16x9",
        jobId: null,
        previewJobId: "preview-123",
      } as any,
    });
    render(<AudioStep onNext={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /gerar narra/i }));
    await waitFor(() =>
      expect(useAppStore.getState().animatedState.audioResults).toHaveLength(1)
    );
  });
});
