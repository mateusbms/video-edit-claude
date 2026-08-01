import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor, act } from "@testing-library/react";

// vi.hoisted mantém a mesma instância do vi.fn tanto na variável local (usada
// nos testes antigos) quanto no módulo mockado (usado via `await import
// ("../api")` nos testes novos) — sem isso, ou os testes antigos quebram por
// TDZ, ou os novos não conseguem chamar `.mockResolvedValueOnce` etc.
const { uploadJob, putOrientation, getJob, listJobs } = vi.hoisted(() => ({
  uploadJob: vi.fn(),
  putOrientation: vi.fn(async (..._a: any[]) => {}),
  getJob: vi.fn(async (..._a: any[]) => ({}) as any),
  listJobs: vi.fn(async (..._a: any[]) => [] as any[]),
}));
vi.mock("../api", async () => {
  // A classe real, não um dublê — senão `e instanceof SlugOcupado` no
  // componente nunca casa e o diálogo de colisão não abre.
  const real = await vi.importActual<typeof import("../api")>("../api");
  return { uploadJob, putOrientation, getJob, listJobs, SlugOcupado: real.SlugOcupado };
});

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

describe("UploadStep — acessibilidade do diálogo de colisão", () => {
  it("ao abrir, o foco já está dentro do diálogo", async () => {
    const api = await import("../api");
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true } as any),
    );
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /projeto já existe/i });
    expect(aviso).toHaveAttribute("aria-modal", "true");
    expect(aviso.contains(document.activeElement)).toBe(true);
  });

  it("Esc fecha o diálogo de colisão sem substituir nem abrir o existente", async () => {
    const api = await import("../api");
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true } as any),
    );
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /projeto já existe/i });
    const chamadasAntes = (api.uploadJob as any).mock.calls.length;

    fireEvent.keyDown(aviso, { key: "Escape" });

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // não reenviou (nem substituiu, nem abriu o existente) — só sugeriu um
    // slug novo, igual ao botão "Criar novo projeto"
    expect((api.uploadJob as any).mock.calls.length).toBe(chamadasAntes);
  });
});

describe("abrir projeto existente (com slug)", () => {
  beforeEach(() => {
    uploadJob.mockReset();
    putOrientation.mockReset();
    getJob.mockReset();
  });

  it("carrega o probe do job e libera o Próximo sem precisar reenviar vídeo", async () => {
    getJob.mockImplementation(async () => ({
      probe: { width: 1080, height: 1920, fps: 30, duration: 12 },
      orientation: "9x16",
    }));
    render(<UploadStep {...props} slug="A1" />);
    expect(getJob).toHaveBeenCalledWith("A1");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /próximo/i })).not.toBeDisabled();
    });
    expect(uploadJob).not.toHaveBeenCalled();
  });
});

describe("escolha de formato", () => {
  beforeEach(() => {
    uploadJob.mockReset();
    putOrientation.mockReset();
    putOrientation.mockResolvedValue(undefined);
    getJob.mockReset();
    // por padrão o backend concorda com a detecção do probe
    getJob.mockImplementation(async () => ({}));
  });

  async function subir(width: number, height: number) {
    uploadJob.mockResolvedValue({
      slug: "v1",
      probe: { width, height, fps: 30, duration: 10 },
    });
    render(<UploadStep {...props} />);
    addFiles(["a.mp4"]);
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => screen.getByRole("radio", { name: /9:16/i }));
  }

  const marcado = (nome: RegExp) =>
    (screen.getByRole("radio", { name: nome }) as HTMLInputElement).checked;

  it("pré-seleciona 9:16 para fonte vertical", async () => {
    await subir(2160, 3840);
    expect((screen.getByRole("radio", { name: /9:16/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /16:9/i }) as HTMLInputElement).checked).toBe(false);
  });

  it("pré-seleciona 16:9 para fonte horizontal", async () => {
    await subir(1280, 720);
    expect((screen.getByRole("radio", { name: /16:9/i }) as HTMLInputElement).checked).toBe(true);
  });

  it("trocar o formato chama a API", async () => {
    await subir(2160, 3840);
    getJob.mockImplementation(async () => ({ orientation: "16x9" }));
    fireEvent.click(screen.getByRole("radio", { name: /16:9/i }));
    await waitFor(() => {
      expect(putOrientation).toHaveBeenCalledWith(expect.any(String), "16x9");
    });
  });

  it("respeita a orientação persistida do job em vez da detectada", async () => {
    // reenvio para um slug que já tinha escolha explícita: o backend manda
    getJob.mockImplementation(async () => ({ orientation: "16x9" }));
    await subir(2160, 3840); // fonte vertical
    await waitFor(() => expect(marcado(/16:9/i)).toBe(true));
    expect(marcado(/9:16/i)).toBe(false);
  });

  it("volta ao valor do backend se o PUT falhar", async () => {
    await subir(2160, 3840);
    expect(marcado(/9:16/i)).toBe(true);
    putOrientation.mockRejectedValue(new Error("sem rede"));
    getJob.mockImplementation(async () => ({ orientation: "9x16" }));
    fireEvent.click(screen.getByRole("radio", { name: /16:9/i }));
    await waitFor(() => expect(marcado(/9:16/i)).toBe(true));
  });
});

