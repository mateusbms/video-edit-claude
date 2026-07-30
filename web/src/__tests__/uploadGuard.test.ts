import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadJob, listJobs, SlugOcupado } from "../api";

afterEach(() => vi.unstubAllGlobals());

const resumo = {
  slug: "A1", title: "", updated_at: 0, orientation: "9x16",
  has_source: true, has_trimmed: true, has_transcript: true,
  has_hook: false, has_recipe: false,
  has_render_16x9: false, has_render_9x16: false,
  bytes_source: 100, bytes_total: 150,
};

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("listJobs", () => {
  it("devolve a lista do backend", async () => {
    stubFetch(200, [resumo]);
    expect((await listJobs())[0].slug).toBe("A1");
  });
});

describe("uploadJob", () => {
  it("no 409, lança SlugOcupado carregando o projeto existente", async () => {
    stubFetch(409, { detail: resumo });
    await expect(uploadJob([], "A1")).rejects.toBeInstanceOf(SlugOcupado);
    try {
      await uploadJob([], "A1");
    } catch (e) {
      expect((e as SlugOcupado).existente.has_transcript).toBe(true);
    }
  });

  it("manda overwrite=false por padrão", async () => {
    const f = stubFetch(200, { slug: "A1", probe: null });
    await uploadJob([], "A1");
    const fd = (f.mock.calls[0] as any[])[1].body as FormData;
    expect(fd.get("overwrite")).toBe("false");
  });

  it("manda overwrite=true quando pedido", async () => {
    const f = stubFetch(200, { slug: "A1", probe: null });
    await uploadJob([], "A1", true);
    const fd = (f.mock.calls[0] as any[])[1].body as FormData;
    expect(fd.get("overwrite")).toBe("true");
  });
});
