import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { UploadStep } from "../steps/UploadStep";

afterEach(cleanup);

const props = { slug: "", setSlug: () => {}, next: () => {}, back: () => {} };

function addFiles(names: string[]) {
  const input = screen.getByLabelText(/arquivos de vídeo/i) as HTMLInputElement;
  const files = names.map((n) => new File(["x"], n, { type: "video/mp4" }));
  fireEvent.change(input, { target: { files } });
}

describe("UploadStep", () => {
  it("lista arquivos na ordem selecionada", () => {
    render(<UploadStep {...props} />);
    addFiles(["a.mp4", "b.mp4"]);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("a.mp4");
    expect(items[1]).toContain("b.mp4");
  });

  it("reordena com a seta descer", () => {
    render(<UploadStep {...props} />);
    addFiles(["a.mp4", "b.mp4"]);
    fireEvent.click(screen.getByLabelText("descer a.mp4"));
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("b.mp4");
    expect(items[1]).toContain("a.mp4");
  });

  it("remove um arquivo", () => {
    render(<UploadStep {...props} />);
    addFiles(["a.mp4", "b.mp4"]);
    fireEvent.click(screen.getByLabelText("remover a.mp4"));
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("b.mp4");
  });
});