describe("avisos de formato cruzado", () => {
  beforeEach(() => {
    uploadJob.mockReset();
    putOrientation.mockReset();
    putOrientation.mockResolvedValue(undefined);
    getJob.mockReset();
    getJob.mockImplementation(async () => ({}));
  });

  async function subir(width: number, height: number) {
    uploadJob.mockResolvedValue({
      slug: "v1", probe: { width, height, fps: 30, duration: 10 },
    });
    render(<UploadStep {...props} />);
    addFiles(["a.mp4"]);
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => screen.getByRole("radio", { name: /9:16/i }));
  }

  it("não avisa nada quando o formato bate com o vídeo", async () => {
    await subir(1280, 720);
    expect(screen.queryByText(/desfocado/i)).toBeNull();
    expect(screen.queryByText(/trocou o formato/i)).toBeNull();
  });

  it("avisa sobre o reenquadramento e sobre o preview não simulá-lo", async () => {
    getJob.mockImplementation(async () => ({ orientation: "9x16" }));
    await subir(1280, 720); // fonte horizontal, job vertical
    const aviso = (await screen.findByText(/desfocado/i)).closest("p")!;
    expect(aviso.textContent).toMatch(/não/i);
    expect(aviso.textContent).toMatch(/preview/i);
  });

  it("avisa que trocar o formato muda o tamanho relativo dos textos", async () => {
    await subir(2160, 3840);
    expect(screen.queryByText(/trocou o formato/i)).toBeNull();
    getJob.mockImplementation(async () => ({ orientation: "16x9" }));
    fireEvent.click(screen.getByRole("radio", { name: /16:9/i }));
    const aviso = (await screen.findByText(/trocou o formato/i)).closest("p")!;
    expect(aviso.textContent).toMatch(/tamanho/i);
  });
});

