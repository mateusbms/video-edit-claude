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

const comTrabalho = {
  config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
  has_source: true, has_transcript: true, has_overlays: true,
  has_suggestions: false, has_recipe: true,
};

async function doCut(container: HTMLElement) {
  // o botão fica desabilitado enquanto o getJob não responde (carregandoJob)
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /detectar pausas/i })).not.toBeDisabled());
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

  // achado Important da revisão final: espelho do teste equivalente de
  // `aPerder` — `j?.has_source !== false` é otimista de propósito (tem
  // source, ou não sabemos). Uma falha de rede não pode desabilitar o botão
  // nem estampar a explicação de "liberado para liberar espaço", que seria
  // falsa aqui.
  it("com getJob rejeitando, Detectar pausas continua habilitado e sem o aviso", async () => {
    getJob.mockRejectedValueOnce(new Error("falha de rede"));
    render(<CutsStep {...props} />);
    await waitFor(() => expect(getJob).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /detectar pausas/i })).not.toBeDisabled();
    expect(screen.queryByText(/liberar espaço/i)).not.toBeInTheDocument();
  });

  // achado Important da revisão final: sem source e sem corte salvo não há
  // trimmed.mp4 nenhum — a mensagem antiga prometia "os cortes manuais
  // continuam funcionando", o que é falso quando não existe vídeo cortado.
  it("sem source e sem corte salvo, a mensagem não promete cortes manuais", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
      has_source: false,
    } as any);
    render(<CutsStep {...props} />);
    await waitFor(() => expect(screen.getByText(/liberar espaço/i)).toBeInTheDocument());
    expect(screen.queryByText(/cortes manuais.*continuam/i)).not.toBeInTheDocument();
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
  // Com o Detectar pausas também invalidando os derivados, um corte feito
  // nesta sessão zera o aviso — o caminho real para ter algo a perder E um
  // corte na tela é reabrir um projeto que já tem corte salvo.
  async function montarComCorteSalvo() {
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 6 }], trimmed_mtime: 5,
    } as any);
    const { container } = render(<CutsStep {...props} />);
    await screen.findByText(/trechos mantidos/i);
    return container;
  }

  async function marcarUmTrecho(container: HTMLElement) {
    const video = container.querySelector("video") as HTMLVideoElement;
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /aplicar cortes/i })).not.toBeDisabled());
  }

  it("pergunta antes de aplicar, listando o que será descartado", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const container = await montarComCorteSalvo();
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));

    expect(await screen.findByText(/transcrição/i)).toBeInTheDocument();
    expect(screen.getByText(/textos/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(false);
  });

  it("confirmar aplica de verdade", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const container = await montarComCorteSalvo();
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));

    await waitFor(() =>
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true));
  });

  it("desistir não aplica nada e mantém os trechos marcados", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const container = await montarComCorteSalvo();
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
    const container = await montarComCorteSalvo();
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));

    await waitFor(() =>
      expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(true));
  });

  // achado Minor da revisão final: a frase extra sobre re-transcrever era
  // decidida por `aPerder.includes("a transcrição")` — uma busca na string de
  // exibição. Fixamos num booleano derivado direto de `has_transcript`
  // (`perdeTranscricao`); estes dois testes travam o comportamento dos dois
  // lados.
  it("com has_transcript, avisa que será preciso transcrever de novo", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const container = await montarComCorteSalvo();
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));

    expect(await screen.findByText(/transcrever outra vez/i)).toBeInTheDocument();
  });

  it("sem has_transcript, não avisa sobre transcrever de novo mesmo com outra coisa a perder", async () => {
    getJob.mockResolvedValueOnce({
      config: { silence_threshold_db: -30, padding: 0.1, min_silence: 0.5 },
      has_source: true, has_transcript: false, has_overlays: true,
      has_suggestions: false, has_recipe: false,
    } as any);
    const container = await montarComCorteSalvo();
    await marcarUmTrecho(container);
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));

    expect(await screen.findByText(/os textos/i)).toBeInTheDocument();
    expect(screen.queryByText(/transcrever outra vez/i)).not.toBeInTheDocument();
  });

  it("o segundo corte da mesma sessão não avisa de novo", async () => {
    // o refino já apagou tudo; avisar outra vez seria mentira
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const container = await montarComCorteSalvo();
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

  // achado Important da revisão: getJob (popula aPerder) e getCuts (libera o
  // painel de cortes manuais) correm em paralelo no mesmo useEffect. Com um
  // corte salvo, getCuts pode responder primeiro — nesse intervalo aPerder
  // ainda é null, e "Aplicar cortes" não pode se comportar como se não
  // houvesse nada a perder.
  it("com corte salvo, espera o getJob antes de liberar Aplicar cortes", async () => {
    let resolveJob!: (v: any) => void;
    getJob.mockReturnValueOnce(new Promise((res) => { resolveJob = res; }));
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 6 }], trimmed_mtime: 5,
    } as any);
    const { container } = render(<CutsStep {...props} />);
    await screen.findByText(/trechos mantidos/i);
    const video = container.querySelector("video") as HTMLVideoElement;
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));

    // getJob ainda não respondeu: não dá para saber o que o refino apagaria
    expect(screen.getByRole("button", { name: /aplicar cortes/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(false);

    resolveJob(comTrabalho);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /aplicar cortes/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(false);
  });

  // achado Important (2ª rodada): a correção da corrida trocou "aplica sem
  // avisar" por "trava sem explicar" — um getJob que falha deixava aPerder em
  // null para sempre, e o botão ficava desabilitado esperando uma resposta
  // que não vem mais. `carregandoJob` separa "ainda esperando" de "não
  // consegui saber": no segundo caso o botão libera e pedirParaAplicar cai no
  // caminho defensivo (confirma mesmo sem saber o que há a perder).
  it("com getJob rejeitando, libera Aplicar cortes e confirma sem saber o que há a perder", async () => {
    getJob.mockRejectedValueOnce(new Error("falha de rede"));
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 6 }], trimmed_mtime: 5,
    } as any);
    const { container } = render(<CutsStep {...props} />);
    await screen.findByText(/trechos mantidos/i);
    const video = container.querySelector("video") as HTMLVideoElement;
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));

    // getJob nunca vai responder de novo: esperar por ele travaria o botão
    // para sempre, então libera assim que a rejeição chega
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /aplicar cortes/i })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    expect(await screen.findByText(/não foi possível confirmar/i)).toBeInTheDocument();
    // achado Minor da revisão final: o ramo de estado desconhecido listava só
    // "a transcrição, os textos e as sugestões" — a receita de render também
    // é apagada pelo refino e ficava de fora, ao contrário do ramo conhecido.
    expect(screen.getByText(/receita de render/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/refine"))).toBe(false);
  });

  // achado Minor 4: erro/catch não tocam em aPerder, mas nada garantia isso
  // contra uma regressão futura
  it("refino que falha mantém o aviso para a próxima tentativa", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    const container = await montarComCorteSalvo();
    await marcarUmTrecho(container);

    streamSSE.mockImplementationOnce(async (_url: string, _opts: any, on: any) => {
      on.error?.({ detail: "falha simulada" });
    });
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));
    await screen.findByText(/falha simulada/i);

    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));
    expect(await screen.findByText(/transcrição/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.filter((c) => String(c[0]).includes("/refine")).length).toBe(1);
  });
});

