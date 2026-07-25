import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("../animatedApi", () => ({
  listBrandKits: vi.fn(async () => ([{ slug: "acme", name: "Acme", colors: {}, fonts: {} }])),
  createBrandKit: vi.fn(),
  updateBrandKit: vi.fn(),
}));
// mock the modal to a no-op so we test the picker in isolation
vi.mock("../components/BrandKitModal", () => ({ BrandKitModal: () => null }));

import { BrandKitPicker } from "../components/BrandKitPicker";

beforeEach(() => vi.clearAllMocks());

describe("BrandKitPicker", () => {
  it("lista os kits e seleciona ao clicar", async () => {
    const onChange = vi.fn();
    render(<BrandKitPicker value="" onChange={onChange} />);
    const btn = await screen.findByRole("button", { name: /acme/i });
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledWith("acme");
  });
});
