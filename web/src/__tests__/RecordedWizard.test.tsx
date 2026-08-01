import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

// getJob e as dependências de HookStep/OverlaysStep entram no vi.hoisted (não
// só inline no factory) porque os testes de "papel" e "passo inicial" (Task
// 7) precisam trocar a implementação delas por teste — inline não dá para
// referenciar de fora do factory.
const {
  listJobs, getJob, getHook, putHook, runRecipe,
  getOverlays, putOverlays, getSuggestions, putSuggestions,
  getSuggestDefaults, putSuggestDefaults, generateSuggestions,
} = vi.hoisted(() => ({
  listJobs: vi.fn(async () => [] as any[]),
  getJob: vi.fn(async () => ({ config: {} }) as any),
  getHook: vi.fn(async () => ({}) as any),
  putHook: vi.fn(async () => {}),
  runRecipe: vi.fn(async () => {}),
  getOverlays: vi.fn(async () => [] as any[]),
  putOverlays: vi.fn(async () => {}),
  getSuggestions: vi.fn(async () => [] as any[]),
  putSuggestions: vi.fn(async () => {}),
  getSuggestDefaults: vi.fn(async () => ({}) as any),
  putSuggestDefaults: vi.fn(async () => {}),
  generateSuggestions: vi.fn(async () => [] as any[]),
}));
vi.mock("../api", async () => {
  // A classe real, não um dublê — senão `e instanceof SlugOcupado` no
  // UploadStep nunca casa (mesmo que o caminho não seja exercitado aqui).
  const real = await vi.importActual<typeof import("../api")>("../api");
  return {
    listJobs, getJob, getHook, putHook, runRecipe,
    getOverlays, putOverlays, getSuggestions, putSuggestions,
    getSuggestDefaults, putSuggestDefaults, generateSuggestions,
    getCuts: vi.fn(async () => null),
    getTranscript: vi.fn(async () => []),
    mediaUrl: (s: string, n: string) => `/api/jobs/${s}/files/${n}`,
    streamSSE: vi.fn(),
    uploadJob: vi.fn(),
    putOrientation: vi.fn(),
    SlugOcupado: real.SlugOcupado,
  };
});

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

// Task 7: passos por papel (matriz = só o corpo, sem hook falado), botão
// final "Concluir" na matriz e abertura direto num passo específico.
describe("RecordedWizard — matriz de variações de hook", () => {
  beforeEach(() => {
    getJob.mockReset();
    getJob.mockImplementation(async () => ({ config: {} }) as any);
    getHook.mockReset();
    getHook.mockImplementation(async () => ({}) as any);
    getOverlays.mockReset();
    getOverlays.mockImplementation(async () => [] as any[]);
    getSuggestions.mockReset();
    getSuggestions.mockImplementation(async () => [] as any[]);
    getSuggestDefaults.mockReset();
    getSuggestDefaults.mockImplementation(async () => ({}) as any);
    putOverlays.mockReset();
    putOverlays.mockImplementation(async () => {});
    runRecipe.mockReset();
    runRecipe.mockImplementation(async () => {});
  });

  it("projeto matriz mostra só Upload/Cortes/Transcrição/Textos", async () => {
    listJobs.mockResolvedValueOnce([{
      slug: "corpo", title: "", updated_at: 0, orientation: "9x16",
      has_source: true, has_trimmed: true, has_transcript: true,
      has_hook: false, has_recipe: false, has_overlays: false, has_suggestions: false,
      has_render_16x9: false, has_render_9x16: false,
      bytes_source: 1, bytes_total: 2, bytes_render: 0, bytes_parts: 0,
      papel: "matriz", origem_matriz: "",
    }] as any);
    getJob.mockImplementation(async () => ({ config: {}, papel: "matriz" }) as any);
    render(<RecordedWizard />);
    fireEvent.click(await screen.findByRole("button", { name: /abrir corpo/i }));
    // espera o passo trocar de "Hook" (papel ainda "normal" na primeira
    // renderização) para o conjunto curto da matriz
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /hook/i })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /render/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cortes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /transcrição/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /textos/i })).toBeInTheDocument();
  });

  it("no último passo da matriz, o botão vira Concluir e volta à lista", async () => {
    localStorage.setItem("edit-local:state", JSON.stringify({ slug: "corpo-h1", step: 3 }));
    getJob.mockImplementation(async () => ({ config: {}, papel: "matriz" }) as any);
    render(<RecordedWizard />);
    const concluir = await screen.findByRole("button", { name: /^concluir$/i });
    fireEvent.click(concluir);
    expect(await screen.findByText("Projetos")).toBeInTheDocument();
  });

  it("abrir com passo inicial cai direto no passo pedido", async () => {
    // Mesmo mecanismo que onOpen(slug, stepInicial) usa por baixo dos panos
    // (setSlug + setStep juntos, persistidos por loadState/saveState) — aqui
    // simulado direto pelo estado salvo, sem depender do botão "Nova
    // variação" (Task 8, fora do escopo desta task).
    localStorage.setItem("edit-local:state", JSON.stringify({ slug: "corpo-h1", step: 3 }));
    getJob.mockImplementation(async () => ({ config: {} }) as any); // papel normal
    render(<RecordedWizard />);
    expect(await screen.findByText(/4\. Hook \(abertura\)/i)).toBeInTheDocument();
  });
});
