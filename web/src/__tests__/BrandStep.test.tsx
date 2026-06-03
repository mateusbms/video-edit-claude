import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BrandStep } from "../steps/animated/BrandStep";
import * as api from "../animatedApi";
import { useAppStore } from "../state";

vi.mock("../animatedApi", () => ({
  listBrandKits: vi.fn().mockResolvedValue([
    { slug: "acme", name: "Acme", logo: "logo.png", colors: {}, fonts: {} },
  ]),
}));

beforeEach(() =>
  useAppStore.setState({
    animatedState: {
      brandKitSlug: null,
      scripts: {},
      audioResults: null,
      orientation: "16x9",
      jobId: null,
    },
  })
);

describe("BrandStep", () => {
  it("lists kits and lets user pick one", async () => {
    const onNext = vi.fn();
    render(<BrandStep onNext={onNext} />);
    await waitFor(() => screen.getByText("Acme"));
    fireEvent.click(screen.getByText("Acme"));
    fireEvent.click(screen.getByRole("button", { name: /pr.ximo/i }));
    expect(onNext).toHaveBeenCalled();
  });
});
