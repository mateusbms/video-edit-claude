import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const { listJobs } = vi.hoisted(() => ({ listJobs: vi.fn() }));
vi.mock("../api", () => ({ listJobs }));

import { ProjectsScreen } from "../ProjectsScreen";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const projeto = {
  slug: "A1", title: "", updated_at: 1_700_000_000, orientation: "9x16" as const,
  has_source: true, has_trimmed: true, has_transcript: true,
  has_hook: false, has_recipe: false,
  has_render_16x9: false, has_render_9x16: true,
  bytes_source: 379_205_809, bytes_total: 395_000_000,
};

describe("ProjectsScreen", () => {
  it("lista os projetos salvos", async () => {
    listJobs.mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText("A1")).toBeInTheDocument();
  });

  it("abre o projeto escolhido", async () => {
    const onOpen = vi.fn();
    listJobs.mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={onOpen} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /abrir A1/i }));
    expect(onOpen).toHaveBeenCalledWith("A1");
  });

  it("mostra em que passo o projeto parou", async () => {
    listJobs.mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText(/renderizado/i)).toBeInTheDocument();
  });

  it("mostra o espaço ocupado", async () => {
    listJobs.mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText(/376(,|\.)7 MB/)).toBeInTheDocument();
  });

  it("sem projetos, convida a criar o primeiro", async () => {
    listJobs.mockResolvedValueOnce([]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText(/nenhum projeto ainda/i)).toBeInTheDocument();
  });

  it("o botão de novo projeto avisa quem chamou", async () => {
    const onNew = vi.fn();
    listJobs.mockResolvedValueOnce([]);
    render(<ProjectsScreen onOpen={() => {}} onNew={onNew} />);
    fireEvent.click(await screen.findByRole("button", { name: /novo projeto/i }));
    expect(onNew).toHaveBeenCalled();
  });

  it("backend fora do ar mostra o erro em vez de tela vazia", async () => {
    listJobs.mockRejectedValueOnce(new Error("Failed to fetch"));
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText(/não consegui carregar/i)).toBeInTheDocument();
  });

  it("projeto sem source.mp4 mostra 'sem vídeo', não 'só o vídeo'", async () => {
    const semVideo = {
      ...projeto,
      slug: "A2",
      has_source: false,
      has_trimmed: false,
      has_transcript: false,
      has_render_9x16: false,
    };
    listJobs.mockResolvedValueOnce([semVideo]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText(/sem vídeo/i)).toBeInTheDocument();
    expect(screen.queryByText(/só o vídeo/i)).not.toBeInTheDocument();
  });
});
