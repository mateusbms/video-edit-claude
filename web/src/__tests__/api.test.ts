import { describe, it, expect } from "vitest";
import { parseSSEChunk } from "../api";

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
