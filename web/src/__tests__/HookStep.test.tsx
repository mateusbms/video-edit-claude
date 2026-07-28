import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { HookStep } from "../steps/HookStep";

afterEach(cleanup);

function mockFetch() {
  const calls: any[] = [];
  const f = vi.fn(async (url: string, init?: any) => {
    calls.push({ url, init });
    if (url.endsWith("/hook") && (!init || !init.method || init.method === "GET"))
      return { ok: true, json: async () => ({ title: "T", subtitle: "", duration_frames: 90 }) } as any;
    if (url.endsWith("/transcript"))
      return { ok: true, json: async () => [] } as any;
    if (url.match(/\/jobs\/[^/]+$/) && (!init || !init.method))
      return { ok: true, json: async () => ({ slug: "s1", captionStyle: { fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" }, probe: { fps: 30 } }) } as any;
    return { ok: true, json: async () => ({ ok: true }) } as any;
  });
  vi.stubGlobal("fetch", f);
  return calls;
}

const props = { slug: "s1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("HookStep", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mostra os controles de estilo do hook", async () => {
    mockFetch();
    render(<HookStep {...props} />);
    expect(await screen.findByLabelText(/tamanho do hook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fonte do hook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ancora do hook/i)).toBeInTheDocument();
  });

  it("mount sem edição não salva (sem PUT /hook nem recipe)", async () => {
    vi.useFakeTimers();
    try {
      const calls = mockFetch();
      render(<HookStep {...props} />);
      await vi.advanceTimersByTimeAsync(1500);
      expect(calls.find((c) => c.init?.method === "PUT" && c.url.endsWith("/hook"))).toBeFalsy();
      expect(calls.find((c) => c.init?.method === "POST" && c.url.endsWith("/recipe"))).toBeFalsy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("mudar o tamanho persiste via PUT /hook (debounce)", async () => {
    const calls = mockFetch();
    render(<HookStep {...props} />);
    const range = await screen.findByLabelText(/tamanho do hook/i);
    fireEvent.change(range, { target: { value: "120" } });
    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === "PUT" && c.url.endsWith("/hook"));
      expect(put).toBeTruthy();
      expect(JSON.parse(put.init.body).fontSize).toBe(120);
    }, { timeout: 2000 });
  });

  it("tem o controle de largura do hook", async () => {
    mockFetch();
    render(<HookStep {...props} />);
    expect(await screen.findByLabelText(/largura do hook/i)).toBeInTheDocument();
  });

  it("hook anima com o play: some quando o vídeo passa da janela", async () => {
    mockFetch();
    const { container } = render(<HookStep {...props} />);
    // pausado em t=0 (selecionado) → hook visível
    expect(await screen.findByText("T")).toBeInTheDocument();
    const video = container.querySelector("video") as HTMLVideoElement;
    fireEvent.play(video);
    Object.defineProperty(video, "currentTime", { value: 10, configurable: true });
    fireEvent.timeUpdate(video); // frame 300 > janela (90) → some
    expect(screen.queryByText("T")).not.toBeInTheDocument();
  });
});
