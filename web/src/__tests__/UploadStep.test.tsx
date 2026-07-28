import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor } from "@testing-library/react";

const uploadJob = vi.fn();
const putOrientation = vi.fn(async (..._a: any[]) => {});
const getJob = vi.fn(async (..._a: any[]) => ({}) as any);
vi.mock("../api", () => ({
  uploadJob: (...a: any[]) => uploadJob(...a),
  putOrientation: (...a: any[]) => putOrientation(...a),
  getJob: (...a: any[]) => getJob(...a),
}));

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