describe("CutsStep — aviso antes do Detectar pausas destruir trabalho", () => {
  // stage_cut agora invalida transcript/recipe/overlays/suggestions (mesma
  // invalidação do refino), então o botão confirma antes quando há o que
  // perder — o mesmo portão do "Aplicar cortes".
  async function esperarBotao() {
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /detectar pausas/i })).not.toBeDisabled());
    return screen.getByRole("button", { name: /detectar pausas/i });
  }

  it("pergunta antes de detectar de novo, listando o que será descartado", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());

    expect(await screen.findByText(/refaz o corte/i)).toBeInTheDocument();
    expect(screen.getByText(/transcrição/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/cut"))).toBe(false);
  });

  it("confirmar corta de verdade", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));

    expect(await screen.findByText(/trechos mantidos/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/cut"))).toBe(true);
  });

  it("desistir não corta nada", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());
    fireEvent.click(await screen.findByRole("button", { name: /desistir/i }));

    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/cut"))).toBe(false);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("sem nada a perder, corta direto e não pergunta", async () => {
    // getJob padrão: sem flags has_* → aPerder = []
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());

    expect(await screen.findByText(/trechos mantidos/i)).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("com getJob rejeitando, confirma sem saber o que há a perder", async () => {
    getJob.mockRejectedValueOnce(new Error("falha de rede"));
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());

    expect(await screen.findByText(/não foi possível confirmar/i)).toBeInTheDocument();
    expect(screen.getByText(/receita de render/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.some((c) => String(c[0]).includes("/cut"))).toBe(false);
  });

  it("depois de um corte confirmado, re-detectar não pergunta de novo", async () => {
    // o corte acabou de apagar os derivados; avisar outra vez seria mentira
    getJob.mockResolvedValueOnce(comTrabalho as any);
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));
    await screen.findByText(/trechos mantidos/i);

    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
    await waitFor(() => {
      const cuts = streamSSE.mock.calls.filter((c) => String(c[0]).includes("/cut"));
      expect(cuts.length).toBe(2);
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  // espelho do teste equivalente do refino: os resets moram no done (só no
  // sucesso) — um corte que falha não pode zerar o aviso da próxima tentativa
  it("corte que falha mantém o aviso para a próxima tentativa", async () => {
    getJob.mockResolvedValueOnce(comTrabalho as any);
    render(<CutsStep {...props} />);
    fireEvent.click(await esperarBotao());

    streamSSE.mockImplementationOnce(async (_url: string, _opts: any, on: any) => {
      on.error?.({ detail: "falha simulada" });
    });
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));
    await screen.findByText(/falha simulada/i);

    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
    expect(await screen.findByText(/refaz o corte/i)).toBeInTheDocument();
    expect(streamSSE.mock.calls.filter((c) => String(c[0]).includes("/cut")).length).toBe(1);
  });

  it("o corte novo limpa as marcações da timeline antiga", async () => {
    // marcações de corte manual referenciam o trimmed anterior, que o
    // Detectar pausas acabou de substituir
    getJob.mockResolvedValueOnce(comTrabalho as any);
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 6 }], trimmed_mtime: 5,
    } as any);
    const { container } = render(<CutsStep {...props} />);
    await screen.findByText(/trechos mantidos/i);
    const video = container.querySelector("video") as HTMLVideoElement;
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    expect(screen.getByRole("button", { name: /remover trecho 1/i })).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /detectar pausas/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));
    fireEvent.click(await screen.findByRole("button", { name: /descartar e cortar/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /remover trecho 1/i })).not.toBeInTheDocument());
  });
});

