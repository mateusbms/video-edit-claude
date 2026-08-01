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
  has_hook: false, has_recipe: false, has_overlays: false, has_suggestions: false,
  has_render_16x9: false, has_render_9x16: true,
  bytes_source: 379_205_809, bytes_total: 395_000_000, bytes_render: 0, bytes_parts: 0,
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

  it("mostra o tamanho do render exportado na linha, separado do tamanho do projeto", async () => {
    // bytes_render foi modelado, tipado e testado no backend (N4), mas nunca
    // aparecia na tela — só tamanho(bytes_total), que não inclui output/.
    listJobs.mockResolvedValueOnce([{ ...projeto, bytes_render: 40_000_000 }]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    expect(await screen.findByText(/376(,|\.)7 MB/)).toBeInTheDocument();
    expect(screen.getByText(/38(,|\.)1 MB/)).toBeInTheDocument();
  });

  it("sem render exportado, não mostra tamanho de render nenhum", async () => {
    listJobs.mockResolvedValueOnce([{ ...projeto, bytes_render: 0 }]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    await screen.findByText("A1");
    expect(screen.queryByText(/exportado/i)).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: /apagar mesmo assim/i }));
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

  it("cita o tamanho do render mantido na confirmação de exclusão", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([{ ...projeto, bytes_render: 40_000_000 }]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /confirmar exclusão de A1/i });
    expect(aviso.textContent).toMatch(/38(,|\.)1 MB/);
  });

  it("nomeia os textos e as sugestões separadamente da receita de render", async () => {
    // Caminho determinístico do achado N1: o usuário termina os textos
    // (overlays.json + a recipe), depois troca a orientação — update_orientation
    // apaga edit-recipe.json mas mantém overlays.json e suggestions.json.
    // has_recipe sozinho não pode ser a fonte de "os textos": o projeto os
    // perderia sem o diálogo nunca ter avisado.
    const api = await import("../api");
    const soTextos = { ...projeto, has_recipe: false, has_overlays: true, has_suggestions: true };
    (api.listJobs as any).mockResolvedValueOnce([soTextos]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /confirmar exclusão de A1/i });
    expect(aviso.textContent).toMatch(/os textos/i);
    expect(aviso.textContent).toMatch(/as sugestões/i);
    expect(aviso.textContent).not.toMatch(/receita de render/i);
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
    const confirmar = await screen.findByRole("button", { name: /apagar mesmo assim/i });
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

  it("uma exclusão em voo numa linha não bloqueia a exclusão de outra linha", async () => {
    const api = await import("../api");
    const projetoB = { ...projeto, slug: "B1" };
    (api.listJobs as any).mockResolvedValueOnce([projeto, projetoB]);

    // deleteJob("A1") fica pendurado (não resolve sozinho); deleteJob("B1")
    // resolve normalmente — simula A ainda em voo quando B é confirmado.
    let resolverA: () => void = () => {};
    (api.deleteJob as any).mockImplementation((slug: string) => {
      if (slug === "A1") return new Promise<void>((resolve) => { resolverA = resolve; });
      return Promise.resolve();
    });

    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    // Só um diálogo por vez (modo global): "Apagar mesmo assim" sem qualificar
    // a linha ainda casa com exatamente um botão em cada passo deste teste.
    fireEvent.click(await screen.findByRole("button", { name: /apagar mesmo assim/i }));
    await waitFor(() => expect(api.deleteJob).toHaveBeenCalledWith("A1"));

    // A1 ainda não terminou. Mesmo assim, confirmar B1 tem que funcionar.
    fireEvent.click(await screen.findByRole("button", { name: /excluir B1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /apagar mesmo assim/i }));
    await waitFor(() => expect(api.deleteJob).toHaveBeenCalledWith("B1"));

    resolverA();
  });

  it("terminar a exclusão de uma linha não fecha o diálogo aberto (e ainda não confirmado) de outra", async () => {
    const api = await import("../api");
    const projetoB = { ...projeto, slug: "B1" };
    (api.listJobs as any).mockResolvedValueOnce([projeto, projetoB]);

    let resolverA: () => void = () => {};
    (api.deleteJob as any).mockImplementation((slug: string) => {
      if (slug === "A1") return new Promise<void>((resolve) => { resolverA = resolve; });
      return Promise.resolve();
    });

    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /apagar mesmo assim/i }));
    await waitFor(() => expect(api.deleteJob).toHaveBeenCalledWith("A1"));

    // Abre (sem confirmar) o diálogo de B1 enquanto A1 ainda está em voo —
    // o modo global passa a apontar para B1.
    fireEvent.click(await screen.findByRole("button", { name: /excluir B1/i }));
    await screen.findByRole("alertdialog", { name: /confirmar exclusão de B1/i });

    // A1 termina com sucesso. O `finally` de excluir(A1) não pode fechar o
    // diálogo de B1, que nunca foi confirmado.
    resolverA();
    await waitFor(() => expect(screen.queryByText("A1")).not.toBeInTheDocument());

    expect(screen.getByRole("alertdialog", { name: /confirmar exclusão de B1/i })).toBeInTheDocument();
  });

  it("projeto sem nenhum artefato não diz 'descarta nada'", async () => {
    const api = await import("../api");
    const vazio = {
      ...projeto,
      has_source: false, has_trimmed: false, has_transcript: false, has_hook: false,
      has_recipe: false, has_render_16x9: false, has_render_9x16: false,
    };
    (api.listJobs as any).mockResolvedValueOnce([vazio]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /confirmar exclusão de A1/i });
    expect(aviso.textContent).not.toMatch(/descarta nada/i);
    expect(aviso.textContent).toMatch(/vazio/i);
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

  it("com partes de upload, o diálogo mostra a soma e menciona as cópias do upload", async () => {
    // Pendência 3 do handoff: as partes em input/<slug>-part* também somem ao
    // liberar espaço, então o "Libera X MB" precisa incluí-las — sem isso o
    // diálogo subestima o que de fato é liberado.
    const api = await import("../api");
    const comPartes = { ...projeto, bytes_source: 100_000_000, bytes_parts: 20_000_000 };
    (api.listJobs as any).mockResolvedValueOnce([comPartes]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /liberar espaço de A1/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /confirmar liberar espaço de A1/i });
    expect(aviso.textContent).toMatch(/114(,|\.)4 MB/);
    expect(aviso.textContent).toMatch(/cópias do upload/i);
  });

  it("sem partes de upload, o diálogo não menciona as cópias do upload", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([{ ...projeto, bytes_parts: 0 }]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /liberar espaço de A1/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /confirmar liberar espaço de A1/i });
    expect(aviso.textContent).not.toMatch(/cópias do upload/i);
  });

  it("confirmar zera source e partes, e ajusta o tamanho total exibido", async () => {
    const api = await import("../api");
    const comPartes = {
      ...projeto,
      bytes_source: 100_000_000,
      bytes_parts: 20_000_000,
      bytes_total: 150_000_000,
    };
    (api.listJobs as any).mockResolvedValueOnce([comPartes]);
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /liberar espaço de A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^confirmar$/i }));
    await waitFor(() => expect(api.deleteSource).toHaveBeenCalledWith("A1"));
    // 150_000_000 - 100_000_000 - 20_000_000 = 30_000_000 bytes ~= 28.6 MB
    expect(await screen.findByText(/28(,|\.)6 MB/)).toBeInTheDocument();
  });
});

