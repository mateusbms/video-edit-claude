import { describe, it, expect, vi } from "vitest";
import { parseSSEChunk, getOverlays, putOverlays, generateSuggestions, streamSSE } from "../api";

describe("parseSSEChunk", () => {
  it("decodifica event+data", () => {
    const out = parseSSEChunk('event: progress\ndata: {"n":1,"total":10}\n\n');
    expect(out).toEqual([
      { event: "progress", data: { n: 1, total: 10 } },
    ]);
  });

  it("decodifica vários eventos numa mesma chunk", () => {
    const out = parseSSEChunk(
      'event: progress\ndata: {"n":1,"total":10}\n\nevent: done\ndata: {"ok":true}\n\n',
    );
    expect(out.length).toBe(2);
    expect(out[1].event).toBe("done");
  });

  it("ignora linhas incompletas (sem data)", () => {
    const out = parseSSEChunk("event: progress\n\n");
    expect(out).toEqual([]);
  });
});

describe("overlays api", () => {
  it("putOverlays faz PUT com o payload e getOverlays faz GET", async () => {
    const calls: any[] = [];
    const fetchMock = vi.fn(async (url: string, init?: any) => {
      calls.push({ url, init });
      if (init?.method === "PUT") return { ok: true, json: async () => ({ ok: true }) } as any;
      return { ok: true, json: async () => ([{ id: "ov_a", text: "x" }]) } as any;
    });
    vi.stubGlobal("fetch", fetchMock);
    await putOverlays("s1", [{ id: "ov_a", text: "x", fromFrame: 0, durationInFrames: 10 } as any]);
    const got = await getOverlays("s1");
    vi.unstubAllGlobals();
    const put = calls.find((c) => c.init?.method === "PUT");
    expect(put.url).toBe("/api/jobs/s1/overlays");
    expect(JSON.parse(put.init.body)[0].id).toBe("ov_a");
    expect(got[0].id).toBe("ov_a");
  });
});

describe("streamSSE", () => {
  // achado Important da revisão final: um 409 escrito com cuidado pelo backend
  // (ex.: "vídeo original apagado, resta o corte manual") chegava na tela como
  // "SSE falhou (409)" — o corpo da resposta nunca era lido.
  it("num erro HTTP, rejeita com o `detail` do corpo JSON, não com 'SSE falhou'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => (
      { ok: false, status: 409, json: async () => ({ detail: "mensagem específica" }) } as any
    )));
    await expect(streamSSE("/api/jobs/s1/cut", {}, {})).rejects.toThrow("mensagem específica");
    vi.unstubAllGlobals();
  });

  it("sem corpo JSON utilizável, cai na mensagem de status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => (
      { ok: false, status: 500, json: async () => { throw new Error("não é JSON"); } } as any
    )));
    await expect(streamSSE("/api/jobs/s1/cut", {}, {})).rejects.toThrow("SSE falhou (500)");
    vi.unstubAllGlobals();
  });
});

describe("generateSuggestions", () => {
  it("faz POST /suggest e devolve a lista gerada", async () => {
    const calls: any[] = [];
    const fetchMock = vi.fn(async (url: string, init?: any) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ([{ id: "sug_01", text: "gerada" }]) } as any;
    });
    vi.stubGlobal("fetch", fetchMock);
    const got = await generateSuggestions("s1");
    vi.unstubAllGlobals();
    const post = calls.find((c) => c.init?.method === "POST");
    expect(post.url).toBe("/api/jobs/s1/suggest");
    expect(got[0].id).toBe("sug_01");
  });

  it("propaga a mensagem de erro do backend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => (
      { ok: false, statusText: "erro", json: async () => ({ detail: "claude não encontrado" }) } as any
    )));
    await expect(generateSuggestions("s1")).rejects.toThrow(/claude não encontrado/);
    vi.unstubAllGlobals();
  });
});
