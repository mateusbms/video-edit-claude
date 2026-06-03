import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReviewStep } from "../steps/animated/ReviewStep";
import { useAppStore } from "../state";

vi.mock("../animatedApi", () => ({
  createAnimatedJob: vi.fn().mockResolvedValue({ jobId: "abc" }),
}));

describe("ReviewStep", () => {
  it("posts the job and stores jobId", async () => {
    useAppStore.setState({
      mode: "animated",
      animatedState: {
        brandKitSlug: "acme",
        scripts: Object.fromEntries(["s01","s02","s03","s04","s05","s06","s06b","s07","s08","s09","s10"].map(k => [k, "x"])),
        audioResults: null,
        orientation: "16x9",
        jobId: null,
        previewJobId: null,
      } as any,
    });
    render(<ReviewStep onNext={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /renderizar/i }));
    await new Promise(r => setTimeout(r, 0));
    expect(useAppStore.getState().animatedState.jobId).toBe("abc");
  });
});
