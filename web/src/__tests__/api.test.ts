import { describe, it, expect, vi } from "vitest";
import { parseSSEChunk, getOverlays, putOverlays } from "../api";

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