describe("UploadStep — projeto novo e colisão de nome", () => {
  beforeEach(() => {
    uploadJob.mockReset();
    putOrientation.mockReset();
    putOrientation.mockResolvedValue(undefined);
    getJob.mockReset();
    getJob.mockImplementation(async () => ({}) as any);
    listJobs.mockReset();
    listJobs.mockImplementation(async () => []);
  });

  it("num projeto novo, sugere um nome livre em vez do slug atual", async () => {
    const api = await import("../api");
    (api.listJobs as any).mockResolvedValueOnce([
      { slug: "A1" }, { slug: "A2" }, { slug: "A3" },
    ]);
    render(<UploadStep {...props} slug="" />);
    const campo = await screen.findByLabelText(/nome do projeto/i);
    await waitFor(() => expect((campo as HTMLInputElement).value).toBe("A4"));
  });

  it("num backend lento, o que o usuário já digitou sobrevive à sugestão (I3)", async () => {
    const api = await import("../api");
    let resolverListJobs!: (v: { slug: string }[]) => void;
    (api.listJobs as any).mockReset();
    (api.listJobs as any).mockImplementationOnce(
      () => new Promise<{ slug: string }[]>((resolve) => { resolverListJobs = resolve; }),
    );
    render(<UploadStep {...props} slug="" />);
    const campo = (await screen.findByLabelText(/nome do projeto/i)) as HTMLInputElement;

    // digita antes do listJobs responder
    fireEvent.change(campo, { target: { value: "meu-video" } });
    expect(campo.value).toBe("meu-video");

    // agora a resposta (atrasada) chega
    await act(async () => {
      resolverListJobs([{ slug: "A1" }, { slug: "A2" }, { slug: "A3" }]);
      await Promise.resolve();
    });

    expect(campo.value).toBe("meu-video");
  });

  it("o 409 abre o diálogo dizendo o que existe", async () => {
    const api = await import("../api");
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true, has_trimmed: true } as any),
    );
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    expect(await screen.findByText(/já existe/i)).toBeInTheDocument();
  });

  it("nomeia textos e sugestões a partir de has_overlays/has_suggestions, não de has_recipe (achado E)", async () => {
    // Mesmo bug do N1 (ProjectsScreen) num segundo diálogo destrutivo:
    // update_orientation apaga edit-recipe.json ao trocar de formato, mas
    // overlays.json e suggestions.json sobrevivem — e "Substituir" os apaga
    // do mesmo jeito que apaga tudo mais. has_recipe sozinho não pode ser a
    // fonte de "textos" aqui.
    const api = await import("../api");
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({
        slug: "A1", has_recipe: false, has_overlays: true, has_suggestions: true,
      } as any),
    );
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /projeto já existe/i });
    expect(aviso.textContent).toMatch(/textos/i);
    expect(aviso.textContent).toMatch(/sugestões/i);
  });

  it("também nomeia a receita de render (resíduo do achado E: sumiu ao trocar has_recipe por has_overlays/has_suggestions)", async () => {
    // edit-recipe.json está em DERIVADOS_DO_SOURCE — "Substituir" o apaga
    // igual aos outros. Ao corrigir "textos"/"sugestões" para saírem de
    // has_overlays/has_suggestions, has_recipe saiu da lista por completo em
    // vez de continuar como um item à parte (é o que ProjectsScreen faz).
    const api = await import("../api");
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({
        slug: "A1", has_recipe: true, has_overlays: false, has_suggestions: false,
      } as any),
    );
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    const aviso = await screen.findByRole("alertdialog", { name: /projeto já existe/i });
    expect(aviso.textContent).toMatch(/receita de render/i);
  });

  it("substituir reenvia com overwrite", async () => {
    const api = await import("../api");
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true } as any),
    );
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    fireEvent.click(await screen.findByRole("button", { name: /substituir/i }));
    await waitFor(() => {
      const ultima = (api.uploadJob as any).mock.calls.at(-1);
      expect(ultima[2]).toBe(true);
    });
  });

  it("substituir mira sempre no slug da colisão, não no que estiver no campo (C1)", async () => {
    // O campo fica em "meu-projeto-x" (digitado à mão), mas o 409 volta
    // dizendo que quem colidiu foi "A1" — dois nomes diferentes, de propósito.
    // Se "Substituir" usasse o campo em vez do slug confirmado no diálogo, o
    // upload iria para o projeto errado — exatamente o bug do incidente.
    const api = await import("../api");
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true } as any),
    );
    render(<UploadStep {...props} slug="" />);
    const campo = (await screen.findByLabelText(/nome do projeto/i)) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "meu-projeto-x" } });
    expect(campo.value).toBe("meu-projeto-x");
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await screen.findByText(/já existe/i);
    expect(campo.value).toBe("meu-projeto-x"); // o diálogo não mexeu no campo
    fireEvent.click(screen.getByRole("button", { name: /substituir/i }));
    await waitFor(() => {
      const ultima = (api.uploadJob as any).mock.calls.at(-1);
      expect(ultima[1]).toBe("A1");
    });
  });

  it("mudar o campo com a colisão aberta fecha o diálogo (C1)", async () => {
    // A confirmação "O projeto A1 já existe" deixa de valer assim que o
    // campo muda — senão dá para editar o nome com o diálogo ainda aberto
    // e clicar "Substituir" mirando num projeto que nunca foi confirmado.
    const api = await import("../api");
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true } as any),
    );
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await screen.findByText(/já existe/i);

    fireEvent.change(screen.getByLabelText(/nome do projeto/i), {
      target: { value: "outro-projeto" },
    });

    expect(screen.queryByText(/já existe/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /substituir/i })).not.toBeInTheDocument();
  });

  it("criar novo projeto troca o nome e não sobrescreve nada", async () => {
    const api = await import("../api");
    // O campo nasce em "A2" (só "A1" está ocupado)...
    (api.listJobs as any).mockResolvedValueOnce([{ slug: "A1" }]);
    render(<UploadStep {...props} slug="" />);
    const campo = (await screen.findByLabelText(/nome do projeto/i)) as HTMLInputElement;
    await waitFor(() => expect(campo.value).toBe("A2"));

    // ...mas o usuário reusa "A1" na mão, como no incidente original.
    fireEvent.change(campo, { target: { value: "A1" } });
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true } as any),
    );
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    // Aqui o campo está em "A1" (o nome que colidiu) — se o onClick de
    // "Criar novo projeto" for removido, o teste falha porque o valor
    // continuaria "A1" em vez de voltar para "A2".
    fireEvent.click(await screen.findByRole("button", { name: /criar novo/i }));
    await waitFor(() => expect(campo.value).toBe("A2"));
  });

  it("com listJobs falho, 'Criar novo projeto' não repete o slug que acabou de colidir (M3)", async () => {
    // slugsUsados fica [] quando listJobs falha — sem excluir o slug da
    // colisão, o botão podia sugerir de volta o mesmo nome ocupado.
    const api = await import("../api");
    (api.listJobs as any).mockRejectedValueOnce(new Error("offline"));
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true } as any),
    );
    render(<UploadStep {...props} slug="" />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await screen.findByText(/já existe/i);
    const campo = screen.getByLabelText(/nome do projeto/i) as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: /criar novo/i }));
    expect(campo.value).not.toBe("A1");
  });

  it("abrir o existente troca o slug e avança sem reenviar", async () => {
    const api = await import("../api");
    const setSlug = vi.fn();
    const next = vi.fn();
    (api.uploadJob as any).mockRejectedValueOnce(
      new api.SlugOcupado({ slug: "A1", has_transcript: true } as any),
    );
    render(<UploadStep {...props} setSlug={setSlug} next={next} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    fireEvent.click(await screen.findByRole("button", { name: /abrir o existente/i }));
    expect(setSlug).toHaveBeenCalledWith("A1");
    expect(next).toHaveBeenCalled();
    // Abrir o projeto existente não pode disparar upload nenhum — só a
    // chamada original, que resultou no 409.
    expect((api.uploadJob as any).mock.calls.length).toBe(1);
  });
});

describe("UploadStep — toggle de matriz", () => {
  beforeEach(() => {
    uploadJob.mockReset();
    uploadJob.mockResolvedValue({ slug: "v1", probe: null });
    putOrientation.mockReset();
    getJob.mockReset();
    getJob.mockImplementation(async () => ({}) as any);
    listJobs.mockReset();
    listJobs.mockImplementation(async () => []);
  });

  it("com o toggle de matriz marcado, o upload manda papel=matriz", async () => {
    render(<UploadStep {...props} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /matriz de variações de hook/i }));
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => expect(uploadJob).toHaveBeenCalled());
    const chamada = (uploadJob as any).mock.calls.at(-1);
    expect(chamada[3]).toBe("matriz");
  });

  it("sem o toggle, o upload continua normal", async () => {
    render(<UploadStep {...props} />);
    fireEvent.change(screen.getByLabelText(/arquivos de vídeo/i), {
      target: { files: [new File(["x"], "v.mp4", { type: "video/mp4" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar/i }));
    await waitFor(() => expect(uploadJob).toHaveBeenCalled());
    const chamada = (uploadJob as any).mock.calls.at(-1);
    expect(chamada[3]).toBe("normal");
  });
});
