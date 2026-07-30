import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";

const { listJobs, putTitle, deleteJob, deleteSource } = vi.hoisted(() => ({
  listJobs: vi.fn(),
  putTitle: vi.fn(async () => {}),
  deleteJob: vi.fn(async () => {}),
  deleteSource: vi.fn(async () => {}),
}));
vi.mock("../api", () => ({ listJobs, putTitle, deleteJob, deleteSource }));

import { ProjectsScreen } from "../ProjectsScreen";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const projeto = {
  slug: "A1", title: "", updated_at: 1_700_000_000, orientation: "9x16" as const,
  has_source: true, has_trimmed: true, has_transcript: true,
  has_hook: false, has_recipe: false,
  has_render_16x9: false, has_render_9x16: true,
  bytes_source: 379_205_809, bytes_total: 395_000_000, bytes_render: 0,
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

describe("ProjectsScreen — renomear", () => {
  it("salva o título e mostra o novo nome", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /renomear A1/i }));
    fireEvent.change(screen.getByLabelText(/título de A1/i), {
      target: { value: "Check-up da carteira" },
    });
    fireEvent.click(screen.getByRole("button", { name: /salvar nome de A1/i }));
    await waitFor(() =>
      expect(api.putTitle).toHaveBeenCalledWith("A1", "Check-up da carteira"));
    expect(await screen.findByText("Check-up da carteira")).toBeInTheDocument();
  });

  it("cancelar não grava nada", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /renomear A1/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(api.putTitle).not.toHaveBeenCalled();
  });
});

describe("ProjectsScreen — excluir", () => {
  it("pede confirmação antes e diz que o render sobrevive", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    expect(await screen.findByText(/vídeo já exportado/i)).toBeInTheDocument();
    expect(api.deleteJob).not.toHaveBeenCalled();
  });

  it("confirmar apaga e tira o projeto da lista", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirmar exclusão/i }));
    await waitFor(() => expect(api.deleteJob).toHaveBeenCalledWith("A1"));
    await waitFor(() => expect(screen.queryByText("A1")).not.toBeInTheDocument());
  });

  it("desistir fecha a confirmação sem apagar", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /desistir/i }));
    expect(api.deleteJob).not.toHaveBeenCalled();
    expect(screen.getByText("A1")).toBeInTheDocument();
  });

  it("lista o que o projeto realmente tem, nomeando hook e receita de render", async () => {
    const api = await import("../api");
    const completo = { ...projeto, has_hook: true, has_recipe: true };
    (api.listJobs as any).mockResolvedValueOnce([completo]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /confirmar exclusão de A1/i });
    expect(aviso.textContent).toMatch(/transcrição/i);
    expect(aviso.textContent).toMatch(/hook/i);
    expect(aviso.textContent).toMatch(/receita de render/i);
    expect(aviso.textContent).toMatch(/vídeo já exportado/i);
  });

  it("não menciona o que o projeto não tem", async () => {
    const api = await import("../api");
    const soVideo = {
      ...projeto,
      has_trimmed: false, has_transcript: false, has_hook: false, has_recipe: false,
      has_render_16x9: false, has_render_9x16: false,
    };
    (api.listJobs as any).mockResolvedValueOnce([soVideo]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /confirmar exclusão de A1/i });
    expect(aviso.textContent).not.toMatch(/transcrição/i);
    expect(aviso.textContent).not.toMatch(/vídeo já exportado/i);
  });

  it("esconde a barra de ações enquanto a confirmação está aberta", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    await screen.findByRole("alertdialog", { name: /confirmar exclusão de A1/i });
    expect(screen.queryByRole("button", { name: /renomear A1/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /abrir A1/i })).not.toBeInTheDocument();
  });

  it("dois cliques seguidos no confirmar chamam deleteJob uma única vez", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    const confirmar = await screen.findByRole("button", { name: /confirmar exclusão/i });
    // Um único `act` em volta dos dois cliques simula o clique duplo antes do
    // repaint: sem isso, o primeiro `fireEvent.click` já flusha e desmonta o
    // diálogo antes do segundo clique ser disparado, mascarando o bug.
    act(() => {
      fireEvent.click(confirmar);
      fireEvent.click(confirmar);
    });
    await waitFor(() => expect(api.deleteJob).toHaveBeenCalled());
    expect(api.deleteJob).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectsScreen — liberar espaço", () => {
  it("diz o quanto libera e o que deixa de ser possível", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /liberar espaço de A1/i }));
    expect(await screen.findByText(/detectar pausas/i)).toBeInTheDocument();
    expect(screen.getByText(/361(,|\.)6 MB/)).toBeInTheDocument();
  });

  it("confirmar apaga só o source e atualiza a linha", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /liberar espaço de A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(api.deleteSource).toHaveBeenCalledWith("A1"));
    expect(screen.getByText("A1")).toBeInTheDocument();
  });

  it("projeto sem source não oferece liberar espaço", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([
      { ...projeto, has_source: false, bytes_source: 0 },
    ]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    await screen.findByText("A1");
    expect(screen.queryByRole("button", { name: /liberar espaço/i })).not.toBeInTheDocument();
  });

  it("avisa que transcrever e cortes manuais continuam possíveis", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /liberar espaço de A1/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /confirmar liberar espaço de A1/i });
    expect(aviso.textContent).toMatch(/transcrever/i);
    expect(aviso.textContent).toMatch(/cortes manuais/i);
  });
});

describe("ProjectsScreen — erro entre ações", () => {
  it("erro de uma ação não fica pendurado depois de outra dar certo", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([projeto]);
    (api.deleteJob as any).mockRejectedValueOnce(new Error("falhou"));
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /confirmar exclusão/i }));
    expect(await screen.findByText(/não consegui apagar/i)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /renomear A1/i }));
    fireEvent.change(screen.getByLabelText(/título de A1/i), { target: { value: "Novo nome" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar nome de A1/i }));
    await waitFor(() => expect(api.putTitle).toHaveBeenCalled());

    expect(screen.queryByText(/não consegui apagar/i)).not.toBeInTheDocument();
  });
});