describe("CutsStep — um corte por vez", () => {
  // corte e refino reescrevem o mesmo trimmed.mp4 no servidor; disparar os
  // dois ao mesmo tempo é corrida de escrita. Cada botão trava enquanto o
  // outro trabalha.
  async function montarComTrechoMarcado() {
    getCuts.mockResolvedValueOnce({
      original_duration: 10, trimmed_duration: 6,
      segments: [{ start: 0, end: 6 }], trimmed_mtime: 5,
    } as any);
    const { container } = render(<CutsStep {...props} />);
    await screen.findByText(/trechos mantidos/i);
    const video = container.querySelector("video") as HTMLVideoElement;
    video.currentTime = 1;
    fireEvent.click(screen.getByRole("button", { name: /marcar início/i }));
    video.currentTime = 3;
    fireEvent.click(screen.getByRole("button", { name: /marcar fim/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /aplicar cortes/i })).not.toBeDisabled());
  }

  it("com refino em andamento, Detectar pausas fica desabilitado", async () => {
    await montarComTrechoMarcado();
    // refino pendurado: nunca resolve, refining fica true
    streamSSE.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: /aplicar cortes/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /detectar pausas/i })).toBeDisabled());
  });

  it("com corte em andamento, não há Aplicar cortes para clicar", async () => {
    // onCut zera o result no início, o que desmonta o painel de cortes
    // manuais — este teste trava esse invariante: se o setResult(null) sair
    // um dia, o botão precisa passar a ser desabilitado por busy
    await montarComTrechoMarcado();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /detectar pausas/i })).not.toBeDisabled());
    // corte pendurado: nunca resolve, busy fica true
    streamSSE.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: /detectar pausas/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /aplicar cortes/i })).not.toBeInTheDocument());
  });
});