describe("ProjectsScreen — erro entre ações", () => {
  it("erro de uma ação não fica pendurado depois de outra dar certo", async () => {
    const api = await import("../api");
    // uma vez para a carga inicial, outra para o reload que a falha dispara (N3)
    (api.listJobs as any).mockResolvedValueOnce([projeto]).mockResolvedValueOnce([projeto]);
    (api.deleteJob as any).mockRejectedValueOnce(new Error("falhou"));
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /apagar mesmo assim/i }));
    expect(await screen.findByText(/não consegui apagar/i)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /renomear A1/i }));
    fireEvent.change(screen.getByLabelText(/título de A1/i), { target: { value: "Novo nome" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar nome de A1/i }));
    await waitFor(() => expect(api.putTitle).toHaveBeenCalled());

    expect(screen.queryByText(/não consegui apagar/i)).not.toBeInTheDocument();
  });
});

describe("ProjectsScreen — falha recarrega a lista (N3)", () => {
  it("falha ao excluir recarrega a lista — a árvore pode ter ficado parcialmente apagada", async () => {
    const api = await import("../api");
    (api.listJobs as any)
      .mockResolvedValueOnce([projeto])
      // depois do 409, o próprio projeto sumiu (delete parcial concorrente)
      .mockResolvedValueOnce([]);
    (api.deleteJob as any).mockRejectedValueOnce(new Error("arquivo em uso"));
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /excluir A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /apagar mesmo assim/i }));

    await waitFor(() => expect(api.listJobs).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("A1")).not.toBeInTheDocument());
  });

  it("falha ao liberar espaço recarrega a lista", async () => {
    const api = await import("../api");
    (api.listJobs as any)
      .mockResolvedValueOnce([projeto])
      .mockResolvedValueOnce([{ ...projeto, has_source: false, bytes_source: 0 }]);
    (api.deleteSource as any).mockRejectedValueOnce(new Error("arquivo em uso"));
    render(<ProjectsScreen onOpen={() => {}} onNew={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /liberar espaço de A1/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^confirmar$/i }));

    await waitFor(() => expect(api.listJobs).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /liberar espaço/i })).not.toBeInTheDocument());
  });
});
