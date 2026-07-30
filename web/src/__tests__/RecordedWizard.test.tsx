import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { listJobs } = vi.hoisted(() => ({ listJobs: vi.fn(async () => []) }));
vi.mock("../api", () => ({
  listJobs,
  getJob: vi.fn(async () => ({ config: {} })),
  getCuts: vi.fn(async () => null),
  getTranscript: vi.fn(async () => []),
  mediaUrl: (s: string, n: string) => `/api/jobs/${s}/files/${n}`,
  streamSSE: vi.fn(),
  uploadJob: vi.fn(),
  putOrientation: vi.fn(),
}));

import { RecordedWizard } from "../RecordedWizard";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("RecordedWizard", () => {
  it("sem projeto aberto, mostra a lista", async () => {
    render(<RecordedWizard />);
    expect(await screen.findByText("Projetos")).toBeInTheDocument();
  });

  it("abrir um projeto entra no wizard", async () => {
    listJobs.mockResolvedValueOnce([{
      slug: "A1", title: "", updated_at: 0, orientation: "9x16",
      has_source: true, has_trimmed: true, has_transcript: false,
      has_hook: false, has_recipe: false,
      has_render_16x9: false, has_render_9x16: false,
      bytes_source: 1, bytes_total: 2,
    }] as any);
    render(<RecordedWizard />);
    fireEvent.click(await screen.findByRole("button", { name: /abrir A1/i }));
    expect(await screen.findByText("Edit Local")).toBeInTheDocument();
  });

  it("do wizard dá para voltar à lista", async () => {
    listJobs.mockResolvedValue([{
      slug: "A1", title: "", updated_at: 0, orientation: "9x16",
      has_source: true, has_trimmed: true, has_transcript: false,
      has_hook: false, has_recipe: false,
      has_render_16x9: false, has_render_9x16: false,
      bytes_source: 1, bytes_total: 2,
    }] as any);
    render(<RecordedWizard />);
    fireEvent.click(await screen.findByRole("button", { name: /abrir A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /projetos/i }));
    expect(await screen.findByText("Projetos")).toBeInTheDocument();
  });

  it("novo projeto entra no wizard no passo de upload", async () => {
    render(<RecordedWizard />);
    fireEvent.click(await screen.findByRole("button", { name: /novo projeto/i }));
    expect(await screen.findByText(/1\. Subir/i)).toBeInTheDocument();
  });
});
