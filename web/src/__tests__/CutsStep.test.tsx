import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

const { streamSSE, getCuts, getJob } = vi.hoisted(() => ({
  streamSSE: vi.fn(async (url: string, _opts: any, on: any) => {
    if (url.includes("/refine")) {
      on.progress?.({ n: 1, total: 4 });
      on.done?.({ trimmed_duration: 5, trimmed_mtime: 222 });
    } else if (url.includes("/cut")) {
      on.progress?.({ n: 3, total: 6 });
      on.done?.({
        original_duration: 10, trimmed_duration: 6,
        segments: [{ start: 0, end: 3 }, { start: 5, end: 8 }],
        trimmed_mtime: 111,
      });
    }
  }),
  // sem corte anterior por padrão; cada teste de remontagem sobrescreve
  getCuts: vi.fn(async () => null),
  getJob: vi.fn(async () => ({ config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 } })),
}));
vi.mock("../api", () => ({
  mediaUrl: (slug: string, name: string) => `/api/jobs/${slug}/files/${name}`,
  streamSSE, getCuts, getJob,
}));

import { CutsStep } from "../steps/CutsStep";

const props = { slug: "v1", setSlug: () => {}, next: () => {}, back: () => {} };
beforeEach(() => vi.clearAllMocks());

async function doCut(container: HTMLElement) {
  fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
  await waitFor(() => expect(screen.getByText(/trechos mantidos/i)).toBeInTheDocument());
  return container.querySelector("video") as HTMLVideoElement;
}

describe("CutsStep — retomar o trabalho ao voltar para o passo", () => {
  // O wizard monta um passo por vez, então voltar da Transcrição remonta este
  // componente do zero. Antes disso o painel voltava vazio e os sliders nos
  // padrões, mesmo com o corte salvo em disco.
  it("remonta o resultado do corte salvo, sem precisar detectar de novo", async () => {
    getCuts.mockResolvedValueOnce({
      original_duration: 121.288, trimmed_duration: 51.066,
      segments: [{ start: 3, end: 8 }, { start: 18, end: 27 }],
      trimmed_mtime: 999,
    } as any);
    render(<CutsStep {...props} />);
    expect(await screen.findByText(/2 trechos mantidos/i)).toBeInTheDocument();
    // e sem ter chamado /cut de novo
    expect(streamSSE).not.toHaveBeenCalled();
  });

  it("remonta os sliders com os parâmetros salvos do job", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -42, padding: 0.35, min_silence: 1.4 },
    } as any);
    render(<CutsStep {...props} />);
    await waitFor(() => expect(screen.getByText("-42 dB")).toBeInTheDocument());
    expect(screen.getByText("0.35 s")).toBeInTheDocument();
    expect(screen.getByText("1.4 s")).toBeInTheDocument();
  });

  it("libera o Próximo ao remontar, sem exigir novo corte", async () => {
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6, segments: [{ start: 0, end: 6 }], trimmed_mtime: 5,
    } as any);
    render(<CutsStep {...props} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /próximo/i })).not.toBeDisabled());
  });

  it("sem corte anterior, não mostra painel nem trava o passo", async () => {
    render(<CutsStep {...props} />);
    await waitFor(() => expect(getCuts).toHaveBeenCalledWith("v1"));
    expect(screen.queryByText(/trechos mantidos/i)).not.toBeInTheDocument();
  });
});

describe("CutsStep — versão do preview", () => {
  // corte e refino reescrevem trimmed.mp4 no mesmo caminho; a URL precisa mudar
  // ou o navegador serve pedaços do vídeo anterior
  it("usa o mtime salvo como versão ao remontar", async () => {
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6, segments: [{ start: 0, end: 6 }], trimmed_mtime: 999,
    } as any);
    const { container } = render(<CutsStep {...props} />);
    await screen.findByText(/trechos mantidos/i);
    expect(container.querySelector("video")!.getAttribute("src")).toContain("?v=999");
  });

  it("troca de versão depois de detectar pausas", async () => {
    const { container } = render(<CutsStep {...props} />);
    const video = await doCut(container);
    expect(video.getAttribute("src")).toContain("?v=111");
  });

  it("troca de versão depois de aplicar cortes manuais", async () => {
    const { container } = render(<CutsStep {...props} />);
    const video = await doCut(container);
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    await waitFor(() =>
      expect(container.querySelector("video")!.getAttribute("src")).toContain("?v=222"));
  });
});

describe("CutsStep manual cut", () => {
  it("marca um trecho a remover (início + fim) e lista", async () => {
    const { container } = render(<CutsStep {...props} />);
    const video = await doCut(container);
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    expect(screen.getByRole("button", { name: /remover trecho 1/i })).toBeInTheDocument();
  });

  it("aplica os cortes chamando streamSSE em /refine", async () => {
    const { container } = render(<CutsStep {...props} />);
    const video = await doCut(container);
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    await waitFor(() => {
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true);
    });
  });
});

describe("CutsStep — projeto sem o vídeo original", () => {
  it("desabilita Detectar pausas e explica por quê", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
      has_source: false,
    } as any);
    render(<CutsStep {...props} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /detectar pausas/i })).toBeDisabled());
    expect(screen.getByText(/liberar espaço/i)).toBeInTheDocument();
  });

  it("com o vídeo original, o botão continua ativo e sem aviso", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
      has_source: true,
    } as any);
    render(<CutsStep {...props} />);
    await waitFor(() => expect(getJob).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /detectar pausas/i })).not.toBeDisabled();
    expect(screen.queryByText(/liberar espaço/i)).not.toBeInTheDocument();
  });

  it("os cortes manuais continuam disponíveis sem o original", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
      has_source: false,
    } as any);
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 6 }], trimmed_mtime: 5,
    } as any);
    render(<CutsStep {...props} />);
    expect(await screen.findByRole("button", { name: /marcar início/i })).toBeInTheDocument();
  });
});

describe("CutsStep — aviso antes do corte manual destruir trabalho", () => {
  const comTrabalho = {
    config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
    has_source: true, has_transcript: true, has_overlays: true,
    has_suggestions: false, has_recipe: true,
  };

  async function marcarUmTrecho(container: HTMLElement) {
    const video = await doCut(container);
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
  }

  it("pergunta antes de aplicar, listando o que será descartado", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const { container } = render(<CutsStep {...props} />);
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));

    expect(await screen.findByText(/transcrição/i)).toBeInTheDocument();
    expect(screen.getByText(/textos/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(false);
  });

  it("confirmar aplica de verdade", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const { container } = render(<CutsStep {...props} />);
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));

    await waitFor(() =>
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true));
  });

  it("desistir não aplica nada e mantém os trechos marcados", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const { container } = render(<CutsStep {...props} />);
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /desistir/i }));

    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(false);
    expect(screen.getByRole("button", { name: /remover trecho 1/i })).toBeInTheDocument();
  });

  it("sem nada a perder, aplica direto e não pergunta", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
      has_source: true, has_transcript: false, has_overlays: false,
      has_suggestions: false, has_recipe: false,
    } as any);
    const { container } = render(<CutsStep {...props} />);
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));

    await waitFor(() =>
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true));
  });

  it("o segundo corte da mesma sessão não avisa de novo", async () => {
    // o refino já apagou tudo; avisar outra vez seria mentira
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const { container } = render(<CutsStep {...props} />);
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));
    await waitFor(() =>
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true));

    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    await waitFor(() => {
      const refines = streamSSE.mock.calls.filter((c) => String(c[0]).includes("/refine"));
      expect(refines.length).toBe(2);
    });
  });
});
