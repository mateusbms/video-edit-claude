import { describe, it, expect, vi, afterEach } from "vitest";
import { uploadJob } from "../api";

afterEach(() => vi.restoreAllMocks());

describe("uploadJob", () => {
  it("envia todos os arquivos no campo 'files' na ordem", async () => {
    const captured: FormData[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      captured.push(init.body as FormData);
      return { ok: true, json: async () => ({ slug: "s", probe: {} }) } as Response;
    }));
    const a = new File(["a"], "a.mp4", { type: "video/mp4" });
    const b = new File(["b"], "b.mp4", { type: "video/mp4" });
    await uploadJob([a, b], "s");
    const names = captured[0].getAll("files").map((f) => (f as File).name);
    expect(names).toEqual(["a.mp4", "b.mp4"]);
    expect(captured[0].get("slug")).toBe("s");
  });
});
