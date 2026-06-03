import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BrandKitModal } from "../components/BrandKitModal";

afterEach(cleanup);

describe("BrandKitModal", () => {
  it("disables save until valid", () => {
    render(<BrandKitModal open onClose={() => {}} onCreated={() => {}} />);
    const save = screen.getByRole("button", { name: /salvar/i });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: "Acme" } });
    // Save is still disabled without a logo file
    expect(save).toBeDisabled();
  });

  it("renders nothing when closed", () => {
    render(<BrandKitModal open={false} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders dialog when open", () => {
    render(<BrandKitModal open onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
