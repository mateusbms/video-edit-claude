import { describe, it, expect, vi, afterEach } from "vitest";
import { putTitle, deleteJob, deleteSource } from "../api";

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status = 200, body: unknown = { ok: true }) {
  const f = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("putTitle", () => {
  it("manda o título no corpo", async () => {
    const f = stubFetch();
    await putTitle("A1", "Check-up da carteira");
    const [url, init] = f.mock.calls[0] as any[];
    expect(url).toContain("/jobs/A1/title");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ title: "Check-up da carteira" });
  });
});

describe("deleteJob", () => {
  it("chama DELETE no projeto", async () => {
    const f = stubFetch();
    await deleteJob("A1");
    const [url, init] = f.mock.calls[0] as any[];
    expect(url).toContain("/jobs/A1");
    expect(init.method).toBe("DELETE");
  });

  it("propaga erro do servidor", async () => {
    stubFetch(404, { detail: "projeto não encontrado" });
    await expect(deleteJob("sumiu")).rejects.toThrow(/não encontrado/);
  });
});

describe("deleteSource", () => {
  it("chama DELETE no source", async () => {
    const f = stubFetch();
    await deleteSource("A1");
    const [url, init] = f.mock.calls[0] as any[];
    expect(url).toContain("/jobs/A1/source");
    expect(init.method).toBe("DELETE");
  });
});
