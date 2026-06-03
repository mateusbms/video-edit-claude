import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { ModeSelect } from "../steps/ModeSelect";
import { useAppStore } from "../state";

beforeEach(() => useAppStore.setState({ mode: null }));

describe("ModeSelect", () => {
  it("sets mode on click", () => {
    render(<ModeSelect />);
    fireEvent.click(screen.getByRole("button", { name: /animado/i }));
    expect(useAppStore.getState().mode).toBe("animated");
  });
});
